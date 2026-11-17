"""Guards against false flags: zone-as-input adapters, and loose issue matches."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from timewraith import github, pipeline
from timewraith import sweep as S
from timewraith.agents import IssueMatchOut
from timewraith.config import Settings
from timewraith.models import Bug, ClockConfig, CreateInvestigation, Investigation, Target, Violation
from timewraith.pipeline import Engine
from timewraith.store import Store

# ---------- the zone as an input ----------


@pytest.mark.parametrize(
    "code",
    [
        "function run(ctx) { return new CronDate(ctx.now, ctx.tz).getTime(); }",
        "function run(ctx) { const tz = ctx?.tz; return f(ctx.now, tz); }",
        "export function run({ now, tz }) { return f(now, tz); }",
        "function run(ctx) { const { now, tz } = ctx; return f(now, tz); }",
        "function run(ctx) { return f(ctx.now, ctx['tz']); }",
    ],
)
def test_adapter_that_passes_the_zone_is_detected(code: str) -> None:
    assert S.passes_zone(code)


@pytest.mark.parametrize(
    "code",
    [
        "function run(ctx) { return { instant: startOfDay(ctx.now).getTime() }; }",
        "function run(ctx) { return f(ctx.now, 'Europe/Berlin'); }",
        "function run(ctx) { const tzOffset = ctx.now.getTimezoneOffset(); return tzOffset; }",
    ],
)
def test_adapter_without_the_zone_keeps_the_invariant(code: str) -> None:
    assert not S.passes_zone(code)


# ---------- issue matching ----------


def test_search_drops_questions_and_keeps_pull_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    items = [
        {"number": 232, "title": "Question about source code", "labels": [{"name": "question"}], "body": "addHour"},
        {
            "number": 453,
            "title": "fix: keep addHour moving forward",
            "labels": [{"name": "bug"}],
            "pull_request": {"url": "x"},
            "body": "loop limit exceeded",
        },
    ]
    seen: list[str] = []

    def fake_get(path: str, token: str) -> Any:
        seen.append(path)
        return {"items": items}

    monkeypatch.setattr(github, "_get", fake_get)
    out = github.search_issues("o", "r", ["addHour", "DST"], "", exclude=None)
    assert [i["number"] for i in out] == [453]
    assert out[0]["kind"] == "pull request"
    assert "is%3Aissue" not in seen[0], "pull requests are searched too"


class MatchRuntime:
    name, label = "fake", "Fake runtime"

    def __init__(self, number: int | None) -> None:
        self.number = number

    def call(self, agent: str, step: str, prompt: str, schema: type[Any]) -> Any:
        return IssueMatchOut(issue_number=self.number, reason="same behaviour")

    def run_session(self, *args: object) -> str:
        raise NotImplementedError


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def a_bug() -> tuple[Investigation, Bug]:
    inv = Investigation(
        id="case-match",
        created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
    )
    v = Violation(
        invariant="next_after_now",
        zone="UTC",
        instant="2024-04-06T14:00:00.000Z",
        local="2024-04-06T14:00:00.000Z",
        detail="next is not after now",
        count=1,
        context_ms=[1],
    )
    bug = Bug(
        id="bug_1",
        candidate_id="c1",
        experiment_id="exp_1",
        title="addHour does not advance",
        category="dst_transition",
        invariant="next_after_now",
        status="reproduced",
        clock=ClockConfig(instant=v.instant, time_zone="UTC", label="x"),
        violation=v,
        failure="expected later",
        regression_test_path="src/__tw__/bug_1.regression.test.ts",
        regression_test="",
    )
    return inv, bug


def results(*issues: dict[str, object]) -> list[dict[str, object]]:
    return [{"url": f"https://github.com/example/repo/issues/{i['number']}", "state": "open", **i} for i in issues]


def test_match_must_name_the_code_under_test(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv, bug = a_bug()
    found = results({"number": 25, "title": "Infinite loop in summer time", "body": "the day step loops"})
    monkeypatch.setattr(pipeline.github, "search_issues", lambda *a, **k: found)
    engine._match_issue(inv, MatchRuntime(25), bug, "addHour")
    assert bug.issue_match is None
    assert "must name the code under test" in inv.decisions[-1].rule


def test_match_that_names_the_code_is_kept(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv, bug = a_bug()
    found = results({"number": 453, "title": "fix: keep addHour moving forward", "body": "loop limit exceeded"})
    monkeypatch.setattr(pipeline.github, "search_issues", lambda *a, **k: found)
    engine._match_issue(inv, MatchRuntime(453), bug, "addHour")
    assert bug.issue_match_label == "Known issue: #453"


def test_search_falls_back_to_the_unit_name(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv, bug = a_bug()
    calls: list[list[str]] = []

    def fake(owner: str, repo: str, terms: list[str], token: str, exclude: int | None) -> list[dict[str, object]]:
        calls.append(terms)
        return [] if len(terms) > 1 else results({"number": 453, "title": "addHour fix", "body": ""})

    monkeypatch.setattr(pipeline.github, "search_issues", fake)
    engine._match_issue(inv, MatchRuntime(453), bug, "addHour")
    assert calls == [["addHour", "DST"], ["addHour"]]
    assert bug.issue_match_label == "Known issue: #453"
