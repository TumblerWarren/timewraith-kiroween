"""An adapter must test its candidate; an experiment the environment cannot run is reported, not worked around."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from timewraith import agents as A
from timewraith import designsession as D
from timewraith import environment as E
from timewraith.config import Settings
from timewraith.fixsession import ToolError
from timewraith.ingest import git
from timewraith.models import (
    Candidate,
    CapabilityReport,
    CodeUnit,
    CreateInvestigation,
    EnvironmentCheck,
    Experiment,
    FeatureMap,
    InvariantUse,
    Investigation,
    Target,
    TestPlan,
)
from timewraith.pipeline import Engine
from timewraith.store import Store

TP = "pkgs/core/src/tp/endOfISOWeek/index.ts"  # takes a Temporal.ZonedDateTime
PLAIN = "pkgs/core/src/endOfISOWeek/index.ts"  # the ordinary Date function with the same name
ADAPTER = "pkgs/core/src/tp/endOfISOWeek/__tw__/exp_1.adapter.ts"

TP_SOURCE = "export function tpEndOfISOWeek(date: Temporal.ZonedDateTime): Temporal.ZonedDateTime { return date; }\n"
PLAIN_SOURCE = "export function endOfISOWeek(date: Date): Date { return date; }\n"
OTHER_IMPORT = "import { endOfISOWeek } from '../../../endOfISOWeek/index.ts';"


def env(missing: list[str] | None = None, polyfills: list[str] | None = None) -> EnvironmentCheck:
    return EnvironmentCheck(
        status="ok",
        node="v22.1.0",
        missing_globals=["Temporal"] if missing is None else missing,
        polyfills=polyfills or [],
    )


# ---------- A: the adapter has to reach the code under test ----------


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    for rel, text in {
        TP: TP_SOURCE,
        PLAIN: PLAIN_SOURCE,
        "pkgs/core/src/index.ts": "export * from './endOfISOWeek/index.ts';\n",
        "pkgs/core/src/barrel/index.ts": "export { tpEndOfISOWeek } from '../tp/endOfISOWeek/index.js';\n",
    }.items():
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text(text, encoding="utf-8")
    return tmp_path


def reaches(tree: Path, code: str, unit: str = TP) -> bool | None:
    return E.exercises_unit(tree, ADAPTER, code, unit)


def test_an_adapter_that_imports_the_unit_reaches_it(tree: Path) -> None:
    assert reaches(tree, "import { tpEndOfISOWeek } from '../index.ts';\nexport function run() {}") is True
    assert reaches(tree, "const m = require('../index');\nmodule.exports = { run() {} };") is True, "no extension"


def test_a_typescript_import_spelled_with_js_means_the_ts_file(tree: Path) -> None:
    code = "import { tpEndOfISOWeek } from '../index.js';"
    assert reaches(tree, code) is True


def test_an_adapter_reaches_the_unit_through_files_that_re_export_it(tree: Path) -> None:
    assert reaches(tree, "import { tpEndOfISOWeek } from '../../../barrel/index.ts';") is True


def test_the_same_name_in_another_folder_is_not_the_unit(tree: Path) -> None:
    """The live run: tp/endOfISOWeek was 'repaired' by importing the ordinary endOfISOWeek instead."""
    code = "import { endOfISOWeek } from '../../../endOfISOWeek/index.ts';\nexport function run() {}"
    assert reaches(tree, code) is False
    problem = E.unit_problem(tree, ADAPTER, code, TP)
    assert len(problem) == 1 and TP in problem[0] and "do not swap in a different function" in problem[0]
    assert "../../../endOfISOWeek/index.ts" in problem[0], "it says what the adapter imported"


def test_an_adapter_that_imports_nothing_from_the_repository_does_not_test_it(tree: Path) -> None:
    code = "export function run(ctx) { return { value: 1 }; }"
    assert reaches(tree, code) is False
    assert "imports nothing from the repository" in E.unit_problem(tree, ADAPTER, code, TP)[0]


@pytest.mark.parametrize(
    "code",
    [
        "import { addDays } from 'date-fns';\nexport function run() {}",  # a package by name: cannot be followed
        "const p = '../index';\nconst m = require(p);\nmodule.exports = { run() {} };",  # computed
        "const m = await import(`../${name}`);",
    ],
)
def test_what_cannot_be_read_from_the_text_is_not_a_problem(tree: Path, code: str) -> None:
    assert reaches(tree, code) is None
    assert E.unit_problem(tree, ADAPTER, code, TP) == []


def test_runtime_modules_do_not_make_an_adapter_unreadable(tree: Path) -> None:
    other = "import { x } from '../../../endOfISOWeek/index.ts';"
    code = f"import {{ test }} from 'vitest';\nimport * as fs from 'node:fs';\n{other}"
    assert reaches(tree, code) is False


def test_a_comment_that_mentions_the_unit_does_not_count(tree: Path) -> None:
    code = "// import { tpEndOfISOWeek } from '../index.ts';\n" + OTHER_IMPORT
    assert reaches(tree, code) is False


# ---------- C: failures are judged with what was measured ----------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("UTC 2027-01-15: run() threw: Temporal is not defined", "environment"),
        ("UTC 2027-01-15: run() threw: Intl is not defined", "adapter"),  # not measured as missing here
        ("run() threw: helper is not defined", "adapter"),
        ("Cannot find module 'temporal-polyfill' imported from /work/pkgs/x.ts", "environment"),
        ("Cannot find module '../missing' imported from /work/pkgs/x.ts", "adapter"),
        ("The request was throttled by the service", "throttled"),
    ],
)
def test_a_failure_is_classified_with_the_measured_runtime(text: str, expected: str) -> None:
    assert E.classify(text, env()) == expected


def test_without_measurements_a_missing_global_is_the_adapters(tmp_path: Path) -> None:
    assert E.classify("run() threw: Temporal is not defined") == "adapter"
    assert E.classify("run() threw: Temporal is not defined", EnvironmentCheck(status="failed")) == "adapter"


def test_the_agent_is_told_what_was_measured() -> None:
    assert E.facts_text(None) == "" and E.facts_text(EnvironmentCheck(status="failed")) == ""
    text = E.facts_text(env())
    assert "Node v22.1.0" in text and "Temporal" in text and "No installed package supplies them" in text
    assert "no network" in text
    with_polyfill = E.facts_text(env(polyfills=["temporal-polyfill"]))
    assert "temporal-polyfill" in with_polyfill and "No installed package" not in with_polyfill
    assert "No probed global is missing" in E.facts_text(env(missing=[]))


# ---------- B: the referee for 'blocked' ----------

THREW = "UTC 2027-01-15T12:00:00.000Z: run() threw: Temporal is not defined"


def test_a_missing_global_the_code_under_test_uses_blocks_it() -> None:
    assert E.explains_by_environment(THREW, env(), TP_SOURCE) is True


def test_an_adapter_cannot_provoke_a_missing_global_the_code_never_uses() -> None:
    """The adapter names Temporal itself; the function under test does not need it."""
    assert E.explains_by_environment(THREW, env(), PLAIN_SOURCE) is False


def test_a_failure_the_adapter_can_fix_is_not_a_block() -> None:
    assert E.explains_by_environment("UTC: run() threw: x.map is not a function", env(), TP_SOURCE) is False
    assert E.explains_by_environment("local_date_matches breaks", env(), TP_SOURCE) is False


def test_a_runner_that_cannot_collect_is_a_block_whatever_the_code_is() -> None:
    assert E.explains_by_environment("No test files found, exiting with code 1", env(), PLAIN_SOURCE) is True


# ---------- B: the tool in the session ----------


@pytest.fixture
def ws(tmp_path: Path) -> Path:
    root = tmp_path / "data" / "workspaces" / "case-b" / "repo"
    for rel, text in {TP: TP_SOURCE, PLAIN: PLAIN_SOURCE, ADAPTER: "export function run() { return {}; }\n"}.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")
    git(root, ["init", "-q"])
    git(root, ["add", "-A"])
    git(root, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"])
    return root


def session(ws: Path, **over: Any) -> D.DesignSession:
    kw: dict[str, Any] = {
        "ws": ws,
        "tracked": frozenset(git(ws, ["ls-files", "-z"]).split("\0")) - {""},
        "extra_readable": frozenset({ADAPTER}),
        "adapter_path": ADAPTER,
        "on_event": lambda text, data: None,
        "deadline": time.monotonic() + 60,
        "max_calls": 3,
        "max_runs": 2,
        "max_checks": 2,
        "write": lambda code: None,
        "run_once": lambda zone, ms: None,
        "baseline": lambda fields: ["problem"],
    }
    kw.update(over)
    return D.open_session(**kw)


def test_the_tool_is_offered_only_when_there_is_a_referee(ws: Path) -> None:
    assert "report_blocked" not in {t["name"] for t in session(ws).tools}
    assert "report_blocked" in {t["name"] for t in session(ws, blocked_check=lambda r: None).tools}
    with pytest.raises(ToolError, match="not available"):
        session(ws).call("report_blocked", {"reason": "needs Temporal"})


def test_a_refused_claim_leaves_the_agent_working(ws: Path) -> None:
    s = session(ws, blocked_check=lambda reason: "the adapter's own failure is one it can still fix: x")
    with pytest.raises(ToolError, match="Not accepted: the adapter's own failure"):
        s.call("report_blocked", {"reason": "it is hard"})
    assert s.blocked is None
    assert ADAPTER in s.call("list_files", {}), "the session goes on after a refusal"


def test_an_accepted_claim_ends_the_session(ws: Path) -> None:
    s = session(ws, blocked_check=lambda reason: None)
    assert "blocked by the environment" in s.call("report_blocked", {"reason": "needs Temporal"})
    assert s.blocked == "needs Temporal"
    with pytest.raises(ToolError, match="Already finished"):
        s.call("read_file", {"path": ADAPTER})


def test_a_reason_is_required(ws: Path) -> None:
    with pytest.raises(ToolError, match="Give the reason"):
        session(ws, blocked_check=lambda r: None).call("report_blocked", {"reason": "  "})


def test_an_agent_out_of_tool_calls_can_still_say_it_is_blocked(ws: Path) -> None:
    s = session(ws, max_calls=1, blocked_check=lambda r: None)
    s.call("list_files", {})
    with pytest.raises(ToolError, match="tool budget is used up"):
        s.call("list_files", {})
    s.call("report_blocked", {"reason": "needs Temporal"})
    assert s.blocked


def test_the_prompt_tells_the_agent_what_is_measured_and_what_to_do(ws: Path) -> None:
    prompt = A.prompt_design_session(
        unit="tpEndOfISOWeek", path=TP, start_line=1, adapter_path=ADAPTER, adapter="x", fields=[], rules=[],
        problems=["p"], catalog="c", tool_calls=10, environment=E.facts_text(env()),
    )  # fmt: skip
    assert (
        "report_blocked" in prompt
        and f"import {TP}" in prompt
        and "Globals this runtime does not have: Temporal" in prompt
    )
    assert "Test environment" not in A.prompt_design_session(
        unit="u", path=TP, start_line=1, adapter_path=ADAPTER, adapter="x", fields=[], rules=[],
        problems=["p"], catalog="c", tool_calls=10,
    )  # fmt: skip


# ---------- the pipeline ----------


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub", throttle_waits_s=())
    s.check_paths()
    return Engine(s, Store(s.db_path))


def case(ws: Path, engine: Engine, adapter_code: str) -> tuple[Investigation, Experiment]:
    inv = Investigation(
        id="case-b",
        created_at="2026-11-19T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
    )
    inv.capabilities = CapabilityReport(test_runner="vitest", package_manager="pnpm")  # type: ignore[arg-type]
    inv.environment = env()
    ex = Experiment(
        id="exp_1", candidate_id="c1", categories=["midnight_rollover"], executability="ready", status="designed",
        fields=["value"], invariants=[InvariantUse(id="well_formed", reason="r")], adapter_path=ADAPTER,
        harness_path="pkgs/core/src/tp/endOfISOWeek/__tw__/index.exp_1.tw.test.ts", adapter_code=adapter_code,
    )  # fmt: skip
    inv.test_plan = TestPlan(experiments=[ex])
    inv.feature_map = FeatureMap(
        candidates=[
            Candidate(
                id="c1", title="tpEndOfISOWeek",
                unit=CodeUnit(path=TP, name="tpEndOfISOWeek", start_line=1, end_line=1, exported=True),
                signal_ids=[], bug_categories=["midnight_rollover"], score=1, score_parts={},
            )
        ]
    )  # fmt: skip
    engine._ws = lambda i: ws  # type: ignore[method-assign]
    (ws / ADAPTER).write_text(adapter_code, encoding="utf-8")
    return inv, ex


def clean(inv: Investigation, exps: list[Experiment], zones: list[str], set_name: str = "points") -> Any:
    rows = [{"t": 1_800_000_000_000, "r0": {"value": "1"}, "r1": {"value": "1"}}]
    return {e.id: ({z: rows for z in zones}, []) for e in exps}


RETARGETED = OTHER_IMPORT + "\nexport function run(ctx) { return { value: 1 }; }\n"
HONEST = "import { tpEndOfISOWeek } from '../index.ts';\nexport function run(ctx) { return { value: 1 }; }\n"


class Rt:
    name, label, supports_sessions = "fake", "Fake", True

    def __init__(self, act: Any = None) -> None:
        self.act = act

    def call(self, *a: object) -> Any:
        raise AssertionError("not used")

    def run_session(self, agent: str, step: str, prompt: str, session: Any, timeout: int) -> str:
        if self.act:
            self.act(session)
        return ""


def test_an_adapter_that_passes_by_testing_another_function_is_sent_back(
    ws: Path, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, ex = case(ws, engine, RETARGETED)
    monkeypatch.setattr(engine, "_sweep", clean)
    seen: list[list[str]] = []
    monkeypatch.setattr(engine, "_workshop", lambda inv, rt, e, problems, t0: seen.append(problems))
    engine._validate(inv, Rt(), [ex], time.monotonic())  # type: ignore[arg-type]
    assert seen and "never reaches the code under test" in seen[0][0] and TP in seen[0][0]
    assert ex.status == "adapter_invalid" and ex.failure_kind == "adapter"
    assert "never reaches the code under test" in (ex.executability_reason or "")


def test_an_adapter_that_tests_its_candidate_and_runs_cleanly_is_accepted(
    ws: Path, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, ex = case(ws, engine, HONEST)
    monkeypatch.setattr(engine, "_sweep", clean)
    monkeypatch.setattr(engine, "_workshop", lambda *a: pytest.fail("a clean adapter is not repaired"))
    engine._validate(inv, Rt(), [ex], time.monotonic())  # type: ignore[arg-type]
    assert ex.status == "designed" and ex.failure_kind is None


def test_the_agent_in_a_repair_cannot_submit_the_other_function(
    ws: Path, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The baseline the session runs includes the same gate, so the submission comes back to the agent."""
    inv, ex = case(ws, engine, RETARGETED)
    monkeypatch.setattr(engine, "_sweep", clean)
    answers: list[str] = []

    def act(session: D.DesignSession) -> None:
        try:
            session.call("submit_adapter", {"fields": ["value"], "claim": "tests the week end"})
        except ToolError as e:
            answers.append(str(e))

    engine._workshop(inv, Rt(act), ex, ["it fails"], time.monotonic())  # type: ignore[arg-type]
    assert answers and "never reaches the code under test" in answers[0]


