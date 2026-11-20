"""Adapter repair: rules that break at ordinary instants, Pumpkin's workshop tools, and the baseline decision."""

from __future__ import annotations

import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from timewraith import agents as A
from timewraith import designsession as D
from timewraith import sweep as S
from timewraith.config import Settings
from timewraith.fixsession import ToolError
from timewraith.ingest import git
from timewraith.models import (
    Candidate,
    CapabilityReport,
    CodeUnit,
    CreateInvestigation,
    Experiment,
    FeatureMap,
    InvariantUse,
    Investigation,
    Target,
    TestPlan,
)
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
    assert len(seen) == engine.s.adapter_repair_rounds, "Pumpkin gets every repair round"
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


@pytest.mark.parametrize("citation, retained", [("README.md:1-1", True), ("README.md:9-9", False)])
def test_cited_ordinary_mismatch_reaches_verification(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch, citation: str, retained: bool
) -> None:
    inv, ex = case(), experiment()
    inv.capabilities = CapabilityReport(test_runner="jest")
    inv.sweep_window = S.future_window(datetime.fromisoformat(inv.created_at))
    (ws / "src/day.js").write_text("exports.today = d => new Date(+d + 86400000);", "utf8")
    (ws / "README.md").write_text("today returns the local calendar date of its input.", "utf8")
    git(ws, ["add", "README.md", "src/day.js"])
    inv.feature_map = FeatureMap(
        candidates=[
            Candidate(
                id=ex.candidate_id,
                title="today",
                unit=CodeUnit(path="src/day.js", name="today", start_line=1, end_line=1, exported=True),
                signal_ids=[],
                bug_categories=ex.categories,
                score=4,
                score_parts={},
            )
        ]
    )
    design = A.AdapterOut(
        claim="today reports the local date",
        fields=["date"],
        adapter_code=("exports.run = ctx => ({date: require('../day').today(ctx.now).toLocaleDateString('en-CA')});"),
        invariants=[InvariantUse(id="local_date_matches", reason="API promises local date", expectation_ref=citation)],
    )
    monkeypatch.setattr(engine, "_agent", lambda *args: design.model_copy(deep=True))
    rt = Rt(sessions=True)
    engine._design(inv, rt, ex, None)  # type: ignore[arg-type]
    points = S.baseline_points(inv.sweep_window)
    rows = {
        z: [
            {"t": t, "r0": {"date": S.local_str(t + DAY, z)[:10]}, "r1": {"date": S.local_str(t + DAY, z)[:10]}}
            for t in ts
        ]
        for z, ts in points.items()
    }
    monkeypatch.setattr(engine, "_sweep", lambda *_: {ex.id: (rows, [])})
    repairs = []
    monkeypatch.setattr(engine, "_workshop", lambda *_: repairs.append(True))
    engine._validate(inv, rt, [ex], time.monotonic())  # type: ignore[arg-type]
    assert bool(repairs) != retained
    reviewed = []
    monkeypatch.setattr(engine, "_verify", lambda inv, rt, ex, v: reviewed.append(v.invariant))
    engine._sweep_and_verify(inv, rt, [ex], set())  # type: ignore[arg-type]
    assert reviewed == (["local_date_matches"] if retained else [])
    assert not inv.bugs


