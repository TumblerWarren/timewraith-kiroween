"""Fix sessions: the tools Doctor Stitch uses while he works on one bug.

A session belongs to one fix attempt. It holds a random token, the workspace, a tool-call budget and a deadline.
Kiro CLI in the Kiro Crew container talks to these tools through `backend/agents/tw_mcp_proxy.py`, which forwards
each MCP call to `POST /api/v1/internal/fix-tools/call` with the token. The agent never runs a command itself:
- reads and searches see only files tracked by git, plus the regression test and the adapter;
- `replace` edits one tracked source file by exact text, keeps its line endings, and refuses tests, config,
  lockfiles, CI files and anything TimeWraith generated;
- tests run in the no-network Docker sandbox (sandbox.py), the same as the gates.
His own test runs only guide him. The patch counts after the 8 gates pass on a clean tree (pipeline._gates).
"""

from __future__ import annotations

import fnmatch
import re
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError

from . import ingest, sandbox
from .analyze import is_test_file
from .config import Settings
from .models import Bug, CapabilityReport, Evidences

PROTECTED = re.compile(
    r"(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|\.github/.*|"
    r"(vitest|jest|vite|babel|eslint|prettier)\.config\.[^/]+|\.eslintrc[^/]*|__tw__/.*|\.tw/.*)$"
)

MAX_RESULT_CHARS = 12_000
MAX_READ_LINES = 400
MAX_FILES_LISTED = 200
MAX_SEARCH_HITS = 100
MAX_FILE_BYTES = 1_000_000
MAX_PATTERN = 200


class ToolError(Exception):
    """A tool call the agent should correct; the message goes back to it as the tool result."""


class Submission(BaseModel):
    summary: str
    root_cause: str
    evidence: Evidences = Field(default_factory=list)


_STR = {"type": "string"}
TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_files",
        "description": "List repository files (tracked by git) matching a glob, such as 'src/**/*.ts'.",
        "inputSchema": {"type": "object", "properties": {"glob": _STR}, "required": []},
    },
    {
        "name": "read_file",
        "description": f"Read a file with line numbers. Up to {MAX_READ_LINES} lines per call; use start and end.",
        "inputSchema": {
            "type": "object",
            "properties": {"path": _STR, "start": {"type": "integer"}, "end": {"type": "integer"}},
            "required": ["path"],
        },
    },
    {
        "name": "search",
        "description": "Search repository files with a regular expression. Returns path:line: text.",
        "inputSchema": {"type": "object", "properties": {"pattern": _STR, "glob": _STR}, "required": ["pattern"]},
    },
    {
        "name": "replace",
        "description": (
            "Replace exact text in one source file. `old` must appear exactly once; include enough surrounding "
            "lines to make it unique. Tests, config, lockfiles and generated files cannot be edited."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"path": _STR, "old": _STR, "new": _STR},
            "required": ["path", "old", "new"],
        },
    },
    {
        "name": "replace_lines",
        "description": (
            "Replace lines start..end (1-based, inclusive, as shown by read_file) of one source file with `new` "
            "(any number of lines; empty to delete). Re-read the file after an edit: line numbers shift."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"path": _STR, "start": {"type": "integer"}, "end": {"type": "integer"}, "new": _STR},
            "required": ["path", "start", "end", "new"],
        },
    },
    {
        "name": "show_diff",
        "description": "Show your changes so far as a unified diff.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "run_regression_test",
        "description": "Run the generated regression test at the failing clock setting, in the sandbox.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "check_all_zones",
        "description": (
            "Run the experiment again in all 13 time zones (DST changes, month ends, leap days) with your change, "
            "and list where the broken rule still fails. Slower than run_regression_test; use it before submit."
        ),
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "run_tests",
        "description": "Run one existing test file of the repository at the failing clock setting.",
        "inputSchema": {"type": "object", "properties": {"path": _STR}, "required": ["path"]},
    },
    {
        "name": "submit",
        "description": (
            "Finish: submit your current changes. summary (what you changed), root_cause ("
            "explains the defect), evidence: list of {kind: 'source', ref: 'path:line' or 'path:a-b', why}."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "summary": _STR,
                "root_cause": _STR,
                "evidence": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"kind": _STR, "ref": _STR, "why": _STR},
                        "required": ["kind", "ref", "why"],
                    },
                },
            },
            "required": ["summary", "root_cause", "evidence"],
        },
    },
]

EventSink = Callable[[str, dict[str, object]], None]

READ_TOOLS = [t for t in TOOLS if t["name"] in {"list_files", "read_file", "search"}]


