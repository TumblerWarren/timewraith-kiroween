"""Verification sessions: the tools Raven Archivist uses to investigate one repeated violation.

A session is one Kiro CLI run with the `tw-raven-archivist` profile, whose only tools are these (through the MCP
proxy, like Doctor Stitch's fix tools). Raven reads the repository, runs probes against the real code with the
clock frozen at points she picks, runs the repository's own tests, searches public issues, and submits a verdict.

Raven proposes; code decides. `submit_verdict` hands the verdict to the pipeline's checks (pipeline._check_verdict):
a defect needs a reproduction whose check fails 3/3 at the failing point and passes at a control point, plus cited
source lines that exist. A rejected verdict goes back to her with the reason, so she can correct it in the same
session, up to MAX_REJECTIONS times.
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, ValidationError

from . import sweep as S
from .fixsession import READ_TOOLS, RepoReader, ToolError, _cap
from .models import Evidence, keep_first
from .sandbox import ProbeResult

MAX_PROBE_CHARS = 4000
MAX_REJECTIONS = 2


class Point(BaseModel):
    zone: str = Field(max_length=64, description="IANA time zone, used as the process zone (TZ)")
    instant: str = Field(max_length=40, description="ISO 8601 instant with offset, such as 2024-04-06T14:00:00Z")


class Reproduction(BaseModel):
    code: str = Field(max_length=MAX_PROBE_CHARS)
    failing: Point
    control: Point | None = None


class UserCheck(BaseModel):
    """The same symptom through the API the package's users call (its README entry point), not an internal helper."""

    code: str = Field(max_length=MAX_PROBE_CHARS)
    failing: Point


class Verdict(BaseModel):
    verdict: Literal["defect", "intended_behavior", "allowed_exception", "adapter_error"]
    title: str = ""
    claim: str
    evidence: Annotated[list[Evidence], keep_first(8)] = Field(default_factory=list)
    reproduction: Reproduction | None = None
    user_check: UserCheck | None = None
    issue_number: int | None = None


_STR = {"type": "string"}
_POINT = {
    "type": "object",
    "properties": {"zone": _STR, "instant": _STR},
    "required": ["zone", "instant"],
}
PROBE_HELP = (
    "The code is the body of an async function. `await load('src/file')` loads a repository module by its path "
    "from the repository root (TypeScript works). `print(...)` records output. `check(condition, message)` "
    "states what correct behaviour is; a false condition marks the bug as present. If the code may throw, catch "
    "it and check, so a failure is a check and not an error. The clock (Date.now, new Date()) is frozen at "
    "`instant`, and the process time zone is `zone`. No network, no file writes."
)
VERIFY_TOOLS: list[dict[str, Any]] = [
    *READ_TOOLS,
    {
        "name": "run_probe",
        "description": "Run a short probe against the real code in the sandbox. " + PROBE_HELP,
        "inputSchema": {
            "type": "object",
            "properties": {"code": _STR, "zone": _STR, "instant": _STR},
            "required": ["code", "zone", "instant"],
        },
    },
    {
        "name": "run_tests",
        "description": "Run one of the repository's own test files, as written, and see whether it passes.",
        "inputSchema": {"type": "object", "properties": {"path": _STR}, "required": ["path"]},
    },
    {
        "name": "search_issues",
        "description": "Search the repository's public GitHub issues and pull requests (title and text).",
        "inputSchema": {
            "type": "object",
            "properties": {"terms": {"type": "array", "items": _STR}},
            "required": ["terms"],
        },
    },
    {
        "name": "submit_verdict",
        "description": (
            "Finish with one verdict: defect, intended_behavior, allowed_exception or adapter_error. claim "
            "explains it, as long as it needs; title names the behaviour. evidence: list of {kind, ref, why}, "
            "kind one of source (ref path:line or path:a-b), test, doc (ref path:line), invariant, point "
            "(ref zone@ISO). A defect needs `reproduction`: {code, failing: {zone, instant}, control: {zone, "
            "instant}}; its check must fail at `failing` and pass at `control`, and code reruns it. A defect also "
            "needs `user_check`: {code, failing: {zone, instant}}, the same symptom through the API the package's "
            "users call (as in its README), failing in the same zone; a fix must make both pass. An "
            "adapter_error needs `reproduction` whose check passes at the violation's point. Give issue_number "
            "only for a search result that reports this same behaviour."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "verdict": {
                    "type": "string",
                    "enum": ["defect", "intended_behavior", "allowed_exception", "adapter_error"],
                },  # fmt: skip
                "title": _STR,
                "claim": _STR,
                "evidence": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"kind": _STR, "ref": _STR, "why": _STR},
                        "required": ["kind", "ref", "why"],
                    },
                },
                "reproduction": {
                    "type": "object",
                    "properties": {"code": _STR, "failing": _POINT, "control": _POINT},
                    "required": ["code", "failing"],
                },
                "user_check": {
                    "type": "object",
                    "properties": {"code": _STR, "failing": _POINT},
                    "required": ["code", "failing"],
                },
                "issue_number": {"type": "integer"},
            },
            "required": ["verdict", "claim", "evidence"],
        },
    },
]