def test_bat_discovers_calendar_logic_outside_scan_and_pumpkin_designs_it(engine: Engine, ws: Path) -> None:
    from timewraith.discovery import build_feature_map
    from timewraith.planning import build_test_plan

    path = "src/months.js"
    quote = "return month === 2 ? 28 : 31;"
    (ws / path).write_text(f"export function daysInMonth(year, month) {{\n  {quote}\n}}\n", "utf8")
    inv = case()
    inv.capabilities = CapabilityReport(test_runner="vitest")
    inv.feature_map = build_feature_map(ws, engine.s.max_parse_bytes)
    assert all(c.unit.path != path for c in inv.feature_map.candidates)
    engine.store.save(inv)

    class Crew(Rt):
        def call(self, agent: str, step: str, prompt: str, schema: Any) -> Any:
            if step == "review_candidates":
                assert path in prompt
                return A.ReviewOut(items=[], inspect_paths=[path, "../outside.js"])
            if step == "inspect_js_sources":
                assert quote in prompt
                lead = dict(
                    path=path,
                    line=2,
                    quote=quote,
                    hypothesis="February may be too short",
                    expectation="Leap-year February has 29 days",
                )
                invented = {**lead, "quote": "return month === 3 ? 30 : 31;"}
                # A wrong line number is found again by its quote; an invented quote and an outside path are not.
                items = [lead, lead, {**lead, "line": 50}, invented, {**lead, "path": "../outside.js"}]
                return schema.model_validate({"items": items})
            assert step == "design_experiment" and agent == "pumpkin-mechanic"
            assert "Leap-year February has 29 days" in prompt
            return A.AdapterOut(
                claim="Check February length",
                fields=["value"],
                adapter_code=(
                    "import { daysInMonth } from '../months.js';\n"
                    "export function run(ctx) { return { value: daysInMonth(new Date(ctx.now).getUTCFullYear(), 2) }; }"
                ),
            )

    rt = Crew(sessions=False)
    engine._review(inv, rt)  # type: ignore[arg-type]
    candidate = inv.feature_map.candidates[0]
    assert candidate.unit.path == path and candidate.selected and not candidate.signal_ids
    decisions = [d for d in inv.decisions if d.step == "inspect_js_sources"]
    assert [d.decision for d in decisions] == ["accepted", "rejected", "rejected"]
    assert decisions[0].evidence[0].ref == path + ":2"
    assert "quote is not in the file" in " ".join(decisions[1].checks)
    assert any("return month === 3" in c for c in decisions[1].checks)
    [ex] = build_test_plan(inv.feature_map.candidates, inv.capabilities, 1).experiments
    engine._design(inv, rt, ex, None)  # type: ignore[arg-type]
    assert ex.status == "designed" and ex.harness_path and (ws / ex.harness_path).is_file()
    if node := shutil.which("node"):
        assert ex.adapter_path
        (ws / "package.json").write_text('{"type":"module"}', "utf8")
        check = f"import {{run}} from './{ex.adapter_path}'; console.log(run({{now: Date.UTC(2028, 1, 29)}}).value)"
        result = subprocess.run(
            [node, "--input-type=module", "-e", check], cwd=ws, capture_output=True, text=True, timeout=10, check=True
        )
        assert result.stdout.strip() == "28"


def test_workshop_validates_the_agent_selected_runner_config(ws: Path) -> None:
    configs: list[str] = []

    def baseline(fields: list[str]) -> list[str]:
        return [] if configs and configs[-1] else ["No test files found"]

    s = session(ws, configure_runner=configs.append, baseline=baseline)
    assert "write_runner_config" in {tool["name"] for tool in s.tools}
    assert "No test files found" in s.call("check_baseline", {"fields": ["value"]})
    proposal = 'export default { test: { include: ["**/__tw__/**/*.test.ts"] } };'
    s.call("write_runner_config", {"code": proposal})
    assert s.call("check_baseline", {"fields": ["value"]}).startswith("CLEAN")
    s.call("submit_adapter", {"fields": ["value"], "claim": "Check calendar boundaries"})
    assert configs == [proposal]
    assert s.submitted is not None and s.rejected_reason is None


def test_repair_shell_can_save_fixture_for_baseline(ws: Path) -> None:
    checks: list[str] = []
    s = session(
        ws,
        repair_command=lambda command, left: f"ran {command}",
        save_fixture=lambda name, content: checks.append(content) or f".tw/generated/{name}",
        baseline=lambda _: [] if checks == ['{"day":29}'] else ["missing fixture"],
    )
    assert s.call("run_command", {"command": "cat runner.log"}) == "ran cat runner.log"
    with pytest.raises(ToolError, match="filename"):
        s.call("save_fixture", {"name": "../calendar.json", "content": "{}"})
    output = s.call("save_fixture", {"name": "calendar.json", "content": '{"day":29}'})
    assert output == ".tw/generated/calendar.json"
    assert s.call("check_baseline", {"fields": ["value"]}).startswith("CLEAN")


# ---------- a clock that is earlier than the start ----------


def _early(t: int, nxt: int, early: int) -> S.Outputs:
    rec = {"t": t, "r0": {"next": nxt, "next_early": early}, "r1": {"next": nxt, "next_early": early}}
    return {"America/New_York": [rec]}


FUTURE = [InvariantUse(id="next_clock_independent", reason="r")]


def test_an_answer_that_depends_on_the_clock_is_a_violation() -> None:
    start = S._ms(datetime(2026, 11, 1, 6, 0, tzinfo=S.UTC))
    ok = start + 30 * 60_000
    assert S.check(_early(start, ok, ok), FUTURE) == []
    [before] = S.check(_early(start, ok, start - 30 * 60_000), FUTURE)  # the answer is before the start
    assert before.invariant == "next_clock_independent" and before.failure_kind == "not_after_start"
    [differs] = S.check(_early(start, ok, ok + 3_600_000), FUTURE)  # after the start, but not the same answer
    assert differs.failure_kind == "differs_with_clock" and differs.expected == str(ok)


