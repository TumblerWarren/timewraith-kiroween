"""A case that found nothing says how much it tested; most experiments failing to run is not a clean result."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from timewraith import sandbox
from timewraith.config import Settings
from timewraith.models import (
    CreateInvestigation,
    Experiment,
    InvariantUse,
    Investigation,
    Target,
    TestPlan,
)
from timewraith.pipeline import Engine
from timewraith.store import Store


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path, agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def case(statuses: dict[str, str], reasons: dict[str, str] | None = None) -> Investigation:
    inv = Investigation(
        id="case-i",
        created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
    )
    exps = [
        Experiment(
            id=name, candidate_id="c", categories=["midnight_rollover"], executability="ready", status=status,  # type: ignore[arg-type]
            executability_reason=(reasons or {}).get(name),
        )
        for name, status in statuses.items()
    ]  # fmt: skip
    inv.test_plan = TestPlan(experiments=exps)
    return inv


HARNESS = "No output: the runner did not collect the harness; UTC: no harness output. No test files found"


def test_most_experiments_not_running_is_inconclusive_not_clean(engine: Engine) -> None:
    inv = case(
        {"a": "swept", "b": "swept", "c": "adapter_invalid", "d": "adapter_invalid", "e": "adapter_invalid"},
        {"c": HARNESS, "d": HARNESS, "e": "the adapter threw"},
    )
    engine._report_no_anomaly(inv)
    assert inv.status == "inconclusive"
    note = inv.notes[-1]
    assert "only 2 of 5 experiments could run" in note and "x2" in note and "No output" in note


def test_a_case_where_nearly_everything_ran_is_clean_and_states_the_numbers(engine: Engine) -> None:
    inv = case({n: "swept" for n in "abcdefghi"} | {"j": "adapter_invalid"}, {"j": HARNESS})
    engine._report_no_anomaly(inv)
    assert inv.status == "planned"
    assert "9 of 10 experiments ran" in inv.notes[-1] and "1 could not run" in inv.notes[-1]


def test_the_threshold_is_a_setting(engine: Engine) -> None:
    inv = case({"a": "swept", "b": "adapter_invalid"}, {"b": HARNESS})
    engine.s.min_experiments_ran = 0.5
    engine._report_no_anomaly(inv)
    assert inv.status == "planned"


# ---------- repair rounds ----------


class Rt:
    name, label = "fake", "Fake"
    supports_sessions = True

    def call(self, *a: object) -> Any:
        raise AssertionError("not used")


def broken() -> Experiment:
    return Experiment(
        id="exp_1", candidate_id="c1", categories=["midnight_rollover"], executability="ready", status="designed",
        fields=["date"], invariants=[InvariantUse(id="well_formed", reason="r")],
        adapter_path="src/__tw__/exp_1.adapter.ts",
    )  # fmt: skip


def test_a_rejected_repair_is_retried_and_told_why(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv, e = case({}), broken()
    monkeypatch.setattr(
        engine, "_sweep", lambda inv, exps, zones, set_name="points": {"exp_1": ({}, ["no harness output"])}
    )
    seen: list[list[str]] = []

    def workshop(inv: Investigation, rt: object, ex: Experiment, problems: list[str], t0: float) -> bool:
        seen.append(problems)
        engine._repair_notes[ex.id] = f"config {len(seen)} did not collect the harness"
        return False

    monkeypatch.setattr(engine, "_workshop", workshop)
    engine._validate(inv, Rt(), [e], time.monotonic())  # type: ignore[arg-type]
    assert len(seen) == engine.s.adapter_repair_rounds >= 2
    assert not any("previous repair" in p for p in seen[0])
    assert any("previous repair was rejected: config 1 did not" in p for p in seen[1])
    assert e.status == "adapter_invalid"
    assert "last repair rejected: config 2" in (e.executability_reason or "")


def test_a_repair_that_cannot_start_leaves_a_decision(engine: Engine) -> None:
    inv, e = case({}), broken()
    engine._repair_skipped(inv, e, "the limit of 40 agent calls is used up")
    last = inv.decisions[-1]
    assert last.step == "repair_adapter" and last.decision == "not_run"
    assert "40 agent calls" in last.checks[0]


def test_vitest_gets_a_scratch_folder_for_the_config_it_loads() -> None:
    """Vite writes node_modules/.vite-temp while loading any config; the probe repository is read-only."""
    assert "node_modules/.vite-temp" in sandbox.runner_caches("vitest")
    assert sandbox.runner_caches("jest") == ()
    assert sandbox.runner_caches(None) == ()


def test_a_monorepo_gets_a_scratch_folder_beside_every_vitest_config(tmp_path: Path) -> None:
    """date-fns keeps a vitest config per package; vite writes .vite-temp next to each one it loads."""
    for rel in (
        "vitest.config.ts",
        "pkgs/utc/vitest.config.ts",
        "pkgs/core/vitest.config.mts",
        "node_modules/x/vitest.config.js",
    ):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text("export default {}", encoding="utf-8")
    caches = sandbox.runner_caches("vitest", tmp_path)
    assert "node_modules/.vite-temp" in caches
    assert "pkgs/utc/node_modules/.vite-temp" in caches and "pkgs/core/node_modules/.vite-temp" in caches
    assert not any(c.startswith("node_modules/x") for c in caches), "never inside installed packages"
    assert sandbox.runner_caches("jest", tmp_path) == ()


def test_scratch_folders_are_writable_by_the_sandbox_user(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """A tmpfs defaults to a root-only 755 folder; the sandbox runs as uid 1000, so the runner could not write to it."""
    seen: list[list[str]] = []

    def fake_run(args: list[str], **kw: object) -> Any:
        seen.append(args)
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(sandbox.subprocess, "run", fake_run)
    s = Settings(data_dir=tmp_path)
    s.check_paths()
    sandbox.run(
        s, tmp_path, "22", "true", network=False, timeout=5, readonly=True, scratch=("node_modules/.vite-temp",)
    )
    mount = next(a for a in seen[0] if a.startswith("/work/node_modules/.vite-temp"))
    assert "mode=1777" in mount


# ---------- the notice a finished run leaves ----------


def test_a_run_that_could_not_test_most_of_its_experiments_says_so(engine: Engine) -> None:
    """date-fns: 5 swept, 6 invalid, two repairs refused by a throttled agent service, one violation dismissed."""
    inv = case(
        {**{f"s{i}": "swept" for i in range(5)}, **{f"x{i}": "adapter_invalid" for i in range(6)}},
        {f"x{i}": "No output: the runner did not collect or could not load the harness" for i in range(6)},
    )
    for name in ("x0", "x1"):
        engine._repair_skipped(
            inv, next(e for e in inv.test_plan.experiments if e.id == name), "the agent was unavailable: throttled"
        )  # type: ignore[union-attr]
    engine._run_health(inv)
    note = inv.notes[-1]
    assert note.startswith("Attention: ") and "6 of 11 experiments could not run" in note
    assert "refused 2 repair request(s)" in note and "may be incomplete" in note
    assert inv.status == "inconclusive", "no bug and under 70% ran: not a clean result"
    engine._run_health(inv)
    assert sum(n.startswith("Attention: ") for n in inv.notes) == 1, "said once"


def test_a_clean_run_leaves_no_notice(engine: Engine) -> None:
    inv = case({n: "swept" for n in "abcde"})
    engine._run_health(inv)
    assert not inv.notes and inv.status == "planned"


def test_a_case_with_a_bug_keeps_its_status_but_still_says_what_did_not_run(engine: Engine) -> None:
    inv = case({"a": "swept", "b": "adapter_invalid"}, {"b": "adapter threw"})
    inv.status = "reproduced"
    inv.bugs.append(object())  # type: ignore[arg-type]
    engine._run_health(inv)
    assert inv.status == "reproduced" and inv.notes[-1].startswith("Attention: 1 of 2 experiments could not run")
