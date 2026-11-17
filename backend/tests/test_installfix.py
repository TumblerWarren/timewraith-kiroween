"""Self-healing dependency install: log matching, fixed commands, and the pipeline's retry loop."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from timewraith import agents as A
from timewraith import installfix as F
from timewraith import pipeline, sandbox
from timewraith.config import Settings
from timewraith.models import CapabilityReport, CreateInvestigation, Experiment, Investigation, Target
from timewraith.models import TestPlan as Plan
from timewraith.pipeline import Engine, Stop
from timewraith.store import Store

# Trimmed from a real failed `npm ci`: the repository's `prepare` script compiled agent-written files.
PREPARE_FAILED = """npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   required: { node: '>=22' },
npm warn deprecated glob@10.5.0: Old versions of glob are not supported
> lib@5.10.6 prepare
> husky && npm run build
src/__tw__/exp_1.adapter.ts(4,14): error TS7006: Parameter 'ctx' implicitly has an 'any' type.
npm error code 2
npm error command failed
npm error command sh -c husky && npm run build
"""
LOCK_OUT_OF_SYNC = (
    "npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.\n"
    "npm error Missing: left-pad@1.3.0 from lock file\n"
)
PEER_CONFLICT = "npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree\n"
ENGINE_STRICT = "npm error code EBADENGINE\nnpm error engine Unsupported engine\n"


# ---------- matching and commands ----------


def test_failed_install_script_is_matched_before_the_engine_warning() -> None:
    found = F.matches(PREPARE_FAILED)
    assert [a for a, _ in found] == ["ignore_scripts", "newer_node"]
    assert found[0][1] == "npm error command sh -c husky && npm run build"


@pytest.mark.parametrize(
    ("log", "action"),
    [(LOCK_OUT_OF_SYNC, "relaxed_lockfile"), (PEER_CONFLICT, "legacy_peer_deps"), (ENGINE_STRICT, "newer_node")],
)
def test_known_failures_map_to_one_action(log: str, action: str) -> None:
    assert F.matches(log)[0][0] == action


def test_unknown_failure_matches_nothing() -> None:
    assert F.matches("Killed\n") == []


def test_commands_use_only_fixed_flags() -> None:
    base = F.InstallOptions(node="20")
    assert F.command("npm", base) == "npm ci --no-audit --no-fund"
    every = F.InstallOptions(node="22", ignore_scripts=True, legacy_peer_deps=True, relaxed_lockfile=True)
    assert F.command("npm", every) == "npm install --no-audit --no-fund --legacy-peer-deps --ignore-scripts"
    assert F.command("pnpm", base).endswith("pnpm install --frozen-lockfile")
    assert "--no-frozen-lockfile" in F.command("pnpm", every)
    assert "--frozen-lockfile" not in F.command("yarn", every)


def test_actions_apply_once_and_node_stops_at_the_newest() -> None:
    o = F.InstallOptions(node="20")
    steps = []
    while (n := F.apply(o, "newer_node", "npm")) is not None:
        o = n
        steps.append(o.node)
    assert steps == ["22", "24"]
    s = F.apply(o, "ignore_scripts", "npm")
    assert s is not None and F.apply(s, "ignore_scripts", "npm") is None
    assert F.apply(o, "legacy_peer_deps", "yarn") is None
    assert F.applicable(F.InstallOptions(node="24", ignore_scripts=True), "yarn") == ["relaxed_lockfile"]


def test_citation_must_be_in_the_log() -> None:
    assert F.cites(PREPARE_FAILED, "npm error   command sh -c husky && npm run build")
    assert not F.cites(PREPARE_FAILED, "npm error peer dependency conflict")
    assert not F.cites(PREPARE_FAILED, "npm")


def test_excerpt_keeps_error_lines_and_drops_deprecations() -> None:
    text = F.excerpt("\x1b[31m" + PREPARE_FAILED)
    assert "TS7006" in text
    assert "deprecated" not in text
    assert "\x1b" not in text


# ---------- the pipeline's install step ----------


class FakeRuntime:
    name, label = "fake", "Fake runtime"

    def __init__(self, reply: A.InstallFixOut | None) -> None:
        self.reply = reply
        self.calls = 0

    def call(self, agent: str, step: str, prompt: str, schema: type[Any]) -> Any:
        self.calls += 1
        if self.reply is None:
            raise A.AgentUnavailable("no agent")
        return self.reply

    def run_session(self, *args: object) -> str:
        raise A.AgentUnavailable("no sessions")


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def case(engine: Engine) -> Investigation:
    inv = Investigation(
        id="case-install",
        created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
        capabilities=CapabilityReport(package_manager="npm", test_runner="jest", node_version="20"),
        test_plan=Plan(
            experiments=[
                Experiment(
                    id="exp_1",
                    candidate_id="c1",
                    categories=["dst_transition"],
                    executability="ready",
                    status="designed",
                    adapter_path="src/__tw__/exp_1.adapter.ts",
                )
            ]
        ),
    )
    ws = engine._ws(inv)
    (ws / "src" / "__tw__").mkdir(parents=True)
    (ws / "src" / "__tw__" / "exp_1.adapter.ts").write_text("export function run(ctx) {}\n", encoding="utf-8")
    (ws / ".tw").mkdir()
    (ws / ".tw" / "points-exp_1.json").write_text("{}", encoding="utf-8")
    (ws / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
    engine.store.save(inv)
    return inv


def fake_installs(monkeypatch: pytest.MonkeyPatch, results: list[sandbox.Exec], ws: Path) -> list[F.InstallOptions]:
    seen: list[F.InstallOptions] = []

    def fake(s: Settings, w: Path, caps: CapabilityReport, opts: F.InstallOptions | None = None) -> sandbox.Exec:
        assert opts is not None
        # The repository's install scripts must not see TimeWraith's files.
        assert not (ws / "src" / "__tw__").exists() and not (ws / ".tw").exists()
        assert (ws / "src" / "index.ts").exists()
        seen.append(opts)
        return results[len(seen) - 1]

    monkeypatch.setattr(pipeline.sandbox, "install", fake)
    return seen


def test_own_files_are_moved_aside_and_restored(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    ws = engine._ws(inv)
    seen = fake_installs(monkeypatch, [sandbox.Exec(0, "ok")], ws)
    engine._install(inv, FakeRuntime(None), time.monotonic())
    assert len(seen) == 1 and seen[0] == F.InstallOptions(node="20")
    assert (ws / "src" / "__tw__" / "exp_1.adapter.ts").exists()
    assert (ws / ".tw" / "points-exp_1.json").exists()
    assert not (ws.parent / "tw-aside").exists()


def test_known_failure_is_healed_by_code(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    rt = FakeRuntime(None)
    seen = fake_installs(monkeypatch, [sandbox.Exec(1, PREPARE_FAILED), sandbox.Exec(0, "ok")], engine._ws(inv))
    engine._install(inv, rt, time.monotonic())
    assert seen[1].ignore_scripts and seen[1].node == "20"
    assert rt.calls == 0, "a known failure needs no agent"
    assert any("install scripts skipped" in n for n in inv.notes)


def test_newer_node_is_kept_for_later_runs(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    fake_installs(monkeypatch, [sandbox.Exec(1, ENGINE_STRICT), sandbox.Exec(0, "ok")], engine._ws(inv))
    engine._install(inv, FakeRuntime(None), time.monotonic())
    assert inv.capabilities is not None and inv.capabilities.node_version == "22"


def test_unknown_failure_asks_pumpkin_mechanic(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    log = "gyp ERR! build error\ngyp ERR! stack Error: not found: make\n"
    reply = A.InstallFixOut(action="ignore_scripts", log_line="gyp ERR! build error", reason="A native build failed")
    rt = FakeRuntime(reply)
    seen = fake_installs(monkeypatch, [sandbox.Exec(1, log), sandbox.Exec(0, "ok")], engine._ws(inv))
    engine._install(inv, rt, time.monotonic())
    assert rt.calls == 1 and seen[1].ignore_scripts
    rec = inv.decisions[-1]
    assert rec.step == "install_repair" and rec.decision == "accepted"


@pytest.mark.parametrize(
    ("reply", "rule"),
    [
        (A.InstallFixOut(action="ignore_scripts", log_line="npm error invented line", reason="x"), "cited line"),
        (A.InstallFixOut(action="give_up", log_line="gyp ERR! build error", reason="out of memory"), "no listed"),
    ],
)
def test_bad_or_no_agent_pick_stops_with_the_log(
    engine: Engine, monkeypatch: pytest.MonkeyPatch, reply: A.InstallFixOut, rule: str
) -> None:
    inv = case(engine)
    ws = engine._ws(inv)
    seen = fake_installs(monkeypatch, [sandbox.Exec(1, "gyp ERR! build error\n")], ws)
    with pytest.raises(Stop) as e:
        engine._install(inv, FakeRuntime(reply), time.monotonic())
    assert e.value.code == "install_failed" and "gyp ERR! build error" in str(e.value)
    assert len(seen) == 1
    assert rule in inv.decisions[-1].rule
    assert (ws / "src" / "__tw__" / "exp_1.adapter.ts").exists(), "own files come back after a failed install"


def test_retries_are_capped_and_listed(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    failures = [sandbox.Exec(1, ENGINE_STRICT)] * 4
    seen = fake_installs(monkeypatch, failures, engine._ws(inv))
    with pytest.raises(Stop) as e:
        engine._install(inv, FakeRuntime(None), time.monotonic())
    assert [o.node for o in seen] == ["20", "22", "24"]
    assert "Node 22" in str(e.value) and "Node 24" in str(e.value)


def test_timeout_is_not_retried(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    seen = fake_installs(monkeypatch, [sandbox.Exec(124, PREPARE_FAILED, timed_out=True)], engine._ws(inv))
    with pytest.raises(Stop) as e:
        engine._install(inv, FakeRuntime(None), time.monotonic())
    assert len(seen) == 1 and "timed out" in str(e.value)
