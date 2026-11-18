"""Install sessions: the install mechanic repairs a dependency install that failed, however it failed.

Installing is the first step of every case, so the agent is not boxed in here. When an install fails and code's quick
fixes (installfix.py) do not heal it, the agent works like a developer who got a broken checkout: it reads the failure,
runs any commands it needs in the install sandbox, switches the Node version, and tries again, for as long as the time
budget allows and across several rounds. There is no list of allowed actions and no small command count.

What stays fixed is the sandbox, not the agent's choices. It is the same throwaway container as every install: Docker
with all capabilities dropped, a read-only root, no Docker socket, memory and process limits, no secrets, and only the
case's own workspace folder mounted. Its network is on, because installing needs it.

The agent proposes; code decides. `submit_install` runs code's own check (the test runner starts in a container
without network); a submission that fails it goes back to the agent for as long as it has budget left. Changes to files
the repository tracks are undone by the pipeline afterwards, so a fix's diff stays the repository's own.
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .fixsession import READ_TOOLS, RepoReader, ToolError, _cap

MAX_COMMAND_CHARS = 20_000
OUTPUT_TAIL = 6000
_NODE = re.compile(r"^\d{1,2}(\.\d{1,3}){0,2}$")  # any Node version that has an image: 14, 16, 22.11, 24
_STR = {"type": "string"}

INSTALL_TOOLS: list[dict[str, Any]] = [
    *READ_TOOLS,
    {
        "name": "run_command",
        "description": (
            "Run one shell command in the install sandbox: a throwaway Debian container with Node, the repository "
            "at /work (you may write there), network on, no root and no other mounts. HOME and the caches are in "
            "memory and are gone after each command, so make every command complete by itself (corepack shims for "
            "yarn and pnpm are already in /tmp/bin, which is on PATH). Shows the exit code and the end of the "
            "output. Use it to look (ls, cat, node --version, the package manager's version), to install, and to "
            "retry with a change. Chain steps with && in one command when a later step needs an earlier one."
        ),
        "inputSchema": {"type": "object", "properties": {"command": _STR}, "required": ["command"]},
    },
    {
        "name": "use_node",
        "description": (
            "Switch the Node version of later commands (and of every later sandbox run on this repository). Any "
            "version that has an official node image, for example 14, 16, 18, 20, 22 or 24."
        ),
        "inputSchema": {"type": "object", "properties": {"version": _STR}, "required": ["version"]},
    },
    {
        "name": "check_install",
        "description": (
            "Run the check code will run on submit: the repository's test runner (jest or vitest) must be installed "
            "and start in a container without network. Says OK or what is missing."
        ),
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "submit_install",
        "description": (
            "Finish. summary: what was wrong and what fixed it, or what you found if you could "
            "not fix it. Code runs the check again; while it fails and you have budget left you get the reason and "
            "keep working."
        ),
        "inputSchema": {"type": "object", "properties": {"summary": _STR}, "required": ["summary"]},
    },
]

EventSink = Callable[[str, dict[str, object]], None]


@dataclass
class CommandResult:
    code: int
    out: str
    timed_out: bool = False


@dataclass
class InstallSession(RepoReader):
    token: str
    ws: Path
    tracked: frozenset[str]
    extra_readable: frozenset[str]
    node: str
    on_event: EventSink
    deadline: float
    max_calls: int
    max_commands: int
    command_timeout_s: int
    run: Callable[[str, str, int], CommandResult]  # (node, command, timeout) -> result
    check: Callable[[str], tuple[bool, str]]  # node -> (installed and starts, detail)
    calls: int = 0
    log: list[tuple[str, str, int]] = field(default_factory=list)  # (node, command, exit code)
    submitted: tuple[str, bool, str] | None = None  # (summary, check passed, detail)
    lock: threading.Lock = field(default_factory=threading.Lock)
    tools: list[dict[str, Any]] = field(default_factory=lambda: INSTALL_TOOLS)

    def _time_left(self) -> int:
        return int(self.deadline - time.monotonic())

    def _out_of_budget(self) -> bool:
        return self.calls > self.max_calls or self._time_left() <= 0

    def run_command(self, command: object) -> str:
        if not isinstance(command, str) or not command.strip():
            raise ToolError("Give the command to run")
        if len(command) > MAX_COMMAND_CHARS or "\0" in command:
            raise ToolError(f"Keep the command under {MAX_COMMAND_CHARS} characters, on plain text")
        if len(self.log) >= self.max_commands:
            raise ToolError(f"{self.max_commands} commands have run; call check_install and submit_install now")
        left = self._time_left()
        if left < 30:
            raise ToolError("The time for this repair is used up; call submit_install now")
        r = self.run(self.node, command, min(self.command_timeout_s, left))
        self.log.append((self.node, command.strip(), r.code))
        head = "TIMED OUT" if r.timed_out else f"exit code {r.code}"
        tail = r.out[-OUTPUT_TAIL:] if r.out else "(no output)"
        return f"{head} (command {len(self.log)}, Node {self.node})\n{tail}"

    def use_node(self, version: object) -> str:
        v = str(version or "").strip()
        if not _NODE.match(v):
            raise ToolError("Give a Node version such as 16, 18, 20, 22 or 24")
        self.node = v
        return f"Later commands run on Node {v}."

    def check_install(self) -> str:
        ok, detail = self.check(self.node)
        return ("OK: " if ok else "NOT READY: ") + detail

    def submit_install(self, summary: object) -> str:
        text = str(summary or "").strip()
        if not text:
            raise ToolError("Give a summary: what was wrong and what fixed it")
        ok, detail = self.check(self.node)
        if not ok and not self._out_of_budget():
            raise ToolError(
                f"Not accepted: {detail}\nKeep working: there is budget left, and a failed check is not final."
            )
        self.submitted = (text, ok, detail)
        return "Recorded." + ("" if ok else " The check still fails.") + " Stop here."

    def call(self, name: str, args: dict[str, Any]) -> str:
        with self.lock:
            if self.submitted is not None:
                raise ToolError("Already submitted. Stop here.")
            self.calls += 1
            if self._out_of_budget() and name != "submit_install":
                raise ToolError("The budget for this repair is used up. Call submit_install now.")
            handlers: dict[str, Callable[[], str]] = {
                "list_files": lambda: self.list_files(args.get("glob")),
                "read_file": lambda: self.read_file(args.get("path"), args.get("start"), args.get("end")),
                "search": lambda: self.search(args.get("pattern"), args.get("glob")),
                "run_command": lambda: self.run_command(args.get("command")),
                "use_node": lambda: self.use_node(args.get("version")),
                "check_install": self.check_install,
                "submit_install": lambda: self.submit_install(args.get("summary")),
            }
            fn = handlers.get(name)
            if fn is None:
                raise ToolError(f"Unknown tool {name}")
            try:
                result = fn()
            except ToolError as e:
                self.on_event(f"{name}: {e}"[:300], {"tool": name, "ok": False, "calls": self.calls})
                raise
            except TypeError as e:
                raise ToolError(f"Bad arguments for {name}: {e}") from e
            self.on_event(_describe(name, args, result), {"tool": name, "ok": True, "calls": self.calls})
            return _cap(result)


def open_session(**kw: Any) -> InstallSession:
    return InstallSession(token=secrets.token_urlsafe(32), **kw)


def _describe(name: str, args: dict[str, Any], result: str) -> str:
    first = result.splitlines()[0] if result else ""
    if name == "run_command":
        return f"ran `{str(args.get('command'))[:140]}`: {first}"
    if name == "use_node":
        return f"switched to Node {args.get('version')}"
    if name == "check_install":
        return f"checked the install: {first[:160]}"
    if name == "read_file":
        return f"read {str(args.get('path'))[:120]}"
    if name == "search":
        return f"searched for {str(args.get('pattern', ''))[:80]!r}"
    if name == "submit_install":
        return f"submitted: {str(args.get('summary', ''))[:160]}"
    return name.replace("_", " ")
