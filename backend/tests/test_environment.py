"""The test environment is checked once per case: one canary, one shared fix, honest causes, and no wasted retries."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import pytest

from timewraith import agents as A
from timewraith import environment as E
from timewraith import sweep as S
from timewraith.config import Settings
from timewraith.models import (
    CapabilityReport,
    CreateInvestigation,
    EnvironmentCheck,
    Experiment,
    InvariantUse,
    Investigation,
    Target,
    TestPlan,
)
from timewraith.pipeline import Engine
from timewraith.store import Store

# ---------- the helpers that read no agent ----------


@pytest.mark.parametrize(
    "text, kind",
    [
        ("No output: the runner did not collect or could not load the harness; No test files found", "environment"),
        ("EROFS: read-only file system, open '/work/node_modules/.vite-temp/x.mjs'", "environment"),
        ("Cannot find package 'vitest' imported from /work/.tw/runner.mjs", "environment"),
        ("UTC 2027-01-15: run() threw: Temporal is not defined", "adapter"),
        ("America/New_York: invalid calendar_cases at an ordinary instant", "adapter"),
        ("The request was throttled by the service (request_id: a6c)", "throttled"),
        ("rate limit exceeded", "throttled"),
    ],
)
def test_a_failure_is_classified_by_what_it_says(text: str, kind: str) -> None:
    assert E.classify(text) == kind


def test_the_canary_reports_the_node_version_and_what_it_lacks() -> None:
    row = {"t": 1, "r0": {"instant": 1, "value": json.dumps({"node": "v22.1.0", "missing": ["Temporal"]})}}
    assert E.facts_from({"UTC": [row]}) == ("v22.1.0", ["Temporal"])
    assert E.facts_from({"UTC": [{"t": 1, "r0": {"error": "x"}}]}) == (None, [])
    assert E.facts_from({}) == (None, [])


def env_with(missing: list[str], polyfills: list[str]) -> EnvironmentCheck:
    return EnvironmentCheck(status="ok", node="v22.1.0", missing_globals=missing, polyfills=polyfills)


def test_an_adapter_that_uses_a_missing_global_is_told_before_it_runs() -> None:
    code = (
        "const m = require('../index');\nfunction run(ctx) { return { value: Temporal.Now.instant().toString() }; }\n"
    )
    hints = E.hints_for(code, env_with(["Temporal"], ["temporal-polyfill"]))
    assert len(hints) == 1 and "import { Temporal } from 'temporal-polyfill'" in hints[0]
    bare = E.hints_for(code, env_with(["Temporal"], []))
    assert "no package that supplies it is installed" in bare[0]


@pytest.mark.parametrize(
    "code",
    [
        "import { Temporal } from 'temporal-polyfill';\nfunction run() { return Temporal.Now.instant(); }",
        "const Temporal = require('temporal-polyfill').Temporal;\nfunction run() { return Temporal.Now.instant(); }",
        "function run() { return typeof Temporal === 'undefined' ? 0 : Temporal.Now.instant(); }",
        "// Temporal is not used here\nfunction run() { return 1; }",
        "function run() { return 'Temporal' + 1; }",
        "function run() { return obj.Temporal; }",
    ],
)
def test_no_hint_when_the_adapter_provides_guards_or_does_not_use_the_global(code: str) -> None:
    assert E.hints_for(code, env_with(["Temporal"], ["temporal-polyfill"])) == []


def test_nothing_is_guessed_about_a_runtime_that_was_not_looked_at() -> None:
    assert E.hints_for("Temporal.Now", None) == []
    assert E.hints_for("Temporal.Now", EnvironmentCheck(status="failed", missing_globals=["Temporal"])) == []
    assert E.hints_for("Temporal.Now", env_with([], [])) == []


def test_the_default_profile_collects_generated_tests_and_looks_like_an_agent_config(tmp_path: Path) -> None:
    rel = E.write_default_profile(tmp_path)
    assert re.fullmatch(r"\.tw/runner-[a-f0-9]{32}\.mjs", rel), "the repair tools reuse configs with this name"
    text = (tmp_path / rel).read_text(encoding="utf-8")
    assert "**/__tw__/*.tw.test." in text and 'pool: "forks"' in text and "node_modules" in text


def test_installed_polyfills_are_found_on_disk(tmp_path: Path) -> None:
    (tmp_path / "node_modules/temporal-polyfill").mkdir(parents=True)
    (tmp_path / "node_modules/temporal-polyfill/package.json").write_text("{}", encoding="utf-8")
    (tmp_path / "node_modules/@js-temporal/polyfill").mkdir(parents=True)
    assert E.installed_polyfills(tmp_path) == ["temporal-polyfill"], "a folder without package.json is not installed"


# ---------- the environment step ----------


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub", throttle_waits_s=(1, 2))
    s.check_paths()
    return Engine(s, Store(s.db_path))


def experiment(i: int) -> Experiment:
    return Experiment(
        id=f"exp_{i}", candidate_id="cand_1", categories=["midnight_rollover"], executability="ready",
        status="designed", fields=["date"], invariants=[InvariantUse(id="well_formed", reason="r")],
        adapter_path=f"pkgs/core/src/add{i}/__tw__/exp_{i}.adapter.ts",
        harness_path=f"pkgs/core/src/add{i}/__tw__/index.exp_{i}.tw.test.ts",
        adapter_code="function run() { return { date: '2026-01-01' }; }",
    )  # fmt: skip


def case(runner: str = "vitest", count: int = 3) -> tuple[Investigation, list[Experiment]]:
    inv = Investigation(
        id="case-e",
        created_at="2026-11-19T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
    )
    inv.capabilities = CapabilityReport(test_runner=runner, package_manager="pnpm")  # type: ignore[arg-type]
    exps = [experiment(i) for i in range(count)]
    inv.test_plan = TestPlan(experiments=exps)
    return inv, exps


CANARY_OK = {"UTC": [{"t": 1, "r0": {"instant": 1, "value": json.dumps({"node": "v22.1.0", "missing": ["Temporal"]})}}]}


class Canary:
    """A pretend runner: collects the canary only when its conditions are met."""

    def __init__(self, engine: Engine, ws: Path, *, works_when: Any) -> None:
        self.ws, self.works_when, self.calls = ws, works_when, []
        engine._ws = lambda inv: ws  # type: ignore[method-assign]
        engine._sweep = self.sweep  # type: ignore[method-assign]

    def sweep(self, inv: Investigation, exps: list[Experiment], zones: list[str], set_name: str = "points") -> Any:
        ex = exps[0]
        self.calls.append(ex.runner_config)
        assert (self.ws / (ex.harness_path or "")).is_file(), "the canary harness exists while it is checked"
        if self.works_when(ex):
            return {ex.id: (CANARY_OK, [])}
        return {ex.id: ({}, ["UTC: no harness output. RUN v5 No test files found include: **/test.ts"])}


class Rt:
    name, label, supports_sessions = "fake", "Fake", True

    def call(self, *a: object) -> Any:
        raise AssertionError("not used")


def test_a_repository_that_collects_generated_tests_needs_no_profile(engine: Engine, tmp_path: Path) -> None:
    inv, exps = case()
    pretend = Canary(engine, tmp_path, works_when=lambda ex: True)
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is True  # type: ignore[arg-type]
    assert inv.environment and inv.environment.status == "ok" and inv.environment.how == "the repository's own setup"
    assert inv.environment.node == "v22.1.0" and inv.environment.missing_globals == ["Temporal"]
    assert all(e.runner_config is None for e in exps) and pretend.calls == [None]
    assert not list(tmp_path.rglob("exp_tw_canary*")), "the canary leaves no files in the checkout"


def test_a_repository_whose_config_skips_generated_tests_gets_one_shared_profile(
    engine: Engine, tmp_path: Path
) -> None:
    """date-fns: its vitest include is **/test.ts. One profile is written once and every experiment uses it."""
    inv, exps = case()
    pretend = Canary(engine, tmp_path, works_when=lambda ex: bool(ex.runner_config))
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is True  # type: ignore[arg-type]
    env = inv.environment
    assert env and env.how == "the default runner profile" and env.runner_config
    assert {e.runner_config for e in exps} == {env.runner_config}, "one profile, shared by every experiment"
    assert (tmp_path / env.runner_config).is_file() and pretend.calls == [None, env.runner_config]


def test_an_experiment_keeps_a_config_its_own_repair_chose(engine: Engine, tmp_path: Path) -> None:
    inv, exps = case()
    exps[1].runner_config = ".tw/runner-" + "a" * 32 + ".mjs"
    Canary(engine, tmp_path, works_when=lambda ex: bool(ex.runner_config))
    engine._environment(inv, Rt(), exps, time.monotonic())  # type: ignore[arg-type]
    assert exps[1].runner_config == ".tw/runner-" + "a" * 32 + ".mjs" and exps[0].runner_config != exps[1].runner_config


def test_when_the_default_profile_fails_an_agent_fixes_the_runner_once_for_everyone(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, exps = case()
    fixed: list[bool] = []
    Canary(engine, tmp_path, works_when=lambda ex: bool(fixed))
    seen: list[list[str]] = []

    def workshop(inv: Investigation, rt: object, ex: Experiment, problems: list[str], t0: float) -> bool:
        seen.append(problems)
        assert ex.id == E.CANARY_ID
        fixed.append(True)
        return True

    monkeypatch.setattr(engine, "_workshop", workshop)
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is True  # type: ignore[arg-type]
    assert inv.environment and inv.environment.how == "an agent repair (round 1)"
    assert "environment canary" in seen[0][0] and "No test files found" in seen[0][1], "the agent is told the failure"


def test_an_environment_that_cannot_run_a_test_ends_the_case_early_with_the_reason(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, exps = case()
    Canary(engine, tmp_path, works_when=lambda ex: False)
    rounds: list[int] = []
    monkeypatch.setattr(engine, "_workshop", lambda *a: rounds.append(1) or False)
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is False  # type: ignore[arg-type]
    assert len(rounds) == engine.s.environment_repair_rounds, "bounded repair rounds, then it stops"
    assert (
        inv.environment
        and inv.environment.status == "failed"
        and "No test files found" in (inv.environment.reason or "")
    )
    assert inv.status == "inconclusive"
    assert all(e.status == "not_run" and e.failure_kind == "environment" for e in exps)
    assert inv.decisions[-1].step == "environment_check" and inv.decisions[-1].decision == "rejected"
    assert not list(tmp_path.rglob("exp_tw_canary*"))
    engine._run_health(inv)
    assert inv.notes[-1].startswith("Attention: No generated test could run in this repository")
    assert inv.run_summary and inv.run_summary.environment == 3 and inv.run_summary.environment_check == "failed"


def test_jest_and_python_cases_are_not_checked_this_way(engine: Engine, tmp_path: Path) -> None:
    inv, exps = case(runner="pytest")
    Canary(engine, tmp_path, works_when=lambda ex: False)
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is True  # type: ignore[arg-type]
    assert inv.environment and inv.environment.status == "skipped"


# ---------- experiments that fail afterwards ----------


def broken_outputs(text: str) -> Any:
    return lambda inv, exps, zones, set_name="points": {e.id: ({}, [text]) for e in exps}


def test_an_adapter_is_given_what_the_environment_lacks_when_it_is_repaired(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, [ex, *_] = case(count=1)
    inv.environment = env_with(["Temporal"], ["temporal-polyfill"])
    ex.adapter_code = "function run() { return { date: Temporal.Now.plainDateISO().toString() }; }"
    threw = {"UTC": [{"t": 1, "r0": {"error": "Temporal is not defined"}}]}  # the adapter ran, and threw
    monkeypatch.setattr(engine, "_sweep", lambda inv, exps, zones, set_name="points": {e.id: (threw, []) for e in exps})
    seen: list[list[str]] = []
    monkeypatch.setattr(engine, "_workshop", lambda inv, rt, e, problems, t0: seen.append(problems))
    engine._validate(inv, Rt(), [ex], time.monotonic())  # type: ignore[arg-type]
    assert seen and "import { Temporal } from 'temporal-polyfill'" in seen[0][0], "the first thing the agent reads"
    assert ex.status == "adapter_invalid" and ex.failure_kind == "adapter"


def test_a_failure_that_is_about_the_place_is_recorded_as_such(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv, [ex, *_] = case(count=1)
    monkeypatch.setattr(engine, "_sweep", broken_outputs("UTC: no harness output. No test files found"))
    monkeypatch.setattr(engine, "_workshop", lambda *a: False)
    engine._validate(inv, Rt(), [ex], time.monotonic())  # type: ignore[arg-type]
    assert ex.status == "adapter_invalid" and ex.failure_kind == "environment"


# ---------- a throttled agent waits, it does not fail ----------


class Throttled:
    """The agent service refuses `times` requests, then answers."""

    name, label, supports_sessions = "fake", "Fake", False

    def __init__(self, times: int, message: str = "The request was throttled by the service") -> None:
        self.left, self.message, self.asked = times, message, 0

    def call(self, agent: str, step: str, prompt: str, schema: type[Any]) -> str:
        self.asked += 1
        if self.left > 0:
            self.left -= 1
            raise A.AgentUnavailable(f"{agent} could not run: {self.message}")
        return "answer"


def test_a_throttled_request_waits_and_is_asked_again(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    waits: list[int] = []
    monkeypatch.setattr(engine, "_wait", lambda inv, seconds, what: waits.append(seconds))
    inv, _ = case()
    rt = Throttled(2)
    assert engine._agent(inv, rt, "bat-scout", "review_candidates", "p", str) == "answer"  # type: ignore[arg-type]
    assert waits == [1, 2] and rt.asked == 3
    assert inv.budget.agent_calls == 1, "a throttled retry is not a new agent call"


def test_a_throttle_that_lasts_gives_up_with_the_agents_own_error(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(engine, "_wait", lambda *a: None)
    inv, _ = case()
    with pytest.raises(A.AgentUnavailable, match="throttled"):
        engine._agent(inv, Throttled(99), "bat-scout", "review_candidates", "p", str)  # type: ignore[arg-type]


def test_an_error_that_is_not_a_throttle_is_not_waited_for(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    waits: list[int] = []
    monkeypatch.setattr(engine, "_wait", lambda inv, seconds, what: waits.append(seconds))
    inv, _ = case()
    with pytest.raises(A.AgentUnavailable):
        engine._agent(inv, Throttled(1, "the session was closed"), "bat-scout", "x", "p", str)  # type: ignore[arg-type]
    assert waits == []


def test_the_wait_can_be_cancelled(engine: Engine) -> None:
    inv, _ = case()
    engine._cancel.add(inv.id)
    started = time.monotonic()
    with pytest.raises(Exception, match="Cancelled"):
        engine._wait(inv, 30, "the repair")
    assert time.monotonic() - started < 2


# ---------- the summary of a run ----------


def test_the_run_summary_counts_by_cause_and_the_note_says_which(engine: Engine) -> None:
    inv, exps = case(count=6)
    exps[0].status = exps[1].status = "swept"
    exps[2].status, exps[2].failure_kind = "adapter_invalid", "adapter"
    exps[3].status, exps[3].failure_kind = "adapter_invalid", "throttled"
    exps[4].status, exps[4].failure_kind = "adapter_invalid", "throttled"
    exps[5].status = "adapter_invalid"  # no kind recorded: counted as the experiment's own
    engine._run_health(inv)
    s = inv.run_summary
    assert s and (s.experiments, s.ran, s.adapter, s.environment, s.throttled) == (6, 2, 2, 0, 2)
    assert "4 of 6 experiments could not run (2 adapter, 2 throttled)" in inv.notes[-1]


def test_summaries_are_listed_across_runs() -> None:
    from fastapi.testclient import TestClient

    from timewraith import api

    response = TestClient(api.app).get("/api/v1/run-summaries")
    assert response.status_code == 200 and isinstance(response.json(), list)
    assert S.BASELINE_ZONES, "the fixture module imports cleanly"


def test_removing_the_canary_leaves_nothing_of_it_behind(tmp_path: Path) -> None:
    canary = E.canary_experiment("c", "pkgs/a/__tw__", ".ts")
    E.write_canary(tmp_path, canary, "// harness", {"UTC": [1]})
    (tmp_path / ".tw/out").mkdir()
    (tmp_path / f".tw/out/{E.CANARY_ID}__UTC.json").write_text("[]", encoding="utf-8")
    assert len([p for p in tmp_path.rglob("*") if p.is_file()]) == 5
    E.remove_canary(tmp_path, canary)
    assert [p for p in tmp_path.rglob("*") if p.is_file()] == []


# ---------- supplying Temporal from a polyfill installed outside the repository ----------


def test_the_preload_makes_the_polyfill_the_global_without_replacing_a_real_one() -> None:
    code = E.preload_source("temporal-polyfill")
    assert 'from "temporal-polyfill"' in code
    assert "typeof globalThis.Temporal === 'undefined'" in code, "a runtime's own Temporal is never replaced"
    assert "toTemporalInstant" in code and "typeof Date.prototype.toTemporalInstant !== 'function'" in code


def test_the_preload_lives_next_to_the_polyfill_and_not_in_the_repository(tmp_path: Path) -> None:
    rel = E.write_preload(tmp_path, "temporal-polyfill")
    assert rel == ".tw/deps/temporal-global.mjs" and (tmp_path / rel).is_file()
    assert [p.relative_to(tmp_path).parts[0] for p in tmp_path.rglob("*") if p.is_file()] == [".tw"]


def test_the_installed_version_is_read_from_the_package_itself(tmp_path: Path) -> None:
    assert E.installed_version(tmp_path, "temporal-polyfill") is None
    pkg = tmp_path / ".tw/deps/node_modules/temporal-polyfill"
    pkg.mkdir(parents=True)
    (pkg / "package.json").write_text('{"name": "temporal-polyfill", "version": "0.3.0"}', encoding="utf-8")
    assert E.installed_version(tmp_path, "temporal-polyfill") == "0.3.0"
    (pkg / "package.json").write_text("not json", encoding="utf-8")
    assert E.installed_version(tmp_path, "temporal-polyfill") is None


@pytest.mark.parametrize(
    "spec, name",
    [("temporal-polyfill", "temporal-polyfill"), ("temporal-polyfill@0.3.0", "temporal-polyfill"),
     ("@js-temporal/polyfill", "@js-temporal/polyfill"), ("@js-temporal/polyfill@0.5.1", "@js-temporal/polyfill")],
)  # fmt: skip
def test_a_package_spec_names_its_package(spec: str, name: str) -> None:
    assert E.package_name(spec) == name


def test_the_polyfill_is_only_worth_supplying_when_the_code_under_test_uses_the_global(tmp_path: Path) -> None:
    (tmp_path / "a").mkdir()
    (tmp_path / "a/uses.ts").write_text("export const f = (d: Temporal.ZonedDateTime) => d;\n", encoding="utf-8")
    (tmp_path / "a/plain.ts").write_text("export const f = (d: Date) => d;\n", encoding="utf-8")
    assert E.uses_global(tmp_path, ["a/plain.ts", "a/uses.ts"]) is True
    assert E.uses_global(tmp_path, ["a/plain.ts"]) is False
    assert E.uses_global(tmp_path, ["a/missing.ts"]) is False


def test_the_agent_is_told_the_global_is_a_polyfill_and_needs_no_import() -> None:
    supplied = EnvironmentCheck(
        status="ok", node="v22.1.0", missing_globals=[], provided=["Temporal from temporal-polyfill 0.3.0"]
    )
    text = E.facts_text(supplied)
    assert "Temporal from temporal-polyfill 0.3.0" in text and "polyfill, not the runtime's own" in text
    assert "needs no import" in text and "No probed global is missing" in text
    assert "No installed package supplies them" not in text


def test_with_the_global_supplied_an_adapter_using_it_is_not_flagged_or_blamed_on_the_environment() -> None:
    supplied = EnvironmentCheck(
        status="ok", node="v22", missing_globals=[], provided=["Temporal from temporal-polyfill 0.3.0"]
    )
    assert E.hints_for("function run() { return Temporal.Now.instant(); }", supplied) == []
    assert E.classify("run() threw: Temporal is not defined", supplied) == "adapter"


# ---------- the containers carry it ----------


def captured(monkeypatch: pytest.MonkeyPatch) -> list[list[str]]:
    from timewraith import sandbox

    seen: list[list[str]] = []

    def fake(args: list[str], **kw: object) -> Any:
        seen.append(args)
        return type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(sandbox.subprocess, "run", fake)
    return seen


def test_every_node_container_of_a_case_with_the_polyfill_preloads_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from timewraith import sandbox

    seen = captured(monkeypatch)
    s = Settings(data_dir=tmp_path / "data")
    s.check_paths()
    ws = tmp_path / "ws"
    ws.mkdir()
    sandbox.run(s, ws, "22", "true", network=False, timeout=5)
    assert not any(a.startswith("NODE_OPTIONS") for a in seen[-1]), "nothing is preloaded before it exists"
    E.write_preload(ws, "temporal-polyfill")
    sandbox.run(s, ws, "22", "true", network=False, timeout=5)
    assert "NODE_OPTIONS=--import=/work/.tw/deps/temporal-global.mjs" in seen[-1]
    sandbox.run(s, ws, "22", "true", network=False, timeout=5, python_worker=True)
    assert not any(a.startswith("NODE_OPTIONS") for a in seen[-1]), "Python workers are left alone"


def test_while_the_repository_installs_and_tw_is_moved_aside_nothing_is_preloaded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A preload that points at a missing file would stop Node from starting at all."""
    from timewraith import sandbox

    seen = captured(monkeypatch)
    s = Settings(data_dir=tmp_path / "data")
    s.check_paths()
    ws = tmp_path / "ws"
    E.write_preload(ws, "temporal-polyfill")
    (ws / ".tw").rename(tmp_path / "aside")  # what _aside does for the install
    sandbox.run(s, ws, "22", "pnpm install", network=True, timeout=5)
    assert not any(a.startswith("NODE_OPTIONS") for a in seen[-1])