class RepoReader:
    """Read-only repository tools shared by every tool session: paths are confined to the workspace, reads see
    git-tracked files plus the session's extra readable files (TimeWraith's adapter and tests)."""

    ws: Path
    tracked: frozenset[str]
    extra_readable: frozenset[str]

    def _rel(self, path: object) -> str:
        if not isinstance(path, str) or not path.strip():
            raise ToolError("Give a repository-relative path, such as src/index.ts")
        p = path.strip().replace("\\", "/")
        while p.startswith("./"):
            p = p[2:]
        if p.startswith("/") or re.match(r"^[A-Za-z]:", p) or ".." in p.split("/"):
            raise ToolError(f"{path}: use a path inside the repository, without .. or a leading /")
        full = self.ws / p
        cur = self.ws
        for part in p.split("/"):
            cur = cur / part
            if cur.is_symlink():
                raise ToolError(f"{p}: symbolic links are not followed")
        if self.ws.resolve() not in full.resolve().parents:
            raise ToolError(f"{p}: outside the repository")
        return p

    def _readable(self, path: object) -> str:
        p = self._rel(path)
        if p not in self.tracked and p not in self.extra_readable:
            raise ToolError(f"{p}: not a file in the repository (use list_files or search)")
        if not (self.ws / p).is_file():
            raise ToolError(f"{p}: not found")
        return p

    def list_files(self, glob: object = None) -> str:
        pattern = glob if isinstance(glob, str) and glob.strip() else "**"
        hits = sorted(p for p in self.tracked if _glob(p, pattern))
        more = f"\n... {len(hits) - MAX_FILES_LISTED} more; narrow the glob" if len(hits) > MAX_FILES_LISTED else ""
        return ("\n".join(hits[:MAX_FILES_LISTED]) or "No files match.") + more

    def read_file(self, path: object, start: object = None, end: object = None) -> str:
        p = self._readable(path)
        lines = _read(self.ws / p).splitlines()
        a = start if isinstance(start, int) and start >= 1 else 1
        b = end if isinstance(end, int) and end >= a else a + MAX_READ_LINES - 1
        b = min(b, a + MAX_READ_LINES - 1, len(lines))
        # A tab separates the number from the line, so the line's own indentation is exactly what follows it.
        body = "\n".join(f"{i}\t{lines[i - 1]}" for i in range(a, b + 1))
        tail = f"\n... file has {len(lines)} lines; read more with start={b + 1}" if b < len(lines) else ""
        return f"{p} lines {a}-{b} of {len(lines)} (number, tab, then the line exactly)\n{body}{tail}"

    def search(self, pattern: object, glob: object = None) -> str:
        if not isinstance(pattern, str) or not pattern or len(pattern) > MAX_PATTERN:
            raise ToolError(f"Give a regular expression of 1 to {MAX_PATTERN} characters")
        try:
            rx = re.compile(pattern)
        except re.error as e:
            raise ToolError(f"Invalid regular expression: {e}") from e
        g = glob if isinstance(glob, str) and glob.strip() else "**"
        hits: list[str] = []
        for p in sorted(self.tracked):
            if not _glob(p, g) or (self.ws / p).stat().st_size > MAX_FILE_BYTES:
                continue
            for i, line in enumerate(_read(self.ws / p).splitlines(), start=1):
                if rx.search(line[:1000]):
                    hits.append(f"{p}:{i}: {line.strip()[:200]}")
                    if len(hits) >= MAX_SEARCH_HITS:
                        return "\n".join(hits) + "\n... more hits; narrow the pattern or the glob"
        return "\n".join(hits) or "No matches."


