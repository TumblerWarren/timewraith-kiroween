"""Continue: after the agents stopped (usage limit, expired sign-in, throttle) the unfinished steps run again."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from timewraith import agents as A
from timewraith import resume as R
from timewraith import sandbox
from timewraith.config import Settings
from timewraith.models import (
    Bug,
    CapabilityReport,
    ClockConfig,
    CreateInvestigation,
    EnvironmentCheck,
    Experiment,
    Fix,
    InvariantUse,
    Investigation,
    SweepResult,
    Target,
    TestPlan,
    Violation,
)
from timewraith.pipeline import Engine, Stop
from timewraith.store import Store

LIMIT = "Kiro usage limit reached for this account. Agent steps cannot run until the limit resets or the plan changes."


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub", throttle_waits_s=())
    s.check_paths()
    return Engine(s, Store(s.db_path))


def violation(rule: str = "calendar_contract", kind: str = "k1") -> Violation:
    return Violation(
        failure_kind=kind, invariant=rule, zone="UTC", instant="2026-11-30T23:59:59.999Z", local="x", detail="d"  # type: ignore[arg-type]
    )  # fmt: skip


def exp(i: str, status: str = "swept") -> Experiment:
    return Experiment(
        id=i, candidate_id="c", categories=["midnight_rollover"], executability="ready", status=status,  # type: ignore[arg-type]
        fields=["value"], invariants=[InvariantUse(id="well_formed", reason="r")],
        adapter_path=f"a/__tw__/{i}.adapter.ts",
    )  # fmt: skip


def bug(i: str, experiment_id: str, label: str = "Fix not started", state: str = "not-started") -> Bug:
    return Bug(
        id=i, candidate_id="c", experiment_id=experiment_id, title="t", category="midnight_rollover",
        invariant="calendar_contract", status="reproduced",
        clock=ClockConfig(instant="2026-01-01T00:00:00.000Z", time_zone="UTC", label="l"),
        violation=violation(), failure="f", regression_test_path="p", regression_test="t",
        fix=Fix(state=state, label=label),  # type: ignore[arg-type]
    )  # fmt: skip


def case(engine: Engine, experiments: list[Experiment]) -> Investigation:
    inv = Investigation(
        id="case-c",
        created_at="2026-11-19T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
    )
    inv.stage = "completed"
    inv.test_plan = TestPlan(experiments=experiments)
    inv.capabilities = CapabilityReport(test_runner="vitest", package_manager="pnpm")  # type: ignore[arg-type]
    return inv


def decide(engine: Engine, inv: Investigation, step: str, subject: str, decision: str, checks: list[str]) -> None:
    engine._decide(
        inv, agent="pumpkin-mechanic", step=step, subject=subject, claim="c", evidence=[], dropped=0,
        checks=checks, decision=decision, rule="r",
    )  # fmt: skip


# ---------- finding what is unfinished ----------


def test_a_case_the_agents_finished_has_nothing_to_continue(engine: Engine) -> None:
    inv = case(engine, [exp("exp_1")])
    assert not R.find_gaps(inv).any and engine.unfinished(inv) == []


def test_every_kind_of_unfinished_step_is_found_from_the_record(engine: Engine) -> None:
    """The shape of the real date-fns case: repairs not started, a violation nobody judged, no planner round."""
    inv = case(engine, [exp("exp_a", "adapter_invalid"), exp("exp_b"), exp("exp_c", "not_designed")])
    inv.test_plan.experiments[2].executability_reason = f"Experiment not designed: {LIMIT}"  # type: ignore[union-attr]
    decide(
        engine, inv, "repair_adapter", "exp_a", "not_run", [f"Repair not started: the agent was unavailable: {LIMIT}"]
    )
    inv.sweeps = [
        SweepResult(experiment_id="exp_b", points_run=1, zones=["UTC"], violations=[violation(), violation(kind="k2")])
    ]
    decide(engine, inv, "judge_violation", "exp_b", "not_run", [LIMIT])
    decide(engine, inv, "judge_violation", "exp_b", "not_run", [LIMIT])
    decide(engine, inv, "plan_round", "round 1", "not_run", [LIMIT])
    inv.bugs = [bug("bug_1", "exp_b", f"No fix attempted: {LIMIT}", "no-safe-fix")]
    gaps = R.find_gaps(inv)
    assert (gaps.design, gaps.repair, gaps.judge, gaps.planner, gaps.fix) == (
        ["exp_c"],
        ["exp_a"],
        {"exp_b": 2},
        True,
        ["bug_1"],
    )
    assert R.describe(gaps) == [
        "1 experiment was never designed",
        "1 adapter repair did not start",
        "2 repeated violations were never judged",
        "the planner's next round did not run",
        "1 fix was not attempted",
    ]


def test_a_step_the_agent_ran_and_failed_is_finished_not_unfinished(engine: Engine) -> None:
    """A rejected repair, a verdict, or an agent that did not submit is a result. Running it again repeats the work."""
    inv = case(engine, [exp("exp_a", "adapter_invalid"), exp("exp_b", "adapter_invalid")])
    decide(engine, inv, "repair_adapter", "exp_a", "rejected", ["28 tool calls", "still fails the baseline check"])
    decide(
        engine, inv, "repair_adapter", "exp_b", "not_run", ["28 tool calls, 0 runs"]
    )  # did not submit: not unavailable
    inv.bugs = [bug("bug_1", "exp_a", "No fix attempted: the sandbox failed", "no-safe-fix")]
    assert not R.find_gaps(inv).any


def test_a_repair_that_was_retried_after_the_stop_is_no_longer_unfinished(engine: Engine) -> None:
    inv = case(engine, [exp("exp_a", "adapter_invalid")])
    decide(
        engine, inv, "repair_adapter", "exp_a", "not_run", [f"Repair not started: the agent was unavailable: {LIMIT}"]
    )
    assert R.find_gaps(inv).repair == ["exp_a"]
    decide(engine, inv, "repair_adapter", "exp_a", "rejected", ["28 tool calls"])
    assert R.find_gaps(inv).repair == [], "the latest decision is the agent's own answer"


def test_only_the_groups_after_the_judged_ones_are_left(engine: Engine) -> None:
    inv = case(engine, [exp("exp_b")])
    inv.sweeps = [
        SweepResult(
            experiment_id="exp_b",
            points_run=1,
            zones=["UTC"],
            violations=[violation(kind="k1"), violation(kind="k2"), violation(kind="k3")],
        )  # fmt: skip
    ]
    decide(engine, inv, "judge_violation", "exp_b", "rejected", ["verdict adapter_error"])  # group 1: judged
    decide(engine, inv, "judge_violation", "exp_b", "not_run", [LIMIT])  # group 2: the agent stopped
    decide(engine, inv, "judge_violation", "exp_b", "not_run", [LIMIT])  # group 3
    left = R.unjudged(inv, inv.test_plan.experiments[0])  # type: ignore[union-attr]
    assert [v.failure_kind for v in left] == ["k2", "k3"]
    decide(engine, inv, "judge_violation", "exp_b", "rejected", ["verdict"])
    decide(engine, inv, "judge_violation", "exp_b", "rejected", ["verdict"])
    assert R.unjudged(inv, inv.test_plan.experiments[0]) == [], "once judged they are done"  # type: ignore[union-attr]


def test_a_violation_that_did_not_repeat_counts_as_judged(engine: Engine) -> None:
    inv = case(engine, [exp("exp_b")])
    inv.sweeps = [
        SweepResult(
            experiment_id="exp_b", points_run=1, zones=["UTC"], violations=[violation(kind="k1"), violation(kind="k2")]
        )
    ]
    decide(engine, inv, "repeat", "exp_b", "rejected", ["1/3 clean repeats"])
    decide(engine, inv, "judge_violation", "exp_b", "not_run", [LIMIT])
    assert [v.failure_kind for v in R.unjudged(inv, inv.test_plan.experiments[0])] == ["k2"]  # type: ignore[union-attr]


def test_a_running_case_has_nothing_to_continue_yet(engine: Engine) -> None:
    inv = case(engine, [exp("exp_a", "adapter_invalid")])
    decide(engine, inv, "repair_adapter", "exp_a", "not_run", [f"the agent was unavailable: {LIMIT}"])
    inv.stage = "experimenting"
    assert engine.unfinished(inv) == []
    inv.stage = "completed"
    engine._working.add(inv.id)
    assert engine.unfinished(inv) == []


# ---------- starting it ----------


class SignedIn:
    def __init__(self, ok: bool) -> None:
        self.ok = ok

    def signed_in(self, fresh: bool = False) -> bool:
        return self.ok


@pytest.fixture
def stopped(engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Investigation:
    inv = case(engine, [exp("exp_a", "adapter_invalid"), exp("exp_b")])
    decide(
        engine, inv, "repair_adapter", "exp_a", "not_run", [f"Repair not started: the agent was unavailable: {LIMIT}"]
    )
    inv.test_plan.experiments[0].failure_kind = "throttled"  # type: ignore[union-attr]
    inv.test_plan.experiments[0].executability_reason = "no output"  # type: ignore[union-attr]
    inv.notes = [LIMIT, "Attention: 1 of 2 experiments could not run.", "Dependencies installed after 1 repair(s): x"]
    inv.status = "inconclusive"
    engine.store.save(inv)
    ws = engine._ws(inv)
    (ws / ".git").mkdir(parents=True)
    monkeypatch.setattr(sandbox, "docker_available", lambda: (True, "ok"))
    monkeypatch.setattr("timewraith.crew.manager", SignedIn(True))
    return inv


def start(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    started: list[Any] = []
    monkeypatch.setattr(engine, "_start", lambda inv_id, fn: started.append((inv_id, fn)))
    return started


def test_continue_needs_a_signed_in_account(
    engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("timewraith.crew.manager", SignedIn(False))
    started = start(engine, monkeypatch)
    with pytest.raises(Stop) as e:
        engine.continue_case(stopped.id)
    assert e.value.code == "not_signed_in" and "Crew page" in str(e.value) and not started


def test_continue_refuses_when_nothing_is_left_or_the_case_is_busy(
    engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch
) -> None:
    start(engine, monkeypatch)
    engine._working.add(stopped.id)
    with pytest.raises(Stop) as busy:
        engine.continue_case(stopped.id)
    assert busy.value.code == "busy"
    engine._working.discard(stopped.id)
    done = engine._get(stopped.id)
    done.decisions = []
    engine.store.save(done)
    with pytest.raises(Stop) as nothing:
        engine.continue_case(stopped.id)
    assert nothing.value.code == "nothing_to_continue"


def test_continue_needs_the_checkout(engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch) -> None:
    start(engine, monkeypatch)
    (engine._ws(stopped) / ".git").rmdir()
    with pytest.raises(Stop) as e:
        engine.continue_case(stopped.id)
    assert e.value.code == "workspace_missing"


def test_continue_puts_the_case_back_to_where_the_agents_stopped(
    engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch
) -> None:
    started = start(engine, monkeypatch)
    engine.continue_case(stopped.id)
    inv = engine._get(stopped.id)
    assert inv.stage == "experimenting" and inv.error is None
    assert inv.notes == ["Dependencies installed after 1 repair(s): x"], (
        "the notes about the stop are gone, the rest stay"
    )
    a = inv.test_plan.experiments[0]  # type: ignore[union-attr]
    assert (a.status, a.failure_kind, a.executability_reason) == ("designed", None, None)
    assert inv.status == "planned", "no longer inconclusive"
    assert len(started) == 1 and started[0][0] == stopped.id
    assert inv.decisions, "the record of what happened stays"


# ---------- running it ----------


class Calls:
    """Stands in for every agent step and records what the continuation asked for, in order."""

    def __init__(self, engine: Engine, monkeypatch: pytest.MonkeyPatch, inv: Investigation) -> None:
        self.log: list[tuple[Any, ...]] = []
        self.verified: list[str] = []
        self.engine, self.inv = engine, inv
        engine._ws(inv).mkdir(parents=True, exist_ok=True)
        (engine._ws(inv) / "node_modules").mkdir(exist_ok=True)
        monkeypatch.setattr(engine, "_runtime", lambda i: type("Rt", (), {"supports_sessions": True})())
        monkeypatch.setattr(
            engine, "_design", lambda i, rt, e, feedback=None, focus=None: self.log.append(("design", e.id))
        )
        monkeypatch.setattr(
            engine, "_validate", lambda i, rt, exps, t0: self.log.append(("validate", [e.id for e in exps]))
        )
        monkeypatch.setattr(
            engine, "_sweep_and_verify", lambda i, rt, exps, keys: self.log.append(("sweep", [e.id for e in exps]))
        )
        monkeypatch.setattr(engine, "_verify", self.verify)
        monkeypatch.setattr(
            engine, "_plan_rounds", lambda i, rt, valid, keys, t0, first=1: self.log.append(("plan", first))
        )
        monkeypatch.setattr(
            engine, "_fix_bugs", lambda i, rt, bugs, valid, keys, t0: self.log.append(("fix", [b.id for b in bugs]))
        )
        monkeypatch.setattr(engine, "_install", lambda *a: self.log.append(("install",)))
        monkeypatch.setattr(engine, "_reveal", lambda i, rt: None)
        monkeypatch.setattr(engine, "_preflight", lambda *a: True)

    def verify(self, inv: Investigation, rt: object, ex: Experiment, v: Violation, **kw: Any) -> Bug | None:
        self.log.append(("verify", ex.id, v.failure_kind))
        return bug(f"bug_{v.failure_kind}", ex.id)


def test_continue_runs_only_what_the_agents_did_not_finish(
    engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv = stopped
    inv.test_plan.experiments.append(exp("exp_c", "not_designed"))  # type: ignore[union-attr]
    inv.test_plan.experiments[2].executability_reason = f"Experiment not designed: {LIMIT}"  # type: ignore[union-attr]
    inv.sweeps = [
        SweepResult(
            experiment_id="exp_b", points_run=1, zones=["UTC"], violations=[violation(kind="k1"), violation(kind="k2")]
        )
    ]
    decide(engine, inv, "judge_violation", "exp_b", "rejected", ["verdict"])  # k1 was judged
    decide(engine, inv, "judge_violation", "exp_b", "not_run", [LIMIT])  # k2 was not
    decide(engine, inv, "plan_round", "round 1", "not_run", [LIMIT])
    inv.environment = EnvironmentCheck(status="ok", runner_config=".tw/runner-" + "a" * 32 + ".mjs")
    engine.store.save(inv)
    calls = Calls(engine, monkeypatch, inv)
    gaps = R.find_gaps(inv)
    engine._forget_stop(inv, gaps)
    for e in inv.test_plan.experiments:  # type: ignore[union-attr]
        if e.id == "exp_c":
            e.status = "designed"  # what the design step does with it
    engine._continue_run(inv, gaps)
    assert calls.log[0] == ("design", "exp_c"), "never-designed experiments are designed first"
    assert ("validate", ["exp_c", "exp_a"]) in calls.log, "then the experiments whose repair did not start"
    assert ("sweep", ["exp_c", "exp_a"]) in calls.log, "and the ones that pass their baseline are swept"
    assert ("verify", "exp_b", "k2") in calls.log and ("verify", "exp_b", "k1") not in calls.log, (
        "only the unjudged group"
    )
    assert ("plan", 1) in calls.log, "the planner's round that did not run, from the first unused round"
    assert calls.log[-1] == ("fix", ["bug_k2"]), "and the fix for the bug that was just reproduced"
    assert inv.stage == "completed" and [b.id for b in inv.bugs] == ["bug_k2"]
    assert not any(c[0] == "install" for c in calls.log), "dependencies are already there"


def test_experiments_that_come_back_share_the_profile_found_before(
    engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv = stopped
    profile = ".tw/runner-" + "b" * 32 + ".mjs"
    inv.environment = EnvironmentCheck(status="ok", runner_config=profile)
    engine.store.save(inv)
    calls = Calls(engine, monkeypatch, inv)
    gaps = R.find_gaps(inv)
    engine._forget_stop(inv, gaps)
    monkeypatch.setattr(engine, "_environment", lambda *a: pytest.fail("the environment was already checked"))
    engine._continue_run(inv, gaps)
    assert inv.test_plan.experiments[0].runner_config == profile  # type: ignore[union-attr]
    assert ("validate", ["exp_a"]) in calls.log


def test_the_environment_is_checked_when_it_never_was(
    engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = Calls(engine, monkeypatch, stopped)
    asked: list[Any] = []
    monkeypatch.setattr(engine, "_environment", lambda i, rt, exps, t0: asked.append([e.id for e in exps]) or True)
    gaps = R.find_gaps(stopped)
    engine._forget_stop(stopped, gaps)
    engine._continue_run(stopped, gaps)
    assert asked == [["exp_a"]] and ("validate", ["exp_a"]) in calls.log


def test_a_continued_case_ends_with_fresh_notes_about_what_is_still_wrong(
    engine: Engine, stopped: Investigation, monkeypatch: pytest.MonkeyPatch
) -> None:
    stopped.environment = EnvironmentCheck(status="ok")
    Calls(engine, monkeypatch, stopped)
    gaps = R.find_gaps(stopped)
    engine._forget_stop(stopped, gaps)
    monkeypatch.setattr(engine, "_validate", lambda i, rt, exps, t0: None)  # exp_a stays designed: never judged
    engine._continue_run(stopped, gaps)
    assert stopped.stage == "completed"
    assert not any(n == LIMIT for n in stopped.notes), "the old stop is not repeated"


def test_the_api_reports_what_is_unfinished_and_can_continue_it(engine: Engine, stopped: Investigation) -> None:
    from fastapi.testclient import TestClient

    from timewraith import api

    assert api.engine.unfinished(case(api.engine, [exp("x")])) == []
    client = TestClient(api.app)
    assert client.post("/api/v1/investigations/nope/continue").status_code in {403, 404}
    assert client.post("/api/v1/investigations/nope/continue", headers={"X-TimeWraith": "1"}).status_code == 404


def test_the_unavailable_words_the_pipeline_writes_are_all_recognised() -> None:
    for text in (
        A.QUOTA_MESSAGE,
        A.SIGN_IN_MESSAGE,
        "Repair not started: the agent was unavailable: pumpkin-mechanic could not run: throttled",
        "No fix attempted: Kiro usage limit reached",
    ):
        assert R.STOPPED.search(text), text
    for text in (
        "28 tool calls, 0 runs",
        "The repaired adapter still fails the baseline check",
        "verdict adapter_error",
    ):
        assert not R.STOPPED.search(text), text
    assert time.monotonic() > 0