def test_the_polyfill_is_installed_in_its_own_folder_with_no_scripts_and_no_lockfile(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from timewraith import sandbox

    seen = captured(monkeypatch)
    s = Settings(data_dir=tmp_path / "data")
    s.check_paths()
    sandbox.install_polyfill(s, tmp_path, "22", "temporal-polyfill@0.3.0")
    script = seen[-1][-1]
    assert "--prefix /work/.tw/deps" in script and "--ignore-scripts" in script and "--no-package-lock" in script
    assert "temporal-polyfill@0.3.0" in script and "bridge" in seen[-1], "the install has network, the tests do not"
    sandbox.install_polyfill(s, tmp_path, "22", "x; rm -rf /")
    assert "'x; rm -rf /'" in seen[-1][-1], "the package name is quoted"


# ---------- the environment step supplies it ----------


class Polyfill:
    """Pretends to install the polyfill and to run the canary with and without it."""

    def __init__(
        self,
        engine: Engine,
        monkeypatch: pytest.MonkeyPatch,
        ws: Path,
        *,
        install_ok: bool = True,
        works: bool = True,
        missing: bool = True,
    ) -> None:
        from timewraith import sandbox

        self.ws, self.works, self.missing, self.installs = ws, works, missing, []
        engine._ws = lambda inv: ws  # type: ignore[method-assign]
        engine._sweep = self.sweep  # type: ignore[method-assign]
        self.install_ok = install_ok
        monkeypatch.setattr(sandbox, "install_polyfill", self.install)

    def install(self, s: Settings, ws: Path, node: str, package: str) -> Any:
        from timewraith import sandbox

        self.installs.append(package)
        if self.install_ok:
            pkg = ws / ".tw/deps/node_modules" / E.package_name(package)
            pkg.mkdir(parents=True, exist_ok=True)
            (pkg / "package.json").write_text('{"version": "0.3.0"}', encoding="utf-8")
        return sandbox.Exec(0 if self.install_ok else 1, "" if self.install_ok else "E404 not found")

    def sweep(self, inv: Investigation, exps: list[Experiment], zones: list[str], set_name: str = "points") -> Any:
        have = (self.ws / ".tw/deps/temporal-global.mjs").is_file()
        if have and not self.works:
            return {exps[0].id: ({}, ["UTC: the polyfill threw while loading"])}
        gone = [] if have else (["Temporal"] if self.missing else [])
        value = json.dumps({"node": "v22.1.0", "missing": gone})
        return {exps[0].id: ({"UTC": [{"t": 1, "r0": {"instant": 1, "value": value}}]}, [])}


def temporal_case(tmp_path: Path, uses: bool = True) -> tuple[Investigation, list[Experiment]]:
    from timewraith.models import Candidate, CodeUnit, FeatureMap

    inv, exps = case()
    ws = tmp_path
    (ws / "src").mkdir(exist_ok=True)
    (ws / "src/tp.ts").write_text(
        "export const f = (d: Temporal.ZonedDateTime) => d;\n" if uses else "export const f = 1;\n", encoding="utf-8"
    )
    inv.feature_map = FeatureMap(
        candidates=[
            Candidate(
                id="cand_1", title="t",
                unit=CodeUnit(path="src/tp.ts", name="f", start_line=1, end_line=1, exported=True),
                      signal_ids=[], bug_categories=["midnight_rollover"], score=1, score_parts={})
        ]
    )  # fmt: skip
    return inv, exps


def test_temporal_is_supplied_when_the_code_uses_it_and_node_lacks_it(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, exps = temporal_case(tmp_path)
    fake = Polyfill(engine, monkeypatch, tmp_path)
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is True  # type: ignore[arg-type]
    env = inv.environment
    assert env and env.status == "ok" and env.missing_globals == []
    assert env.provided == ["Temporal from temporal-polyfill 0.3.0"] and fake.installs == ["temporal-polyfill"]
    assert (tmp_path / ".tw/deps/temporal-global.mjs").is_file(), "it stays for the experiments' test runs"
    assert inv.notes[-1].startswith("Environment: ") and "temporal-polyfill 0.3.0" in inv.notes[-1]
    assert "depend on it" in inv.notes[-1], "the case says Temporal here is a polyfill"
    assert not [p for p in tmp_path.rglob("exp_tw_canary*")]


def test_nothing_is_installed_when_the_code_does_not_use_temporal(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, exps = temporal_case(tmp_path, uses=False)
    fake = Polyfill(engine, monkeypatch, tmp_path)
    engine._environment(inv, Rt(), exps, time.monotonic())  # type: ignore[arg-type]
    assert fake.installs == [] and inv.environment and inv.environment.provided == []
    assert not (tmp_path / ".tw/deps").exists()


def test_nothing_is_installed_when_node_already_has_it(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, exps = temporal_case(tmp_path)
    fake = Polyfill(engine, monkeypatch, tmp_path, missing=False)
    engine._environment(inv, Rt(), exps, time.monotonic())  # type: ignore[arg-type]
    assert fake.installs == [] and inv.environment and inv.environment.provided == []


def test_a_failed_install_leaves_the_case_working_and_says_why(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, exps = temporal_case(tmp_path)
    Polyfill(engine, monkeypatch, tmp_path, install_ok=False)
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is True  # type: ignore[arg-type]
    env = inv.environment
    assert env and env.status == "ok" and env.missing_globals == ["Temporal"] and env.provided == []
    assert any("Could not install temporal-polyfill" in a and "E404" in a for a in env.attempts)
    assert not (tmp_path / ".tw/deps/temporal-global.mjs").exists()


def test_a_polyfill_that_breaks_the_tests_is_taken_out_again(
    engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, exps = temporal_case(tmp_path)
    Polyfill(engine, monkeypatch, tmp_path, works=False)
    assert engine._environment(inv, Rt(), exps, time.monotonic()) is True  # type: ignore[arg-type]
    env = inv.environment
    assert env and env.status == "ok" and env.provided == [] and env.missing_globals == ["Temporal"]
    assert not (tmp_path / ".tw/deps/temporal-global.mjs").exists(), "the preload is removed, so nothing else breaks"
    assert any("did not become available" in a or "threw while loading" in a for a in env.attempts)
