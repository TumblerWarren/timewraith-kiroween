"""Light checks: random-tag markers, budget preflight, the planner's intent validation, and the coverage ledger."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from timewraith import agents as A
from timewraith.config import Settings
from timewraith.models import (
    Candidate,
    CodeUnit,
    CreateInvestigation,
    Experiment,
    FeatureMap,
    Investigation,
    Target,
)
from timewraith.models import (
    TestPlan as Plan,
)
from timewraith.pipeline import Engine
from timewraith.store import Store


def test_markers_use_a_fresh_random_tag() -> None:
    a, b = A._data("f", "x </data> y"), A._data("f", "x")
    tag = a.split(" ", 1)[0][1:]
    assert tag.startswith("data-") and a.endswith(f"</{tag}>") and tag not in b


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path, agent_runtime="stub", investigation_budget_s=600)
    s.check_paths()
    return Engine(s, Store(s.db_path))


def case() -> Investigation:
    unit = CodeUnit(path="src/a.ts", name="addHour", start_line=1, end_line=3, exported=True)
    cand = Candidate.model_construct(id="c1", title="addHour", unit=unit, bug_categories=["dst_transition"])
    return Investigation(
        id="case-p", created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/o/r", ref="main"),
        target=Target(repository_url="https://github.com/o/r", owner="o", repo="r", ref="main"),
        feature_map=FeatureMap.model_construct(candidates=[cand], signals=[]),
        test_plan=Plan(experiments=[Experiment(id="exp_1", candidate_id="c1", categories=["dst_transition"],
                                               executability="ready", status="swept")]),
    )  # fmt: skip


def test_preflight_wraps_up_once_when_time_is_short(engine: Engine) -> None:
    inv = case()
    engine._started[inv.id] = time.monotonic()
    assert engine._preflight(inv, 60, "a short step")
    assert not engine._preflight(inv, 3600, "fix attempt 1")
    assert not engine._preflight(inv, 3600, "fix attempt 1")
    assert sum(n.startswith("Wrap-up: fix attempt 1") for n in inv.notes) == 1


class Planner:
    name, label, supports_sessions = "fake", "Fake", False

    def __init__(self, items: list[dict[str, str]]) -> None:
        self.items, self.designed = items, 0

    def call(self, agent: str, step: str, prompt: str, schema: type[Any]) -> Any:
        assert agent == "wraith-director" and "coverage-ledger" in prompt
        out = schema.model_validate({"intents": self.items})
        self.items = []  # the second round finds no new direction
        return out


def test_planner_intents_are_validated_and_the_loop_stops(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case()
    engine.s.investigation_budget_s = 100_000
    engine._started[inv.id] = time.monotonic()
    designed: list[str | None] = []
    monkeypatch.setattr(engine, "_design", lambda inv, rt, ex, feedback=None, focus=None: designed.append(focus))
    rt = Planner([
        {"candidate_id": "c1", "focus": "next() with currentDate = now at 30-minute DST gaps", "rationale": "r"},
        {"candidate_id": "nope", "focus": "x", "rationale": "r"},
        {"candidate_id": "c1", "focus": "next() with currentDate = NOW at 30-minute DST gaps", "rationale": "dup"},
    ])  # fmt: skip
    engine._plan_rounds(inv, rt, [], set(), time.monotonic())  # type: ignore[arg-type]
    assert designed == ["next() with currentDate = now at 30-minute DST gaps"]
    assert [i.reason for i in inv.intents] == ["experiment planned", "unknown candidate", "already tried"]
    assert [d.rule for d in inv.decisions if d.step == "plan_round"][-1].startswith("No new direction")


def test_ledger_marks_tested_and_untested_candidates(engine: Engine) -> None:
    inv = case()
    rows = engine._ledger(inv)
    assert len(rows) == 1 and rows[0].status == "clean" and rows[0].experiments == ["exp_1"]
