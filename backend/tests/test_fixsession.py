"""Fix-session tools (fixsession.py) and the token-gated endpoint the MCP proxy calls."""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from timewraith import fixsession
from timewraith.config import Settings
from timewraith.fixsession import FixSession, SessionRegistry, ToolError
from timewraith.ingest import git
from timewraith.models import Bug, CapabilityReport, ClockConfig
from timewraith.sandbox import TestOutcome as Outcome

FILES = {
    "src/next.ts": "export function next(now) {\r\n  return now + 1;\r\n}\r\n",  # CRLF, as on a Windows checkout
    "src/util.ts": "export const one = 1;\nexport const two = 2;\nexport const one2 = 1;\n",
    "src/next.test.ts": "test('x', () => {});\n",
    "package.json": "{}\n",
}


def _repo(root: Path) -> Path:
    for rel, text in FILES.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(text.encode("utf-8"))
    git(root, ["init", "-q"])
    git(root, ["add", "-A"])
    git(root, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"])
    (root / "src" / "__tw__").mkdir()
    (root / "src" / "__tw__" / "bug.test.ts").write_text("generated\n", encoding="utf-8")
    return root


def _session(ws: Path, events: list[str], **over: object) -> FixSession:
    bug = Bug.model_construct(
        id="bug_1",
        regression_test_path="src/__tw__/bug.test.ts",
        clock=ClockConfig(instant="2024-11-03T09:00:00.000Z", time_zone="America/Los_Angeles", label="fall back"),
    )
    reg = SessionRegistry()
    s = reg.open(
        settings=Settings(),
        ws=ws,
        caps=CapabilityReport.model_construct(),
        bug=bug,
        attempt=1,
        extra_readable={"src/__tw__/bug.test.ts"},
        on_event=lambda text, data: events.append(text),
    )
    for k, v in over.items():
        setattr(s, k, v)
    return s


@pytest.fixture
def ws(tmp_path: Path) -> Path:
    return _repo(tmp_path / "repo")


def test_reads_only_repository_files_and_refuses_escapes(ws: Path) -> None:
    s = _session(ws, [])
    assert "src/next.ts" in s.call("list_files", {"glob": "src/**/*.ts"})
    assert "2\t  return now + 1;" in s.call("read_file", {"path": "src/next.ts"})
    assert "generated" in s.call("read_file", {"path": "src/__tw__/bug.test.ts"})  # the regression test is readable
    for bad in ("../outside.txt", "/etc/passwd", "C:/Windows/win.ini", "src/../../x", ".git/config"):
        with pytest.raises(ToolError):
            s.call("read_file", {"path": bad})


def test_replace_needs_one_exact_match_and_keeps_crlf(ws: Path) -> None:
    s = _session(ws, [])
    with pytest.raises(ToolError, match="appears 2 times"):
        s.call("replace", {"path": "src/util.ts", "old": "= 1;", "new": "= 3;"})
    with pytest.raises(ToolError, match="not found"):
        s.call("replace", {"path": "src/next.ts", "old": "now + 2", "new": "x"})
    # The agent writes LF; the file is CRLF; the edit keeps CRLF, so the diff is one line.
    out = s.call("replace", {"path": "src/next.ts", "old": "{\n  return now + 1;", "new": "{\n  return now + 60000;"})
    assert "+  return now + 60000;" in out
    assert (ws / "src/next.ts").read_bytes() == b"export function next(now) {\r\n  return now + 60000;\r\n}\r\n"
    numstat = git(ws, ["diff", "--numstat"]).split()
    assert numstat[:2] == ["1", "1"]


def test_edits_survive_wrong_indentation_and_line_numbers_work(ws: Path) -> None:
    s = _session(ws, [])
    # The agent copied the line with the wrong indentation: matched ignoring whitespace, file indentation kept.
    out = s.call(
        "replace", {"path": "src/util.ts", "old": "    export const two = 2;", "new": "export const two = 22;"}
    )
    assert "matched ignoring whitespace" in out
    assert (ws / "src/util.ts").read_text(encoding="utf-8").splitlines()[1] == "export const two = 22;"
    out = s.call("replace_lines", {"path": "src/next.ts", "start": 2, "end": 2, "new": "  return now + 60000;\n"})
    assert "+  return now + 60000;" in out
    assert (ws / "src/next.ts").read_bytes() == b"export function next(now) {\r\n  return now + 60000;\r\n}\r\n"
    with pytest.raises(ToolError, match="outside"):
        s.call("replace_lines", {"path": "src/next.ts", "start": 9, "end": 9, "new": "x"})


def test_tests_config_manifests_and_generated_files_cannot_be_edited(ws: Path) -> None:
    s = _session(ws, [])
    for path in ("src/next.test.ts", "package.json", "src/__tw__/bug.test.ts"):
        with pytest.raises(ToolError, match="cannot be edited"):
            s.call("replace", {"path": path, "old": "t", "new": "u"})


def test_submit_needs_a_change_and_short_text_and_ends_the_session(ws: Path) -> None:
    s = _session(ws, [])
    ev = [{"kind": "source", "ref": "src/next.ts:2", "why": "adds 1 ms"}]
    with pytest.raises(ToolError, match="not changed any file"):
        s.call("submit", {"summary": "s", "root_cause": "r", "evidence": ev})
    s.call("replace", {"path": "src/next.ts", "old": "now + 1", "new": "now + 60000"})
    with pytest.raises(ToolError, match="Shorten"):
        s.call("submit", {"summary": "x" * 301, "root_cause": "r", "evidence": ev})
    # The regression test has not been run since the edit: one warning, then a second submit goes through.
    with pytest.raises(ToolError, match="has not been run since your last edit"):
        s.call("submit", {"summary": "step a minute", "root_cause": "adds 1 ms", "evidence": ev})
    assert "Submitted" in s.call("submit", {"summary": "step a minute", "root_cause": "adds 1 ms", "evidence": ev})
    assert s.submission and s.submission.summary == "step a minute"
    with pytest.raises(ToolError, match="Already submitted"):
        s.call("show_diff", {})


def test_budget_and_deadline_leave_only_submit(ws: Path) -> None:
    s = _session(ws, [], max_calls=2)
    s.call("list_files", {})
    s.call("list_files", {})
    with pytest.raises(ToolError, match="budget"):
        s.call("read_file", {"path": "src/next.ts"})
    late = _session(ws, [], deadline=time.monotonic() - 1)
    with pytest.raises(ToolError, match="budget"):
        late.call("list_files", {})


def test_runs_tests_in_the_sandbox_with_a_limit(ws: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    def fake_run(s: object, w: Path, caps: object, path: str, clocks: list[ClockConfig]) -> list[Outcome]:
        seen.append(path)
        return [Outcome("assertion_failed", "expected 61000 to be at most 120000", set(), 1)]

    monkeypatch.setattr(fixsession.sandbox, "run_test_file", fake_run)
    events: list[str] = []
    s = _session(ws, events, max_tests=1)
    out = s.call("run_regression_test", {})
    assert out.startswith("FAILED (assertion) (run 1 of 1)") and "120000" in out
    with pytest.raises(ToolError, match="run 1 times"):
        s.call("run_regression_test", {})
    assert seen == ["src/__tw__/bug.test.ts"]
    assert s.call("run_tests", {"path": "src/next.test.ts"}).startswith("FAILED")
    with pytest.raises(ToolError, match="not one of the repository's test files"):
        s.call("run_tests", {"path": "src/next.ts"})
    assert events[0].startswith("ran the regression test: FAILED")


def test_endpoint_opens_only_for_a_live_token(ws: Path) -> None:
    from timewraith import api

    client = TestClient(api.app)
    assert client.post("/api/v1/internal/fix-tools/list").status_code == 403
    assert client.post("/api/v1/internal/fix-tools/list", headers={"X-TW-Session": "nope"}).status_code == 403
    s = api.engine.sessions.open(
        settings=Settings(),
        ws=ws,
        caps=CapabilityReport.model_construct(),
        bug=Bug.model_construct(id="b", regression_test_path="src/__tw__/bug.test.ts"),
        attempt=1,
        extra_readable=set(),
        on_event=lambda *_: None,
    )
    h = {"X-TW-Session": s.token}
    tools = client.post("/api/v1/internal/fix-tools/list", headers=h).json()["tools"]
    assert {t["name"] for t in tools} >= {"read_file", "replace", "run_regression_test", "submit"}
    r = client.post(
        "/api/v1/internal/fix-tools/call", headers=h, json={"name": "read_file", "arguments": {"path": "x/../.."}}
    )
    assert "error" in r.json()
    ok = client.post("/api/v1/internal/fix-tools/call", headers=h, json={"name": "show_diff", "arguments": {}})
    assert ok.json() == {"result": "No changes yet."}
    api.engine.sessions.close(s)
    assert client.post("/api/v1/internal/fix-tools/list", headers=h).status_code == 403
