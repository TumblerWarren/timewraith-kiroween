"""Agentic verification: Raven's tool session (verifysession.py) and the code checks on her verdict."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from timewraith import pipeline, sandbox
from timewraith import sweep as S
from timewraith import verifysession as V
from timewraith.config import Settings
from timewraith.fixsession import ToolError
from timewraith.ingest import git
from timewraith.models import (
    Candidate,
    CapabilityReport,
    CodeUnit,
    CreateInvestigation,
    Evidence,
    Investigation,
    Target,
    Violation,
)
from timewraith.pipeline import Engine
from timewraith.sandbox import ProbeResult
from timewraith.store import Store

SOURCE = "export function addHour(d) {\n  return d.plus({ hours: 1 }).startOf('hour');\n}\n"
VIOLATION = Violation(
    invariant="next_after_now", zone="Australia/Lord_Howe", instant="2024-04-06T14:00:00.000Z",
    local="2024-04-07T01:00:00.000+11:00", detail="next is not after now", count=4, context_ms=[1712412000000],
)  # fmt: skip
REPRO = "const m = await load('src/hour');\ncheck(m.addHour(now) > now, 'next hour is later');"
USER = (
    "const p = await load('src/index');\nconst it = p.parse('0 * * * *');\ncheck(it.next() > now, 'next run is later');"
)


@pytest.fixture
def ws(tmp_path: Path) -> Path:
    root = tmp_path / "data" / "workspaces" / "case-v" / "repo"
    (root / "src").mkdir(parents=True)
    (root / "src" / "hour.ts").write_text(SOURCE, encoding="utf-8")
    (root / "test").mkdir()
    (root / "test" / "hour.test.ts").write_text("test('x', () => {});\n", encoding="utf-8")
    (root / "README.md").write_text("# lib\nHours step forward.\n", encoding="utf-8")
    git(root, ["init", "-q"])
    git(root, ["add", "-A"])
    git(root, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"])
    return root


def session(ws: Path, **over: Any) -> V.VerifySession:
    kw: dict[str, Any] = {
        "ws": ws,
        "tracked": frozenset(git(ws, ["ls-files", "-z"]).split("\0")) - {""},
        "extra_readable": frozenset(),
        "unit": "addHour",
        "on_event": lambda text, data: None,
        "deadline": time.monotonic() + 60,
        "max_calls": 10,
        "max_probes": 2,
        "max_tests": 1,
        "max_searches": 1,
        "probe": lambda code, zone, ms: ProbeResult("check_failed", ["CHECK FAILED: next hour is later"]),
        "run_test": lambda p: "PASSED",
        "is_test": lambda p: p.startswith("test/"),
        "find_issues": lambda terms: [{"number": 453, "title": "fix addHour", "kind": "pull request", "body": ""}],
        "check_verdict": lambda vd: (None, ["ok"]),
    }
    kw.update(over)
    return V.open_session(**kw)


# ---------- the session's tools ----------


def test_probe_validates_the_point_and_has_a_budget(ws: Path) -> None:
    s = session(ws)
    with pytest.raises(ToolError, match="IANA"):
        s.call("run_probe", {"code": REPRO, "zone": "Mars/Base", "instant": "2024-04-06T14:00:00Z"})
    with pytest.raises(ToolError, match="ISO 8601"):
        s.call("run_probe", {"code": REPRO, "zone": "UTC", "instant": "yesterday"})
    out = s.call("run_probe", {"code": REPRO, "zone": "Australia/Lord_Howe", "instant": "2024-04-06T14:00:00Z"})
    assert out.startswith("CHECK FAILED") and "probe 1 of 2" in out
    s.call("run_probe", {"code": REPRO, "zone": "UTC", "instant": "2024-06-06T14:00:00Z"})
    with pytest.raises(ToolError, match="2 times"):
        s.call("run_probe", {"code": REPRO, "zone": "UTC", "instant": "2024-06-06T14:00:00Z"})


def test_reads_are_confined_and_tests_must_be_repository_tests(ws: Path) -> None:
    s = session(ws)
    assert "startOf('hour')" in s.call("read_file", {"path": "src/hour.ts"})
    with pytest.raises(ToolError):
        s.call("read_file", {"path": "../secret"})
    with pytest.raises(ToolError, match="test files"):
        s.call("run_tests", {"path": "src/hour.ts"})
    assert s.call("run_tests", {"path": "test/hour.test.ts"}).startswith("PASSED")


def test_issue_results_are_remembered(ws: Path) -> None:
    s = session(ws)
    assert "#453 [pull request" in s.call("search_issues", {"terms": ["addHour"]})
    assert 453 in s.issues_seen


def test_rejected_verdict_goes_back_then_is_recorded(ws: Path) -> None:
    s = session(ws, check_verdict=lambda vd: ("the control check failed", ["control: check_failed"]))
    args = {"verdict": "defect", "claim": "c", "evidence": []}
    for _ in range(V.MAX_REJECTIONS):
        with pytest.raises(ToolError, match="Not accepted: the control check failed"):
            s.call("submit_verdict", args)
    assert "did not pass the checks" in s.call("submit_verdict", args)
    assert s.verdict is not None and s.rejected_reason == "the control check failed"
    with pytest.raises(ToolError, match="already submitted"):
        s.call("read_file", {"path": "src/hour.ts"})


def test_budget_leaves_only_submit(ws: Path) -> None:
    s = session(ws, max_calls=1)
    s.call("list_files", {})
    with pytest.raises(ToolError, match="budget"):
        s.call("read_file", {"path": "src/hour.ts"})
    s.call("submit_verdict", {"verdict": "allowed_exception", "claim": "c", "evidence": []})


def test_wrappers_freeze_the_clock_and_keep_the_body() -> None:
    probe = S.probe_code("jest", REPRO)
    assert "setSystemTime(now)" in probe and REPRO in probe and S.PROBE_OUT in probe
    test = S.reproduction_test_code(runner="vitest", cases=[("t", REPRO, 1712412000000), ("u", USER, 1712406600000)],
                                    zone="Australia/Lord_Howe", target="o/r@abc", prefix="../../")  # fmt: skip
    assert "setSystemTime(new Date(1712412000000))" in test and 'import("../../"' in test and "toEqual" in test
    assert "const now = new Date(1712412000000)" in test, "the body may use `now`, as in the probe"
    assert test.count("test(") == 2 and USER in test, "the user-level check is part of the regression test"


# ---------- code checks on the verdict ----------


@pytest.fixture
def engine(ws: Path) -> Engine:
    s = Settings(data_dir=ws.parents[2], agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def case(engine: Engine) -> tuple[Investigation, Candidate]:
    cand = Candidate.model_construct(
        id="c1", title="addHour", unit=CodeUnit(path="src/hour.ts", name="addHour", start_line=1, end_line=3,
                                                exported=True), bug_categories=["dst_transition"],
    )  # fmt: skip
    inv = Investigation(
        id="case-v",
        created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
        capabilities=CapabilityReport(package_manager="npm", test_runner="jest"),
    )
    return inv, cand


def verdict(kind: str = "defect", **over: Any) -> V.Verdict:
    base: dict[str, Any] = {
        "verdict": kind,
        "claim": "addHour lands back on the start instant in a 30-minute fall-back",
        "evidence": [Evidence(kind="source", ref="src/hour.ts:2", why="startOf hour")],
        "reproduction": {
            "code": REPRO,
            "failing": {"zone": "Australia/Lord_Howe", "instant": "2024-04-06T14:00:00Z"},
            "control": {"zone": "Australia/Lord_Howe", "instant": "2024-06-06T14:00:00Z"},
        },
        "user_check": {"code": USER, "failing": {"zone": "Australia/Lord_Howe", "instant": "2024-04-06T12:30:00Z"}},
    }
    base.update(over)
    return V.Verdict.model_validate(base)


def fake_probe(failing: str, control: str) -> Any:
    calls: list[tuple[str, int]] = []

    def probe(code: str, zone: str, ms: int) -> ProbeResult:
        calls.append((zone, ms))
        june = ms > 1717000000000
        return ProbeResult(control if june else failing, ["out"])

    probe.calls = calls  # type: ignore[attr-defined]
    return probe


def check(engine: Engine, vd: V.Verdict, probe: Any, state: dict[str, object] | None = None) -> tuple[Any, Any]:
    inv, cand = case(engine)
    return engine._check_verdict(inv, cand, VIOLATION, vd, probe, "src/__tw__/bug_1.regression.test.ts", "../../",
                                 "o/r@abc", state if state is not None else {})  # fmt: skip


def test_defect_needs_failing_reruns_a_passing_control_and_a_failing_test(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    ran: list[str] = []

    def fake_test(s: Settings, ws: Path, caps: CapabilityReport, path: str, clocks: list[Any]) -> list[Any]:
        ran.append(path)
        return [sandbox.TestOutcome("assertion_failed", "expect(received).toEqual(expected)", set(), 1)]

    monkeypatch.setattr(pipeline.sandbox, "run_test_file", fake_test)
    probe = fake_probe("check_failed", "passed")
    state: dict[str, object] = {}
    reason, checks = check(engine, verdict(), probe, state)
    assert reason is None, reason
    assert len(probe.calls) == 2 * engine.s.repeat_runs + 1, "reproduction 3x, control once, user check 3x"
    assert ran == ["src/__tw__/bug_1.regression.test.ts"] and "setSystemTime" in str(state["test"])


@pytest.mark.parametrize(
    ("vd", "failing", "control", "why"),
    [
        (verdict(), "check_failed", "check_failed", "pass at the control point"),
        (verdict(), "error", "passed", "fail at the failing point in every rerun"),
        (verdict(evidence=[]), "check_failed", "passed", "source lines"),
        (verdict(evidence=[Evidence(kind="source", ref="src/hour.ts:99", why="x")]), "check_failed", "passed",
         "source lines"),
        (verdict(reproduction={"code": "check(false, 'x')", "failing": {"zone": "UTC", "instant": "2024-04-06T14:00Z"},
                               "control": {"zone": "UTC", "instant": "2024-06-06T14:00Z"}}),
         "check_failed", "passed", "load()"),
        (verdict(reproduction={"code": REPRO, "failing": {"zone": "UTC", "instant": "2025-09-01T00:00Z"},
                               "control": {"zone": "UTC", "instant": "2024-06-06T14:00Z"}}),
         "check_failed", "passed", "about this violation"),
        (verdict(user_check=None), "check_failed", "passed", "user_check"),
        (verdict(user_check={"code": USER, "failing": {"zone": "UTC", "instant": "2024-04-06T12:30:00Z"}}),
         "check_failed", "passed", "same zone"),
    ],
)  # fmt: skip
def test_defect_is_rejected_without_proof(engine: Engine, vd: V.Verdict, failing: str, control: str, why: str) -> None:
    reason, _ = check(engine, vd, fake_probe(failing, control))
    assert reason is not None and why in reason


def test_adapter_error_needs_the_code_to_be_right_at_the_violation_point(engine: Engine) -> None:
    rep = {"code": REPRO, "failing": {"zone": "Australia/Lord_Howe", "instant": "2024-04-06T14:00:00Z"}}
    vd = verdict("adapter_error", reproduction=rep)
    reason, _ = check(engine, vd, fake_probe("check_failed", "passed"))
    assert reason is not None and "pass at the violation point" in reason
    probe = fake_probe("passed", "passed")
    assert check(engine, vd, probe)[0] is None
    assert probe.calls == [("Australia/Lord_Howe", 1712412000000)]


def test_intended_and_exception_need_citations(engine: Engine) -> None:
    probe = fake_probe("passed", "passed")
    assert "test or doc" in str(check(engine, verdict("intended_behavior"), probe)[0])
    doc = [Evidence(kind="doc", ref="README.md:2", why="documented")]
    assert check(engine, verdict("intended_behavior", evidence=doc), probe)[0] is None
    assert "invariant" in str(check(engine, verdict("allowed_exception"), probe)[0])


# ---------- the token-gated endpoint serves the session's own tools ----------


def test_verify_token_serves_verification_tools(ws: Path) -> None:
    from timewraith import api

    client = TestClient(api.app)
    s = session(ws)
    api.engine.sessions.add(s)
    h = {"X-TW-Session": s.token}
    try:
        names = {t["name"] for t in client.post("/api/v1/internal/fix-tools/list", headers=h).json()["tools"]}
        assert names == {"list_files", "read_file", "search", "run_probe", "run_tests", "search_issues",
                         "submit_verdict"}  # fmt: skip
        assert "replace" not in names, "Raven cannot edit files"
    finally:
        api.engine.sessions.close(s)
    assert client.post("/api/v1/internal/fix-tools/list", headers=h).status_code == 403