@dataclass
class FixSession(RepoReader):
    token: str
    settings: Settings
    ws: Path
    caps: CapabilityReport
    bug: Bug
    attempt: int
    extra_readable: frozenset[str]
    on_event: EventSink
    deadline: float
    max_calls: int
    max_tests: int
    max_other_tests: int
    # Re-runs the bug's experiment in every sweep zone; returns where the rule still breaks (pipeline supplies it).
    zone_check: Callable[[], str] | None = None
    max_zone_checks: int = 3
    zone_checks: int = 0
    tracked: frozenset[str] = frozenset()
    calls: int = 0
    tests: int = 0
    other_tests: int = 0
    last_test_passed: bool | None = None  # None: not run since the last edit
    warned_unpassed: bool = False
    submission: Submission | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)
    repair_tools: dict[str, Callable[[dict[str, Any]], str]] = field(default_factory=dict)
    tools: list[dict[str, Any]] = field(default_factory=lambda: TOOLS)

    # ---------- paths (reads come from RepoReader) ----------

    runner_config: str | None = None
    regression_review: str | None = None

    def _editable(self, path: object) -> str:
        p = self._readable(path)
        if p in self.extra_readable or p not in self.tracked:
            raise ToolError(f"{p}: generated by TimeWraith; it cannot be edited")
        if PROTECTED.search(p) or is_test_file(p):
            raise ToolError(f"{p}: tests, test config, package manifests, lockfiles and CI files cannot be edited")
        if (self.ws / p).stat().st_size > MAX_FILE_BYTES:
            raise ToolError(f"{p}: larger than 1 MB; it cannot be edited")
        return p

    # ---------- tools ----------

    def replace(self, path: object, old: object, new: object) -> str:
        p = self._editable(path)
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise ToolError("Give `old` (non-empty exact text) and `new`")
        if old == new:
            raise ToolError("`old` and `new` are the same")
        raw = (self.ws / p).read_bytes().decode("utf-8", errors="surrogateescape")
        crlf = "\r\n" in raw
        o, n = _eol(old, crlf), _eol(new, crlf)
        count = raw.count(o)
        if count > 1:
            raise ToolError(f"`old` appears {count} times in {p}; include more surrounding lines")
        if count == 1:
            self._write(p, raw.replace(o, n, 1))
            return f"Replaced in {p}.\n" + _cap(ingest.git(self.ws, ["diff", "--", p]))
        # Not exact: accept one block whose lines match after trimming whitespace (indentation copied wrong).
        lines = raw.split("\r\n" if crlf else "\n")
        want = [ln.strip() for ln in old.replace("\r\n", "\n").strip("\n").split("\n")]
        starts = [i for i in range(len(lines) - len(want) + 1) if [x.strip() for x in lines[i : i + len(want)]] == want]
        if len(starts) != 1:
            hint = f" (first line you gave: {want[0][:80]!r})" if want else ""
            raise ToolError(
                f"`old` was not found in {p}{hint}. Copy the text after the tab in read_file, "
                "or use replace_lines with line numbers."
                if not starts
                else f"`old` matches {len(starts)} places in {p} once whitespace is ignored; include more lines"
            )
        i = starts[0]
        indent = _indent_shift(old, lines[i])
        new_lines = [indent + ln if ln.strip() else ln for ln in new.replace("\r\n", "\n").strip("\n").split("\n")]
        lines[i : i + len(want)] = new_lines if new.strip() else []
        self._write(p, ("\r\n" if crlf else "\n").join(lines))
        return f"Replaced in {p} (matched ignoring whitespace; check the indentation).\n" + _cap(
            ingest.git(self.ws, ["diff", "--", p])
        )

    def replace_lines(self, path: object, start: object, end: object, new: object) -> str:
        p = self._editable(path)
        if not isinstance(start, int) or not isinstance(end, int) or not isinstance(new, str):
            raise ToolError("Give start and end line numbers and `new` text")
        raw = (self.ws / p).read_bytes().decode("utf-8", errors="surrogateescape")
        crlf = "\r\n" in raw
        eol = "\r\n" if crlf else "\n"
        trailing = raw.endswith(eol)
        lines = raw[: -len(eol)].split(eol) if trailing else raw.split(eol)
        if not 1 <= start <= end <= len(lines):
            raise ToolError(f"Lines {start}-{end} are outside {p}, which has {len(lines)} lines")
        if end - start + 1 > 80:
            raise ToolError("Replace at most 80 lines at a time")
        body = new.replace("\r\n", "\n")
        repl = body[:-1].split("\n") if body.endswith("\n") else (body.split("\n") if body else [])
        lines[start - 1 : end] = repl
        self._write(p, eol.join(lines) + (eol if trailing else ""))
        return f"Replaced lines {start}-{end} of {p}.\n" + _cap(ingest.git(self.ws, ["diff", "--", p]))

    def _write(self, p: str, text: str) -> None:
        (self.ws / p).write_bytes(text.encode("utf-8", errors="surrogateescape"))
        self.last_test_passed = None  # an edit makes the last test run stale

    def show_diff(self) -> str:
        return _cap(ingest.git(self.ws, ["diff"])) or "No changes yet."

    def run_regression_test(self) -> str:
        if self.tests >= self.max_tests:
            raise ToolError(f"The regression test has been run {self.max_tests} times; submit your best change")
        self.tests += 1
        r = sandbox.run_test_file(
            self.settings,
            self.ws,
            self.caps,
            self.bug.regression_test_path,
            [self.bug.clock],
            **({"runner_config": self.runner_config} if self.runner_config else {}),
        )[0]
        self.last_test_passed = r.outcome == "passed"
        if self.last_test_passed:
            self.regression_review = None
        elif r.outcome == "error":
            self.regression_review = r.failure or "The regression could not run"

        return _outcome(r, f"run {self.tests} of {self.max_tests}")

    def check_all_zones(self) -> str:
        if self.zone_check is None:
            raise ToolError("The all-zones check is not available in this session")
        if self.zone_checks >= self.max_zone_checks:
            raise ToolError(f"The all-zones check has run {self.max_zone_checks} times; the gates run it again")
        self.zone_checks += 1
        return self.zone_check() + f"\n(check {self.zone_checks} of {self.max_zone_checks})"

    def run_tests(self, path: object) -> str:
        p = self._readable(path)
        if not is_test_file(p) or p not in self.tracked:
            raise ToolError(f"{p}: not one of the repository's test files")
        if self.other_tests >= self.max_other_tests:
            raise ToolError(f"Test files have been run {self.max_other_tests} times; the gates run the full suite")
        self.other_tests += 1
        r = sandbox.run_test_file(self.settings, self.ws, self.caps, p, [self.bug.clock])[0]
        return _outcome(r, f"run {self.other_tests} of {self.max_other_tests}")

    def submit(self, summary: object = None, root_cause: object = None, evidence: object = None) -> str:
        try:
            sub = Submission.model_validate({"summary": summary, "root_cause": root_cause, "evidence": evidence})
        except ValidationError as e:
            problems = "; ".join(f"{'.'.join(str(x) for x in err['loc'])}: {err['msg']}" for err in e.errors()[:4])
            raise ToolError(f"Not submitted: {problems}. Shorten or fix it and call submit again.") from e
        if not ingest.git(self.ws, ["diff", "--name-only"]).strip():
            raise ToolError("Not submitted: you have not changed any file yet")
        budget_left = self.calls < self.max_calls and self.tests < self.max_tests and time.monotonic() < self.deadline
        if self.last_test_passed is not True and budget_left and not self.warned_unpassed:
            self.warned_unpassed = True
            state = "has not been run since your last edit" if self.last_test_passed is None else "failed"
            raise ToolError(
                f"Not submitted: the regression test {state}. Run it and fix the cause first. "
                "If you cannot, call submit again to hand in your best attempt."
            )
        self.submission = sub
        return "Submitted. The gates now test your change on a clean copy. Stop here."

    # ---------- dispatch ----------

    def call(self, name: str, args: dict[str, Any]) -> str:
        """Run one tool. Raises ToolError for a call the agent should correct."""
        with self.lock:
            if self.submission is not None:
                raise ToolError("Already submitted. Stop here.")
            over = self.calls >= self.max_calls or time.monotonic() > self.deadline
            if over and name != "submit":
                raise ToolError("The tool budget for this attempt is used up. Call submit now with your best change.")
            self.calls += 1
            fn = _HANDLERS.get(name)
            repair = self.repair_tools.get(name)
            if fn is None and repair is None:
                raise ToolError(f"Unknown tool {name}")
            try:
                result = repair(args) if repair else fn(self, args)  # type: ignore[misc]
            except ToolError as e:
                self.on_event(f"{name}: {e}"[:300], self._data(name, ok=False))
                raise
            except TypeError as e:
                raise ToolError(f"Bad arguments for {name}: {e}") from e
            self.on_event(_describe(name, args, result), self._data(name, ok=True))
            return _cap(result)

    def _data(self, name: str, *, ok: bool) -> dict[str, object]:
        return {
            "bug_id": self.bug.id,
            "attempt": self.attempt,
            "tool": name,
            "ok": ok,
            "calls": self.calls,
            "max_calls": self.max_calls,
        }