def threw(inv: Investigation, exps: list[Experiment], zones: list[str], set_name: str = "points") -> Any:
    rows = [
        {"t": 1_800_000_000_000, "r0": {"error": "Temporal is not defined"}, "r1": {"error": "Temporal is not defined"}}
    ]
    return {e.id: ({z: rows for z in zones}, []) for e in exps}


TEMPORAL_ADAPTER = (
    "import { tpEndOfISOWeek } from '../index.ts';\n"
    "export function run(ctx) { return { value: Temporal.Now.instant().toString() }; }\n"
)


def test_an_experiment_the_environment_cannot_run_is_recorded_as_blocked_and_not_repaired_again(
    ws: Path, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, ex = case(ws, engine, TEMPORAL_ADAPTER)
    monkeypatch.setattr(engine, "_sweep", threw)
    reason = (
        "tpEndOfISOWeek takes a Temporal.ZonedDateTime and this Node has no Temporal; nothing installed supplies it."
    )
    rounds: list[int] = []

    def act(session: D.DesignSession) -> None:
        rounds.append(1)
        assert "report_blocked" in {t["name"] for t in session.tools}
        session.call("report_blocked", {"reason": reason})

    engine._validate(inv, Rt(act), [ex], time.monotonic())  # type: ignore[arg-type]
    assert rounds == [1], "one session, and no second round"
    assert ex.status == "not_run" and ex.failure_kind == "environment"
    assert (ex.executability_reason or "").startswith("Blocked by the environment: tpEndOfISOWeek takes")
    assert (ws / ADAPTER).read_text(encoding="utf-8") == TEMPORAL_ADAPTER, "the original adapter is put back"
    last = next(d for d in reversed(inv.decisions) if d.step == "repair_adapter")
    assert last.decision == "not_run" and any(c.startswith("Blocked: ") for c in last.checks)
    engine._run_health(inv)
    assert inv.run_summary and (inv.run_summary.environment, inv.run_summary.adapter) == (1, 0)
    assert "(1 environment)" in inv.notes[-1]


def test_a_blocked_claim_for_a_failure_the_adapter_can_fix_is_refused(
    ws: Path, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, ex = case(ws, engine, TEMPORAL_ADAPTER)
    (ws / TP).write_text(PLAIN_SOURCE, encoding="utf-8")  # the code under test does not use Temporal at all
    monkeypatch.setattr(engine, "_sweep", threw)
    answers: list[str] = []

    def act(session: D.DesignSession) -> None:
        try:
            session.call("report_blocked", {"reason": "no Temporal here"})
        except ToolError as e:
            answers.append(str(e))

    engine._workshop(inv, Rt(act), ex, ["Temporal is not defined"], time.monotonic())  # type: ignore[arg-type]
    assert answers and answers[0].startswith("Not accepted"), "the adapter named Temporal itself"
    assert ex.status == "designed" and ex.failure_kind is None


def test_a_blocked_claim_when_the_baseline_is_clean_is_refused(
    ws: Path, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, ex = case(ws, engine, HONEST)
    monkeypatch.setattr(engine, "_sweep", clean)
    answers: list[str] = []

    def act(session: D.DesignSession) -> None:
        try:
            session.call("report_blocked", {"reason": "cannot run"})
        except ToolError as e:
            answers.append(str(e))

    engine._workshop(inv, Rt(act), ex, ["x"], time.monotonic())  # type: ignore[arg-type]
    assert answers and "nothing blocking it" in answers[0]


def test_a_missing_global_that_an_installed_package_supplies_is_the_adapters_to_fix() -> None:
    """With temporal-polyfill installed, importing it is a repair, so it is not blocked and not the environment's."""
    with_polyfill = env(polyfills=["temporal-polyfill"])
    assert E.classify(THREW, with_polyfill) == "adapter"
    assert E.explains_by_environment(THREW, with_polyfill, TP_SOURCE) is False
    assert E.classify(THREW, env()) == "environment"