def test_the_field_brings_its_own_rule_and_the_helper_is_in_the_harness() -> None:
    invs, _ = _derive_invariants([], ["next", "next_early"], "function run(ctx) { return f(ctx.now); }")
    assert [i.id for i in invs] == ["next_after_now", "next_clock_independent"]
    for runner in ("vitest", "jest"):
        code = S.harness_code("exp_1", runner)
        assert "async function atClock" in code and "next_early" in code and "clockJumps, atClock }" in code


def test_the_regression_test_for_it_asserts_the_same_thing() -> None:
    start = S._ms(datetime(2026, 11, 1, 6, 0, tzinfo=S.UTC))
    [v] = S.check(_early(start, start + 1, start - 1), FUTURE)
    code = S.regression_code(exp_id="exp_1", runner="vitest", v=v, title="t", target="main")
    assert "expect(o.next_early).toBeGreaterThan(" in code


# ---------- an experiment that checks nothing about time ----------


def _design_setup(engine: Engine, ws: Path) -> tuple[Investigation, Experiment]:
    from timewraith.discovery import build_feature_map
    from timewraith.planning import build_test_plan

    (ws / "src/months.js").write_text("export function nextAfter(d) { return d; }\n", "utf8")
    inv = case()
    inv.capabilities = CapabilityReport(test_runner="vitest")
    inv.feature_map = build_feature_map(ws, engine.s.max_parse_bytes)
    inv.feature_map.candidates[:] = [
        Candidate(
            id="c1", title="t", rationale="r", selected=True,
            unit=CodeUnit(path="src/months.js", name="nextAfter", start_line=1, end_line=1, exported=True),
            signal_ids=[], score=1, score_parts={}, bug_categories=["other_temporal"],
        )
    ]  # fmt: skip
    engine.store.save(inv)
    [ex] = build_test_plan(inv.feature_map.candidates, inv.capabilities, 1).experiments
    return inv, ex


class _Pumpkin(Rt):
    def __init__(self, fields: list[list[str]]) -> None:
        super().__init__(sessions=False)
        self.fields, self.prompts = fields, []

    def call(self, agent: str, step: str, prompt: str, schema: Any) -> Any:
        self.prompts.append(prompt)
        fields = self.fields[min(len(self.prompts), len(self.fields)) - 1]
        return A.AdapterOut(
            claim="c", fields=fields,
            adapter_code="import { nextAfter } from '../months.js';\nexport function run(ctx) { return { next: 1 }; }",
        )  # fmt: skip


def test_a_design_that_feeds_no_time_rule_is_sent_back_once(engine: Engine, ws: Path) -> None:
    inv, ex = _design_setup(engine, ws)
    rt = _Pumpkin([["value"], ["next"]])
    engine._design(inv, rt, ex, None)  # type: ignore[arg-type]
    assert len(rt.prompts) == 2 and "No output field of your adapter feeds a rule" in rt.prompts[1]
    assert ex.status == "designed" and not ex.weak and [i.id for i in ex.invariants] == ["next_after_now"]
    assert [d.decision for d in inv.decisions if d.step == "design_experiment"] == ["rejected", "accepted"]


def test_a_design_that_stays_weak_runs_and_is_marked(engine: Engine, ws: Path) -> None:
    inv, ex = _design_setup(engine, ws)
    rt = _Pumpkin([["value"], ["value"]])
    engine._design(inv, rt, ex, None)  # type: ignore[arg-type]
    assert len(rt.prompts) == 2, "only one second look"
    assert ex.status == "designed" and ex.weak and ex.invariants == []
    ex.status = "swept"
    inv.test_plan = TestPlan(experiments=[ex])
    engine._run_health(inv)
    assert any("could not find a time bug" in n for n in inv.notes)


# ---------- the reviewer's objection counts only when code can reproduce it ----------

from timewraith.models import Bug, ClockConfig, GateResult, Violation  # noqa: E402

PROBE = "const m = await load('src/time');\ncheck(m.next() === 1, 'next is 1');"
START = "2027-04-03T13:30:00.000Z"
LATER = "2027-04-03T14:30:00.000Z"


def _bug() -> Bug:
    return Bug(
        id="bug_1", candidate_id="c1", experiment_id="exp_1", title="t", category="dst_transition",
        invariant="next_clock_independent", status="reproduced", failure="f",
        clock=ClockConfig(instant=START, time_zone="UTC", label="l"),
        violation=Violation(failure_kind="k", invariant="next_clock_independent", zone="UTC", instant=START,
                            local=START, detail="d"),
        regression_test_path="src/__tw__/bug_1.regression.test.js", regression_test="test()",
        reproduction={"code": "check(true, 'x')"},
    )  # fmt: skip


