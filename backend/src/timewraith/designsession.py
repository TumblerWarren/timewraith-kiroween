"""Design sessions: Pumpkin Mechanic's workshop for one adapter that failed its baseline check.

Opened after the user approved the plan and dependencies are installed, only for an adapter whose baseline run
had problems: it threw, did not return its fields, or broke a rule at ordinary instants (which means a field
does not mean what the rule says). Pumpkin reads the code, runs the adapter at points he picks, rewrites it, and
checks the baseline again. His tools are the only way in (MCP proxy, token-gated endpoint), as for Doctor Stitch.

Pumpkin proposes; code decides. `submit_adapter` hands the final fields to the pipeline, which reruns the baseline
check: a submission with baseline problems goes back to him with the problems, up to MAX_REJECTIONS times.
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, get_args

from .fixsession import READ_TOOLS, RepoReader, ToolError, _cap
from .models import OutputField
from .sandbox import ProbeResult
from .verifysession import Point, point_ms

MAX_ADAPTER_CHARS = 12_000
MAX_REJECTIONS = 2
FIELDS = set(get_args(OutputField))

_STR = {"type": "string"}
DESIGN_TOOLS: list[dict[str, Any]] = [
    *READ_TOOLS,
    {
        "name": "write_adapter",
        "description": (
            "Replace the adapter with new code. It must define run(ctx), where ctx.now is the frozen current time "
            "(a Date) and ctx.tz the sweep zone, and return an object with the fields you will submit. Use the "
            "module style of the current adapter."
        ),
        "inputSchema": {"type": "object", "properties": {"code": _STR}, "required": ["code"]},
    },
    {
        "name": "run_adapter",
        "description": (
            "Run the current adapter once in the sandbox with the clock frozen at `instant` and the process time "
            "zone `zone`, and show what run(ctx) returned."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"zone": _STR, "instant": _STR},
            "required": ["zone", "instant"],
        },
    },
    {
        "name": "check_baseline",
        "description": (
            "Run the baseline check code will run on submit: the adapter at ordinary instants in UTC and "
            "America/New_York, its fields, and every rule its fields feed. Lists the problems, or says it is clean."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"fields": {"type": "array", "items": _STR}},
            "required": ["fields"],
        },
    },
    {
        "name": "submit_adapter",
        "description": (
            "Finish with the current adapter. fields: the output fields run() returns, from instant, next, flag, "
            "date, value, after_cancel, timeout_trace, interval_trace, expiry_trace, clock_jumps, calendar_cases. "
            "claim: what the experiment tests. Code reruns the baseline check."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"fields": {"type": "array", "items": _STR}, "claim": _STR},
            "required": ["fields", "claim"],
        },
    },
]

REPAIR_SHELL_TOOLS = [
    {
        "name": "run_command",
        "description": (
            "Run shell commands in the case sandbox. /work is the original checkout, and the current directory "
            "is a writable copy preserved between commands. Inspect runner logs, edit any files in the copy, "
            "and run its tests. Use save_fixture to carry working fixtures into the verified experiment."
        ),
        "inputSchema": {"type": "object", "properties": {"command": _STR}, "required": ["command"]},
    },
    {
        "name": "save_fixture",
        "description": (
            "Save a text fixture in the experiment's generated fixture directory. Returns its checkout-relative "
            "path. Reference it from the adapter or runner config and check_baseline."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"name": _STR, "content": _STR},
            "required": ["name", "content"],
        },
    },
]

VITEST_CONFIG_TOOL = {
    "name": "write_runner_config",
    "description": (
        "Save an experiment-only Vitest configuration as an ES module. Inspect the repository runner config "
        "and error output first. Export a default config with the current checkout as its root and collect both "
        "the generated harness and __tw__/probe.tw.test.ts or .js. Preserve the aliases and setup the tests need. "
        "Use an empty string to return to the repository config. Then run_adapter and check_baseline."
    ),
    "inputSchema": {"type": "object", "properties": {"code": _STR}, "required": ["code"]},
}

REPORT_BLOCKED_TOOL = {
    "name": "report_blocked",
    "description": (
        "Say that this experiment cannot run in this environment for a reason outside the adapter, and give the "
        "reason: the code under test needs something the runtime lacks (a global such as Temporal, a package that is "
        "not installed) and the sandbox has no network to get it. Code checks the claim against the failure it sees "
        "and against what was measured about the runtime. Use it instead of testing a different function. Do not use "
        "it because the adapter is hard to write: the claim is refused when the adapter could still fix the failure."
    ),
    "inputSchema": {"type": "object", "properties": {"reason": _STR}, "required": ["reason"]},
}
EventSink = Callable[[str, dict[str, object]], None]


def repair_shell_command(run: Callable[[str, int], str], command: object, deadline: float) -> str:
    if not isinstance(command, str) or not command.strip() or "\0" in command or len(command) > 20_000:
        raise ToolError("Give a shell command under 20,000 characters")
    left = int(deadline - time.monotonic())
    if left <= 0:
        raise ToolError("Repair time budget exhausted")
    return run(command, left)


def repair_fixture(save: Callable[[str, str], str], name: object, content: object) -> str:
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+", name):
        raise ToolError("Give a simple fixture filename such as calendar.json")
    if not isinstance(content, str) or len(content.encode("utf8")) > 256_000:
        raise ToolError("Give fixture text up to 256 KB")
    return save(name, content)


def valid_fields(fields: object) -> list[OutputField]:
    if not isinstance(fields, list) or not fields or not all(isinstance(f, str) for f in fields):
        raise ToolError(f"Give fields as a list from {sorted(FIELDS)}")
    bad = [f for f in fields if f not in FIELDS]
    if bad:
        raise ToolError(f"Unknown field(s) {bad}; use {sorted(FIELDS)}")
    return list(dict.fromkeys(fields))


@dataclass
class DesignSession(RepoReader):
    token: str
    ws: Path
    tracked: frozenset[str]
    extra_readable: frozenset[str]
    adapter_path: str
    on_event: EventSink
    deadline: float
    max_calls: int
    max_runs: int
    max_checks: int
    write: Callable[[str], None]  # saves new adapter code (adds the TypeScript header)
    run_once: Callable[[str, int], ProbeResult]  # (zone, epoch ms) -> what run() returned
    baseline: Callable[[list[OutputField]], list[str]]  # fields -> problems ([] when clean)
    repair_command: Callable[[str, int], str] | None = None
    save_fixture: Callable[[str, str], str] | None = None
    configure_runner: Callable[[str], None] | None = None
    # reason -> None when the claim stands, else why it is refused (the pipeline: the failure must be the environment's)
    blocked_check: Callable[[str], str | None] | None = None
    calls: int = 0
    runs: int = 0
    checks_run: int = 0
    rejections: int = 0
    rewrites: int = 0
    submitted: tuple[list[OutputField], str] | None = None
    blocked: str | None = None  # the agent's reason, once code agreed the experiment cannot run here
    rejected_reason: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)
    tools: list[dict[str, Any]] = field(default_factory=lambda: DESIGN_TOOLS)

    def run_command(self, command: object) -> str:
        if self.repair_command is None:
            raise ToolError("No repair workspace is available")
        return repair_shell_command(self.repair_command, command, self.deadline)

    def write_fixture(self, name: object, content: object) -> str:
        if self.save_fixture is None:
            raise ToolError("No fixture directory is available")
        return repair_fixture(self.save_fixture, name, content)

    def write_runner_config(self, code: object) -> str:
        if self.configure_runner is None:
            raise ToolError("Runner configuration is available for Vitest experiments")
        if not isinstance(code, str) or len(code) > MAX_ADAPTER_CHARS:
            raise ToolError(f"Give an ES module under {MAX_ADAPTER_CHARS} characters")
        self.configure_runner(code)
        return "Runner configuration updated. Test it with run_adapter, then check_baseline."

    def write_adapter(self, code: object) -> str:
        if not isinstance(code, str) or not code.strip():
            raise ToolError("Give the adapter code")
        if len(code) > MAX_ADAPTER_CHARS:
            raise ToolError(f"Keep the adapter under {MAX_ADAPTER_CHARS} characters")
        if not re.search(r"\brun\b", code):
            raise ToolError("The adapter must define run(ctx)")
        self.write(code)
        self.rewrites += 1
        return f"Saved {self.adapter_path}. Run it with run_adapter, then check_baseline."

    def run_adapter(self, zone: object, instant: object) -> str:
        if self.runs >= self.max_runs:
            raise ToolError(f"The adapter has been run {self.max_runs} times; use check_baseline or submit")
        ms = point_ms(Point(zone=str(zone or ""), instant=str(instant or "")))
        self.runs += 1
        r = self.run_once(str(zone), ms)
        head = {"passed": "RAN", "check_failed": "RAN", "error": "ERROR", "timeout": "TIMED OUT"}
        return f"{head.get(r.status, r.status)} (run {self.runs} of {self.max_runs})\n" + ("\n".join(r.out) or "")

    def check_baseline(self, fields: object) -> str:
        fs = valid_fields(fields)
        if self.checks_run >= self.max_checks:
            raise ToolError(f"The baseline check has run {self.max_checks} times; submit your adapter")
        self.checks_run += 1
        problems = self.baseline(fs)
        which = f"(check {self.checks_run} of {self.max_checks})"
        return f"CLEAN {which}" if not problems else f"PROBLEMS {which}\n" + "\n".join(f"- {p}" for p in problems)

    def submit_adapter(self, fields: object, claim: object) -> str:
        fs = valid_fields(fields)
        text = str(claim or "").strip()
        if not text:
            raise ToolError("Give a claim: what the experiment tests")
        problems = self.baseline(fs)
        if problems and self.rejections < MAX_REJECTIONS:
            self.rejections += 1
            raise ToolError(
                "Not accepted: the baseline check still has problems:\n"
                + "\n".join(f"- {p}" for p in problems)
                + f"\nFix the adapter and submit again ({MAX_REJECTIONS - self.rejections + 1} submission(s) left)."
            )
        self.submitted = (fs, text)
        self.rejected_reason = "; ".join(problems)[:400] if problems else None
        return "Adapter recorded." + (" It did not pass the baseline check." if problems else "") + " Stop here."

    def report_blocked(self, reason: object) -> str:
        text = str(reason or "").strip()
        if not text:
            raise ToolError("Give the reason: what the code under test needs that this environment lacks")
        if self.blocked_check is None:
            raise ToolError("Reporting an experiment blocked is not available here")
        refused = self.blocked_check(text[:600])
        if refused:
            raise ToolError(f"Not accepted: {refused}")
        self.blocked = text[:600]
        return "Recorded: this experiment is blocked by the environment. Stop here."

    def call(self, name: str, args: dict[str, Any]) -> str:
        with self.lock:
            if self.submitted is not None or self.blocked is not None:
                raise ToolError("Already finished. Stop here.")
            over = self.calls >= self.max_calls or time.monotonic() > self.deadline
            if over and name not in {"submit_adapter", "report_blocked"}:
                raise ToolError("The tool budget is used up. Call submit_adapter now.")
            self.calls += 1
            handlers: dict[str, Callable[[], str]] = {
                "list_files": lambda: self.list_files(args.get("glob")),
                "read_file": lambda: self.read_file(args.get("path"), args.get("start"), args.get("end")),
                "search": lambda: self.search(args.get("pattern"), args.get("glob")),
                "run_command": lambda: self.run_command(args.get("command")),
                "save_fixture": lambda: self.write_fixture(args.get("name"), args.get("content")),
                "write_runner_config": lambda: self.write_runner_config(args.get("code")),
                "write_adapter": lambda: self.write_adapter(args.get("code")),
                "run_adapter": lambda: self.run_adapter(args.get("zone"), args.get("instant")),
                "check_baseline": lambda: self.check_baseline(args.get("fields")),
                "submit_adapter": lambda: self.submit_adapter(args.get("fields"), args.get("claim")),
                "report_blocked": lambda: self.report_blocked(args.get("reason")),
            }
            fn = handlers.get(name)
            if fn is None:
                raise ToolError(f"Unknown tool {name}")
            try:
                result = fn()
            except ToolError as e:
                self.on_event(
                    f"{name}: {e}"[:300], {"tool": name, "ok": False, "calls": self.calls, "max_calls": self.max_calls}
                )
                raise
            except TypeError as e:
                raise ToolError(f"Bad arguments for {name}: {e}") from e
            self.on_event(
                _describe(name, args, result),
                {"tool": name, "ok": True, "calls": self.calls, "max_calls": self.max_calls},
            )
            return _cap(result)


def open_session(**kw: Any) -> DesignSession:
    session = DesignSession(token=secrets.token_urlsafe(32), **kw)
    if session.repair_command is not None:
        session.tools = [*session.tools, *REPAIR_SHELL_TOOLS]
    if session.configure_runner is not None:
        session.tools = [*session.tools, VITEST_CONFIG_TOOL]
    if session.blocked_check is not None:
        session.tools = [*session.tools, REPORT_BLOCKED_TOOL]
    return session


def _describe(name: str, args: dict[str, Any], result: str) -> str:
    first = result.splitlines()[0] if result else ""
    if name == "run_adapter":
        return f"ran the adapter at {str(args.get('instant'))[:30]} in {str(args.get('zone'))[:40]}: {first}"
    if name == "check_baseline":
        return f"checked the baseline: {first}"
    if name == "write_adapter":
        return "rewrote the adapter"
    if name == "read_file":
        return f"read {str(args.get('path'))[:120]}"
    if name == "search":
        return f"searched for {str(args.get('pattern', ''))[:80]!r}"
    if name == "report_blocked":
        return f"reported the experiment blocked: {str(args.get('reason', ''))[:120]}"
    if name == "submit_adapter":
        return f"submitted the adapter with fields {', '.join(str(f) for f in (args.get('fields') or []))[:80]}"
    return name.replace("_", " ")


def run_body(adapter_path: str) -> str:
    """Probe body that loads the adapter and shows what run(ctx) returns at the frozen clock."""
    mod = re.sub(r"\.(ts|js|mjs|cjs|tsx)$", "", adapter_path)
    return (
        f"const m = await load({mod!r});\n"
        "const a = m && m.default && typeof m.default.run === 'function' ? m.default : m;\n"
        "const out = await a.run({ now: new Date(Date.now()), tz: process.env.TZ || 'UTC', "
        "cancelledRetry, timerTrace, expiryTrace, clockJumps, atClock });\n"
        "print('now', new Date(Date.now()), 'zone', process.env.TZ);\n"
        "for (const [k, v] of Object.entries(out || {})) print(k, '=', v);"
    )