_HANDLERS: dict[str, Callable[[FixSession, dict[str, Any]], str]] = {
    "list_files": lambda s, a: s.list_files(a.get("glob")),
    "read_file": lambda s, a: s.read_file(a.get("path"), a.get("start"), a.get("end")),
    "search": lambda s, a: s.search(a.get("pattern"), a.get("glob")),
    "replace": lambda s, a: s.replace(a.get("path"), a.get("old"), a.get("new")),
    "replace_lines": lambda s, a: s.replace_lines(a.get("path"), a.get("start"), a.get("end"), a.get("new")),
    "show_diff": lambda s, a: s.show_diff(),
    "run_regression_test": lambda s, a: s.run_regression_test(),
    "run_tests": lambda s, a: s.run_tests(a.get("path")),
    "check_all_zones": lambda s, a: s.check_all_zones(),
    "submit": lambda s, a: s.submit(a.get("summary"), a.get("root_cause"), a.get("evidence")),
}


class ToolSession(Protocol):
    """Anything the token-gated tool endpoint can serve: a fix session or a verification session."""

    token: str
    tools: list[dict[str, Any]]

    def call(self, name: str, args: dict[str, Any]) -> str: ...


class SessionRegistry:
    """Live tool sessions by token. A token works only while its session runs."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, ToolSession] = {}

    def add(self, s: ToolSession) -> None:
        with self._lock:
            self._sessions[s.token] = s

    def open(
        self,
        *,
        settings: Settings,
        ws: Path,
        caps: CapabilityReport,
        bug: Bug,
        attempt: int,
        extra_readable: set[str],
        on_event: EventSink,
        zone_check: Callable[[], str] | None = None,
    ) -> FixSession:
        tracked = frozenset(ln for ln in ingest.git(ws, ["ls-files", "-z"]).split("\0") if ln)
        s = FixSession(
            token=secrets.token_urlsafe(32),
            settings=settings,
            ws=ws,
            caps=caps,
            bug=bug,
            attempt=attempt,
            extra_readable=frozenset(extra_readable),
            on_event=on_event,
            deadline=time.monotonic() + settings.fix_session_s,
            max_calls=settings.max_tool_calls,
            max_tests=settings.max_test_runs,
            max_other_tests=settings.max_other_test_runs,
            zone_check=zone_check,
            tracked=tracked,
        )
        with self._lock:
            self._sessions[s.token] = s
        return s

    def get(self, token: str | None) -> ToolSession | None:
        if not token:
            return None
        with self._lock:
            for t, s in self._sessions.items():
                if secrets.compare_digest(t, token):
                    return s
        return None

    def close(self, s: ToolSession) -> None:
        with self._lock:
            self._sessions.pop(s.token, None)


# ---------- helpers ----------


def _glob(path: str, pattern: str) -> bool:
    if pattern in {"**", "*", "**/*"}:
        return True
    if fnmatch.fnmatchcase(path, pattern):
        return True
    # "src/**/*.ts" should also match "src/a.ts"
    return "**/" in pattern and fnmatch.fnmatchcase(path, pattern.replace("**/", ""))


def _read(p: Path) -> str:
    return p.read_bytes().decode("utf-8", errors="replace")


def _eol(text: str, crlf: bool) -> str:
    plain = text.replace("\r\n", "\n")
    return plain.replace("\n", "\r\n") if crlf else plain


def _indent_shift(old: str, file_line: str) -> str:
    """Extra indentation the file has over the agent's first line, applied to the agent's new lines."""
    first = next((ln for ln in old.replace("\r\n", "\n").split("\n") if ln.strip()), "")
    have = file_line[: len(file_line) - len(file_line.lstrip())]
    gave = first[: len(first) - len(first.lstrip())]
    return have[len(gave) :] if have.startswith(gave) else ""


def _cap(text: str) -> str:
    return text if len(text) <= MAX_RESULT_CHARS else text[:MAX_RESULT_CHARS] + "\n... (cut; ask for less)"


def _outcome(r: sandbox.TestOutcome, which: str) -> str:
    head = {"passed": "PASSED", "assertion_failed": "FAILED (assertion)", "error": "ERROR", "timeout": "TIMED OUT"}
    return f"{head.get(r.outcome, r.outcome)} ({which})" + (f"\n{r.failure[:3000]}" if r.failure else "")


def _describe(name: str, args: dict[str, Any], result: str) -> str:
    """One line for the event log."""
    path = str(args.get("path", ""))[:120]
    if name == "read_file":
        return f"read {path}" + (f":{args.get('start')}-{args.get('end')}" if args.get("start") else "")
    if name == "search":
        hits = 0 if result == "No matches." else result.count("\n") + 1
        return f"searched for {str(args.get('pattern', ''))[:80]!r}: {hits} hits"
    if name == "list_files":
        return f"listed files {str(args.get('glob') or '**')[:80]}"
    if name in {"replace", "replace_lines"}:
        changed = sum(1 for ln in result.splitlines() if ln[:1] in "+-" and not ln.startswith(("+++", "---")))
        return f"edited {path} ({changed} changed lines)"
    if name in {"run_regression_test", "run_tests"}:
        what = "the regression test" if name == "run_regression_test" else path
        return f"ran {what}: {result.splitlines()[0] if result else ''}"
    if name == "check_all_zones":
        return f"checked all zones: {result.splitlines()[0] if result else ''}"
    if name == "submit":
        return "submitted the fix"
    return name.replace("_", " ")