class _Reviewer(Rt):
    def __init__(self, reply: A.ReviewFixOut) -> None:
        super().__init__(sessions=False)
        self.reply, self.prompts = reply, []

    def call(self, agent: str, step: str, prompt: str, schema: Any) -> Any:
        assert step == "review_fix"
        self.prompts.append(prompt)
        return self.reply


def _review(engine: Engine, ws: Path, mp: pytest.MonkeyPatch, reply: A.ReviewFixOut, statuses: list[str]) -> Any:
    """Run the gate with a fake sandbox that answers probe runs from `statuses`, in order."""
    from timewraith import pipeline as P

    inv = case()
    inv.capabilities = CapabilityReport(test_runner="jest")
    runs: list[str] = []

    def fake_probe(s: Any, w: Path, caps: Any, rel: str, zone: str, ms: int, **kw: Any) -> ProbeResult:
        runs.append(S.iso(ms))
        return ProbeResult(statuses[len(runs) - 1], ["CHECK FAILED: next is 1"])

    mp.setattr(P.sandbox, "probe", fake_probe)
    mp.setattr(engine, "_clean_tree", lambda w: None)
    rt = _Reviewer(reply)
    gate = engine._review_gate(inv, rt, _bug(), "diff", [GateResult(gate="fixed", passed=True, detail="ok")], None)  # type: ignore[arg-type]
    return gate, rt, runs


def _probe(control: str | None = None) -> A.ReviewProbe:
    return A.ReviewProbe(code=PROBE, zone="Australia/Lord_Howe", instant=START, control_instant=control)


def test_an_approval_passes_and_the_reviewer_is_shown_what_already_passed(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate, rt, runs = _review(engine, ws, monkeypatch, A.ReviewFixOut(approve=True, reason="fine"), [])
    assert gate.passed and gate.detail == "fine" and runs == []
    assert "fixed: passed. ok" in rt.prompts[0] and "check(true, 'x')" in rt.prompts[0]


def test_a_worry_without_a_probe_is_a_note_and_does_not_block(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reply = A.ReviewFixOut(approve=False, reason="might skip a run")
    gate, _, runs = _review(engine, ws, monkeypatch, reply, [])
    assert gate.passed and "does not block" in gate.detail and "might skip a run" in gate.detail and runs == []


def test_a_probe_that_fails_on_the_patch_and_passes_on_the_original_blocks_it(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reply = A.ReviewFixOut(approve=False, reason="breaks Lord Howe", probe=_probe())
    gate, _, runs = _review(engine, ws, monkeypatch, reply, ["check_failed"] * 3 + ["passed"])
    assert not gate.passed and "Reproduced by code" in gate.detail and "passes on the original" in gate.detail
    assert len(runs) == 4


def test_a_probe_that_fails_everywhere_does_not_block_without_a_control(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reply = A.ReviewFixOut(approve=False, reason="wrong", probe=_probe())
    gate, _, _ = _review(engine, ws, monkeypatch, reply, ["check_failed"] * 3 + ["check_failed"])
    assert gate.passed and "also fails on the original" in gate.detail


def test_a_control_point_that_passes_makes_an_incomplete_fix_count(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reply = A.ReviewFixOut(approve=False, reason="still wrong", probe=_probe(control=LATER))
    gate, _, runs = _review(engine, ws, monkeypatch, reply, ["check_failed"] * 3 + ["passed", "check_failed"])
    assert not gate.passed and "passes at" in gate.detail and runs[3] == LATER


def test_a_probe_that_passes_on_the_patch_refutes_the_worry(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reply = A.ReviewFixOut(approve=False, reason="wrong", probe=_probe())
    gate, _, runs = _review(engine, ws, monkeypatch, reply, ["passed"])
    assert gate.passed and "did not fail its check" in gate.detail and len(runs) == 1


def test_a_probe_that_does_not_load_the_code_or_has_a_bad_instant_is_not_run(
    engine: Engine, ws: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    no_load = A.ReviewProbe(code="check(false, 'x')", zone="UTC", instant=START)
    gate, _, runs = _review(engine, ws, monkeypatch, A.ReviewFixOut(approve=False, reason="r", probe=no_load), [])
    assert gate.passed and "load()" in gate.detail and runs == []
    bad = A.ReviewProbe(code=PROBE, zone="UTC", instant="yesterday")
    gate, _, runs = _review(engine, ws, monkeypatch, A.ReviewFixOut(approve=False, reason="r", probe=bad), [])
    assert gate.passed and "ISO 8601" in gate.detail and runs == []


def test_the_reply_schema_names_no_length_limit() -> None:
    import json

    assert "maxLength" not in json.dumps(A.ReviewFixOut.model_json_schema())