EventSink = Callable[[str, dict[str, object]], None]


def point_ms(p: Point) -> int:
    """Validate a point; return its instant in epoch ms. Raises ToolError with a correctable message."""
    try:
        ZoneInfo(p.zone)
    except (ZoneInfoNotFoundError, ValueError) as e:
        raise ToolError(f"{p.zone!r} is not an IANA time zone, such as Australia/Lord_Howe") from e
    ms = S.parse_instant(p.instant)
    if ms is None:
        raise ToolError(f"{p.instant!r}: give an ISO 8601 instant with offset in 2000-2100, such as 2024-04-06T14:00Z")
    return ms


@dataclass
class VerifySession(RepoReader):
    token: str
    ws: Path
    tracked: frozenset[str]
    extra_readable: frozenset[str]
    unit: str
    on_event: EventSink
    deadline: float
    max_calls: int
    max_probes: int
    max_tests: int
    max_searches: int
    probe: Callable[[str, str, int], ProbeResult]  # (code, zone, epoch ms) -> result
    run_test: Callable[[str], str]  # repository test path -> outcome text
    is_test: Callable[[str], bool]
    find_issues: Callable[[list[str]], list[dict[str, object]]]
    check_verdict: Callable[[Verdict], tuple[str | None, list[str]]]  # -> (reason to reject or None, checks)
    calls: int = 0
    probes: int = 0
    tests: int = 0
    searches: int = 0
    rejections: int = 0
    issues_seen: dict[int, dict[str, object]] = field(default_factory=dict)
    verdict: Verdict | None = None
    rejected_reason: str | None = None  # set when the final verdict did not pass the checks
    checks: list[str] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)
    tools: list[dict[str, Any]] = field(default_factory=lambda: VERIFY_TOOLS)

    # ---------- tools ----------

    def run_probe(self, code: object, zone: object, instant: object) -> str:
        if not isinstance(code, str) or not code.strip():
            raise ToolError("Give the probe code")
        if len(code) > MAX_PROBE_CHARS:
            raise ToolError(f"Keep the probe under {MAX_PROBE_CHARS} characters")
        if self.probes >= self.max_probes:
            raise ToolError(f"The probe has run {self.max_probes} times; submit your verdict")
        ms = point_ms(Point(zone=str(zone or ""), instant=str(instant or "")))
        self.probes += 1
        r = self.probe(code, str(zone), ms)
        head = {"passed": "CHECKS PASSED", "check_failed": "CHECK FAILED", "error": "ERROR", "timeout": "TIMED OUT"}
        lines = "\n".join(r.out) or "(no output)"
        which = f"probe {self.probes} of {self.max_probes}"
        return f"{head.get(r.status, r.status)} at {S.iso(ms)} in {zone} ({which})\n{lines}"

    def run_tests(self, path: object) -> str:
        p = self._readable(path)
        if p not in self.tracked or not self.is_test(p):
            raise ToolError(f"{p}: not one of the repository's test files")
        if self.tests >= self.max_tests:
            raise ToolError(f"Test files have been run {self.max_tests} times; submit your verdict")
        self.tests += 1
        return self.run_test(p) + f" (run {self.tests} of {self.max_tests})"

    def search_issues(self, terms: object) -> str:
        if not isinstance(terms, list) or not all(isinstance(t, str) for t in terms) or not terms:
            raise ToolError("Give terms as a list of words, such as ['addHour', 'fall-back']")
        if self.searches >= self.max_searches:
            raise ToolError(f"Issues have been searched {self.max_searches} times; submit your verdict")
        self.searches += 1
        try:
            found = self.find_issues([t[:40] for t in terms[:4]])
        except OSError as e:
            raise ToolError(f"Issue search unavailable: {e}") from e
        for i in found:
            self.issues_seen[int(str(i["number"]))] = i
        if not found:
            return "No issues or pull requests match."
        return "\n\n".join(
            f"#{i['number']} [{i.get('kind', 'issue')}, {i.get('state', '')}] {i['title']}\n"
            + str(i.get("body", ""))[:700]
            for i in found
        )

    def submit_verdict(self, args: dict[str, Any]) -> str:
        try:
            v = Verdict.model_validate(args)
        except ValidationError as e:
            problems = "; ".join(f"{'.'.join(str(x) for x in err['loc'])}: {err['msg']}" for err in e.errors()[:4])
            raise ToolError(f"Not submitted: {problems}. Fix it and call submit_verdict again.") from e
        if v.reproduction is not None:
            point_ms(v.reproduction.failing)
            if v.reproduction.control is not None:
                point_ms(v.reproduction.control)
        if v.user_check is not None:
            point_ms(v.user_check.failing)
        reason, checks = self.check_verdict(v)
        self.checks = checks
        if reason and self.rejections < MAX_REJECTIONS:
            self.rejections += 1
            left = MAX_REJECTIONS - self.rejections + 1
            raise ToolError(
                f"Not accepted: {reason}. Investigate further and submit again ({left} submission(s) left), or "
                "submit a different verdict."
            )
        self.verdict, self.rejected_reason = v, reason
        return "Verdict recorded." + (f" It did not pass the checks: {reason}" if reason else "") + " Stop here."

    # ---------- dispatch ----------

    def call(self, name: str, args: dict[str, Any]) -> str:
        with self.lock:
            if self.verdict is not None:
                raise ToolError("Verdict already submitted. Stop here.")
            over = self.calls >= self.max_calls or time.monotonic() > self.deadline
            if over and name != "submit_verdict":
                raise ToolError("The tool budget is used up. Call submit_verdict now with your best verdict.")
            self.calls += 1
            handlers: dict[str, Callable[[], str]] = {
                "list_files": lambda: self.list_files(args.get("glob")),
                "read_file": lambda: self.read_file(args.get("path"), args.get("start"), args.get("end")),
                "search": lambda: self.search(args.get("pattern"), args.get("glob")),
                "run_probe": lambda: self.run_probe(args.get("code"), args.get("zone"), args.get("instant")),
                "run_tests": lambda: self.run_tests(args.get("path")),
                "search_issues": lambda: self.search_issues(args.get("terms")),
                "submit_verdict": lambda: self.submit_verdict(args),
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


def open_session(**kw: Any) -> VerifySession:
    return VerifySession(token=secrets.token_urlsafe(32), **kw)


def _describe(name: str, args: dict[str, Any], result: str) -> str:
    if name == "run_probe":
        return f"probed at {str(args.get('instant'))[:30]} in {str(args.get('zone'))[:40]}: {result.splitlines()[0]}"
    if name == "read_file":
        return f"read {str(args.get('path'))[:120]}"
    if name == "search":
        return f"searched for {str(args.get('pattern', ''))[:80]!r}"
    if name == "search_issues":
        return f"searched issues for {', '.join(str(t) for t in (args.get('terms') or [])[:4])[:120]}"
    if name == "run_tests":
        return f"ran {str(args.get('path'))[:120]}: {result.splitlines()[0] if result else ''}"
    if name == "submit_verdict":
        return f"submitted verdict {args.get('verdict')}"
    return name.replace("_", " ")


def names_unit(issue: dict[str, object], unit: str) -> bool:
    return unit.lower() in f"{issue.get('title', '')}\n{issue.get('body', '')}".lower()


_LOAD = re.compile(r"\bload\s*\(")


def loads_repository_code(code: str) -> bool:
    return bool(_LOAD.search(code))
