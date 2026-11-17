"""Adapter repair: rules that break at ordinary instants, Pumpkin's workshop tools, and the baseline decision."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from timewraith import designsession as D
from timewraith import sweep as S
from timewraith.config import Settings
from timewraith.fixsession import ToolError
from timewraith.ingest import git
from timewraith.models import CreateInvestigation, Experiment, InvariantUse, Investigation, Target
from timewraith.pipeline import Engine, _derive_invariants
from timewraith.sandbox import ProbeResult
from timewraith.store import Store

DAY = 86_400_000
POINTS = [S._ms(__import__("datetime").datetime(2025, 6, 11, 12, tzinfo=__import__("datetime").UTC))]


def outputs(date_offset_days: int) -> S.Outputs:
    """Baseline outputs whose `date` is `now` shifted by some days in each zone (0 = correct)."""
    out: S.Outputs = {}
    for zone in S.BASELINE_ZONES:
        rows = []
        for t in POINTS:
            d = S.local_str(t + date_offset_days * DAY, zone)[:10]
            rows.append({"t": t, "r0": {"date": d}, "r1": {"date": d}})
        out[zone] = rows
    return out


LDM = [InvariantUse(id="local_date_matches", reason="r")]


def test_rule_that_breaks_at_ordinary_instants_is_reported() -> None:
    assert S.baseline_violations(outputs(0), LDM) == {}
    broken = S.baseline_violations(outputs(1), LDM)  # `date` is tomorrow: the field means the wrong thing
    assert list(broken) == ["local_date_matches"]


def test_rules_come_from_fields_and_the_zone_rule_is_dropped_for_zone_inputs() -> None:
    invs, notes = _derive_invariants([], ["instant", "next"], "function run(ctx) { return f(ctx.now); }")
    assert [i.id for i in invs] == ["instant_zone_independent", "next_after_now"]
    invs, notes = _derive_invariants([], ["instant"], "function run(ctx) { return f(ctx.now, ctx.tz); }")
    assert invs == [] and any("passes ctx.tz" in n for n in notes)


# ---------- the workshop tools ----------


@pytest.fixture
def ws(tmp_path: Path) -> Path:
    root = tmp_path / "data" / "workspaces" / "case-d" / "repo"
    (root / "src" / "__tw__").mkdir(parents=True)
    (root / "src" / "day.js").write_text("exports.addDay = (d) => new Date(d.getTime() + 86400000);\n", "utf-8")
    git(root, ["init", "-q"])
    git(root, ["add", "-A"])
    git(root, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"])
    (root / "src" / "__tw__" / "exp_1.adapter.js").write_text("module.exports = { run() { return {}; } };\n", "utf-8")
    return root


def session(ws: Path, problems: list[list[str]] | None = None, **over: Any) -> D.DesignSession:
    queue = list(problems or [[]])
    written: list[str] = []
    kw: dict[str, Any] = {
        "ws": ws,
        "tracked": frozenset(git(ws, ["ls-files", "-z"]).split("\0")) - {""},
        "extra_readable": frozenset({"src/__tw__/exp_1.adapter.js"}),
        "adapter_path": "src/__tw__/exp_1.adapter.js",
        "on_event": lambda text, data: None,
        "deadline": time.monotonic() + 60,
        "max_calls": 12,
        "max_runs": 2,
        "max_checks": 2,
        "write": written.append,
        "run_once": lambda zone, ms: ProbeResult("passed", ["date = 2025-06-11"]),
        "baseline": lambda fields: queue.pop(0) if len(queue) > 1 else queue[0],
    }
    kw.update(over)
    s = D.open_session(**kw)
    s.written = written  # type: ignore[attr-defined]
    return s


def test_write_needs_run_and_reads_the_adapter(ws: Path) -> None:
    s = session(ws)
    with pytest.raises(ToolError, match="run"):
        s.call("write_adapter", {"code": "module.exports = {};"})
    s.call("write_adapter", {"code": "module.exports = { run(ctx) { return { date: '2025-06-11' }; } };"})
    assert s.written and s.rewrites == 1  # type: ignore[attr-defined]
    assert "module.exports" in s.call("read_file", {"path": "src/__tw__/exp_1.adapter.js"})


def test_runs_and_checks_have_budgets_and_validate_input(ws: Path) -> None:
    s = session(ws, [["rule local_date_matches breaks"]])
    with pytest.raises(ToolError, match="IANA"):
        s.call("run_adapter", {"zone": "Nowhere/City", "instant": "2025-06-11T12:00Z"})
    assert s.call("run_adapter", {"zone": "UTC", "instant": "2025-06-11T12:00Z"}).startswith("RAN")
    s.call("run_adapter", {"zone": "UTC", "instant": "2025-06-11T12:00Z"})
    with pytest.raises(ToolError, match="2 times"):
        s.call("run_adapter", {"zone": "UTC", "instant": "2025-06-11T12:00Z"})
    with pytest.raises(ToolError, match="Unknown field"):
        s.call("check_baseline", {"fields": ["today"]})
    assert s.call("check_baseline", {"fields": ["date"]}).startswith("PROBLEMS")


def test_submit_with_problems_comes_back_then_is_recorded(ws: Path) -> None:
    s = session(ws, [["rule local_date_matches breaks"]])
    for _ in range(D.MAX_REJECTIONS):
        with pytest.raises(ToolError, match="Not accepted"):
            s.call("submit_adapter", {"fields": ["date"], "claim": "today's date"})
    assert "did not pass" in s.call("submit_adapter", {"fields": ["date"], "claim": "today's date"})
    assert s.submitted == (["date"], "today's date") and s.rejected_reason


def test_clean_submit_is_accepted(ws: Path) -> None:
    s = session(ws, [[]])
    assert s.call("submit_adapter", {"fields": ["date", "value"], "claim": "c"}) == "Adapter recorded. Stop here."
    assert s.rejected_reason is None


def test_run_body_loads_the_adapter_without_its_extension() -> None:
    body = D.run_body("src/__tw__/exp_1.adapter.ts")
    assert "load('src/__tw__/exp_1.adapter')" in body and "a.run(" in body


# ---------- the baseline decision in the pipeline ----------


class Rt:
    name, label = "fake", "Fake"

    def __init__(self, sessions: bool) -> None:
        self.supports_sessions = sessions

    def call(self, *a: object) -> Any:
        raise AssertionError("no single-reply call expected")

    def run_session(self, *a: object) -> str:
        raise AssertionError("not reached: _workshop is replaced")


@pytest.fixture
def engine(ws: Path) -> Engine:
    s = Settings(data_dir=ws.parents[2], agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def experiment() -> Experiment:
    return Experiment(
        id="exp_1", candidate_id="c1", categories=["midnight_rollover"], executability="ready", status="designed",
        fields=["date"], invariants=list(LDM), adapter_path="src/__tw__/exp_1.adapter.js",
    )  # fmt: skip


def case() -> Investigation:
    return Investigation(
        id="case-d",
        created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
    )


def test_broken_rule_goes_to_the_workshop_then_is_dropped(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    e = experiment()
    monkeypatch.setattr(engine, "_sweep", lambda inv, exps, zones, set_name="points": {"exp_1": (outputs(1), [])})
    seen: list[list[str]] = []
    monkeypatch.setattr(engine, "_workshop", lambda inv, rt, ex, problems, t0: seen.append(problems))
    inv = case()
    engine._validate(inv, Rt(sessions=True), [e], time.monotonic())  # type: ignore[arg-type]
    assert len(seen) == 1 and "local_date_matches" in seen[0][0], "Pumpkin gets the broken rule to repair"
    assert e.status == "designed" and e.invariants == [], "still broken after repair: the rule is dropped"
    assert "dropped" in inv.decisions[-1].rule


def test_without_sessions_the_single_reply_redesign_runs(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    e = experiment()
    monkeypatch.setattr(engine, "_sweep", lambda inv, exps, zones, set_name="points": {"exp_1": (outputs(1), [])})
    redesigned: list[str | None] = []
    monkeypatch.setattr(engine, "_design", lambda inv, rt, ex, feedback: redesigned.append(feedback))
    engine._validate(case(), Rt(sessions=False), [e], time.monotonic())  # type: ignore[arg-type]
    assert redesigned and "local_date_matches" in str(redesigned[0])


def test_clean_baseline_keeps_every_rule(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    e = experiment()
    monkeypatch.setattr(engine, "_sweep", lambda inv, exps, zones, set_name="points": {"exp_1": (outputs(0), [])})
    inv = case()
    engine._validate(inv, Rt(sessions=True), [e], time.monotonic())  # type: ignore[arg-type]
    assert [i.id for i in e.invariants] == ["local_date_matches"] and inv.decisions[-1].decision == "accepted"
