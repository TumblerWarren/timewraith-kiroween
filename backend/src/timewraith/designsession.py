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
            "date, value. claim: what the experiment tests. Code reruns the baseline check."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"fields": {"type": "array", "items": _STR}, "claim": _STR},
            "required": ["fields", "claim"],
        },
    },
]

EventSink = Callable[[str, dict[str, object]], None]


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
    calls: int = 0
    runs: int = 0
    checks_run: int = 0
    rejections: int = 0
    rewrites: int = 0
    submitted: tuple[list[OutputField], str] | None = None
    rejected_reason: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)
    tools: list[dict[str, Any]] = field(default_factory=lambda: DESIGN_TOOLS)

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

    def call(self, name: str, args: dict[str, Any]) -> str:
        with self.lock:
            if self.submitted is not None:
                raise ToolError("Already submitted. Stop here.")
            over = self.calls >= self.max_calls or time.monotonic() > self.deadline
            if over and name != "submit_adapter":
                raise ToolError("The tool budget is used up. Call submit_adapter now.")
            self.calls += 1
            handlers: dict[str, Callable[[], str]] = {
                "list_files": lambda: self.list_files(args.get("glob")),
                "read_file": lambda: self.read_file(args.get("path"), args.get("start"), args.get("end")),
                "search": lambda: self.search(args.get("pattern"), args.get("glob")),
                "write_adapter": lambda: self.write_adapter(args.get("code")),
                "run_adapter": lambda: self.run_adapter(args.get("zone"), args.get("instant")),
                "check_baseline": lambda: self.check_baseline(args.get("fields")),
                "submit_adapter": lambda: self.submit_adapter(args.get("fields"), args.get("claim")),
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
    return DesignSession(token=secrets.token_urlsafe(32), **kw)


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
    if name == "submit_adapter":
        return f"submitted the adapter with fields {', '.join(str(f) for f in (args.get('fields') or []))[:80]}"
    return name.replace("_", " ")


def run_body(adapter_path: str) -> str:
    """Probe body that loads the adapter and shows what run(ctx) returns at the frozen clock."""
    mod = re.sub(r"\.(ts|js|mjs|cjs|tsx)$", "", adapter_path)
    return (
        f"const m = await load({mod!r});\n"
        "const a = m && m.default && typeof m.default.run === 'function' ? m.default : m;\n"
        "const out = await a.run({ now: new Date(Date.now()), tz: process.env.TZ || 'UTC' });\n"
        "print('now', new Date(Date.now()), 'zone', process.env.TZ);\n"
        "for (const [k, v] of Object.entries(out || {})) print(k, '=', v);"
    )
