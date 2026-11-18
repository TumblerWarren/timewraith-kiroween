"""The install mechanic's tool session: what the agent may do, what code checks, and how the pipeline uses it."""

from __future__ import annotations

import contextlib
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from test_installfix import case, fake_installs
from timewraith import agents as A
from timewraith import installfix as F
from timewraith import installsession as IS
from timewraith import pipeline, sandbox
from timewraith.config import Settings
from timewraith.fixsession import ToolError
from timewraith.pipeline import Engine, Stop
from timewraith.store import Store

UNKNOWN = "Internal Error: something no list knows\n"


def test_corepack_directory_is_made_before_the_package_manager_is_enabled() -> None:
    for pm in ("yarn", "pnpm"):
        assert F.command(pm, F.InstallOptions(node="22")).startswith("mkdir -p /tmp/bin && corepack enable")


def make(tmp_path: Path, ok: list[bool] | None = None, **over: Any) -> tuple[IS.InstallSession, list[tuple[str, str]]]:
    ran: list[tuple[str, str]] = []
    answers = list(ok if ok is not None else [True])

    def run(node: str, command: str, timeout: int) -> IS.CommandResult:
        ran.append((node, command))
        return IS.CommandResult(0, "x" * 9000 + "END")

    def check(node: str) -> tuple[bool, str]:
        good = answers.pop(0) if len(answers) > 1 else answers[0]
        return good, f"jest 29 starts on Node {node}" if good else "the test runner `jest` is not installed"

    kw: dict[str, Any] = dict(
        ws=tmp_path, tracked=frozenset(), extra_readable=frozenset(), node="20", on_event=lambda *_: None,
        deadline=time.monotonic() + 600, max_calls=400, max_commands=300, command_timeout_s=60, run=run, check=check,
    )  # fmt: skip
    kw.update(over)
    return IS.open_session(**kw), ran


def test_a_command_runs_on_the_chosen_node_and_shows_only_the_end_of_the_output(tmp_path: Path) -> None:
    s, ran = make(tmp_path)
    s.call("use_node", {"version": "24"})
    out = s.call("run_command", {"command": "yarn --version"})
    assert ran == [("24", "yarn --version")] and out.startswith("exit code 0 (command 1, Node 24)")
    assert out.endswith("END") and len(out) < 6200


@pytest.mark.parametrize("version", ["14", "16", "18", "20", "22.11", "24", "20.19.1"])
def test_any_node_version_with_an_image_may_be_chosen(tmp_path: Path, version: str) -> None:
    s, _ = make(tmp_path)
    assert version in s.call("use_node", {"version": version})


@pytest.mark.parametrize("version", ["latest", "../x", "", "20; rm -rf /", "v22"])
def test_a_node_version_must_look_like_a_version_so_it_cannot_alter_the_image_name(
    tmp_path: Path, version: str
) -> None:
    s, _ = make(tmp_path)
    with pytest.raises(ToolError):
        s.call("use_node", {"version": version})


@pytest.mark.parametrize(
    ("tool", "args"),
    [("run_command", {"command": ""}), ("run_command", {"command": "x" * 20_001}), ("submit_install", {"summary": " "}),
     ("rm_rf", {})],
)  # fmt: skip
def test_malformed_calls_are_refused_with_a_reason(tmp_path: Path, tool: str, args: dict[str, Any]) -> None:
    s, ran = make(tmp_path)
    with pytest.raises(ToolError):
        s.call(tool, args)
    assert ran == []


def test_a_long_or_chained_command_is_not_restricted(tmp_path: Path) -> None:
    s, ran = make(tmp_path)
    command = "set -e; " + " && ".join(f"echo step{i}" for i in range(300))
    s.call("run_command", {"command": command})
    assert ran[0][1] == command


def test_a_failed_check_is_not_final_while_there_is_budget_left(tmp_path: Path) -> None:
    s, _ = make(tmp_path, ok=[False])
    for _ in range(20):
        with pytest.raises(ToolError, match="Not accepted"):
            s.call("submit_install", {"summary": "tried"})
    assert s.submitted is None


def test_when_the_budget_is_used_up_a_failed_submission_is_recorded_as_failed(tmp_path: Path) -> None:
    s, _ = make(tmp_path, ok=[False], max_calls=2)
    s.call("check_install", {})
    s.call("check_install", {})
    with pytest.raises(ToolError, match="budget"):
        s.call("run_command", {"command": "a"})
    assert "still fails" in s.call("submit_install", {"summary": "tried"})
    assert s.submitted is not None and s.submitted[1] is False
    with pytest.raises(ToolError, match="Already submitted"):
        s.call("check_install", {})


def test_the_time_limit_ends_the_session_the_same_way(tmp_path: Path) -> None:
    s, ran = make(tmp_path, ok=[False], deadline=time.monotonic() - 1)
    with pytest.raises(ToolError, match="budget"):
        s.call("run_command", {"command": "a"})
    s.call("submit_install", {"summary": "ran out of time"})
    assert ran == [] and s.submitted is not None


def test_a_successful_check_is_accepted_at_once(tmp_path: Path) -> None:
    s, _ = make(tmp_path, ok=[False, True])
    assert s.call("check_install", {}).startswith("NOT READY")
    s.call("submit_install", {"summary": "Node 22 and yarn 1.22"})
    assert s.submitted == ("Node 22 and yarn 1.22", True, "jest 29 starts on Node 20")


# ---------- through the pipeline ----------


class Scripted:
    """A runtime whose install sessions are fixed lists of tool calls, one script per round."""

    name, label = "scripted", "Scripted runtime"

    def __init__(self, *scripts: Callable[[IS.InstallSession], None]) -> None:
        self.scripts = list(scripts)
        self.sessions = 0
        self.prompts: list[str] = []

    def call(self, agent: str, step: str, prompt: str, schema: type[Any]) -> Any:
        raise A.AgentUnavailable("no single-reply agent")

    def run_session(self, agent: str, step: str, prompt: str, session: Any, timeout_s: int) -> str:
        assert agent == "install-mechanic" and "install.log" in prompt
        self.prompts.append(prompt)
        self.sessions += 1
        if not self.scripts:
            raise A.AgentUnavailable("no sessions")
        self.scripts.pop(0)(session)
        return ""


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def fake_runs(monkeypatch: pytest.MonkeyPatch, checks: list[bool] | None = None) -> list[tuple[str, bool]]:
    """Every sandbox command succeeds; the offline start check answers from `checks` (the last answer repeats)."""
    seen: list[tuple[str, bool]] = []
    answers = list(checks if checks is not None else [True])

    def fake(s: Settings, ws: Path, node: str, script: str, **kw: Any) -> sandbox.Exec:
        seen.append((script, kw["network"]))
        if kw["network"]:
            return sandbox.Exec(0, "added 120 packages")
        good = answers.pop(0) if len(answers) > 1 else answers[0]
        return sandbox.Exec(0, "29.7.0") if good else sandbox.Exec(1, "sh: jest: not found")

    monkeypatch.setattr(pipeline.sandbox, "run", fake)
    return seen


def fix_with_node_22(s: IS.InstallSession) -> None:
    s.call("use_node", {"version": "22"})
    s.call("run_command", {"command": "yarn install --frozen-lockfile"})
    assert s.call("check_install", {}).startswith("OK")
    s.call("submit_install", {"summary": "yarn 1 needs Node 22 here"})


def give_up(s: IS.InstallSession) -> None:
    s.call("run_command", {"command": "npm install"})
    s.deadline = time.monotonic() - 1  # the agent has used its time
    s.call("submit_install", {"summary": "tried npm"})


def test_any_failure_the_quick_fixes_do_not_know_goes_straight_to_the_install_mechanic(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv = case(engine)
    ws = engine._ws(inv)
    seen = fake_installs(monkeypatch, [sandbox.Exec(1, UNKNOWN)], ws)
    runs = fake_runs(monkeypatch)
    rt = Scripted(fix_with_node_22)
    engine._install(inv, rt, time.monotonic())  # type: ignore[arg-type]
    assert len(seen) == 1 and rt.sessions == 1
    assert inv.capabilities is not None and inv.capabilities.node_version == "22", "later runs use that Node"
    assert any("installed by the install mechanic: yarn 1 needs Node 22 here" in n for n in inv.notes)
    command = next(sc for sc, net in runs if net)
    assert "corepack enable" in command and command.endswith("yarn install --frozen-lockfile")
    rec = inv.decisions[-1]
    assert rec.step == "install_session" and rec.decision == "accepted"
    assert (ws / "src" / "__tw__" / "exp_1.adapter.ts").exists(), "own files come back"


def test_a_failed_round_is_followed_by_another_that_knows_what_was_tried(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv = case(engine)
    fake_installs(monkeypatch, [sandbox.Exec(1, UNKNOWN)], engine._ws(inv))
    fake_runs(monkeypatch, checks=[False, True])
    rt = Scripted(give_up, fix_with_node_22)
    engine._install(inv, rt, time.monotonic())  # type: ignore[arg-type]
    assert rt.sessions == 2
    assert "round 1: tried npm" in rt.prompts[1], "the second round is told what the first one did"
    assert inv.decisions[-2].decision == "rejected" and inv.decisions[-1].decision == "accepted"


def test_every_round_is_used_before_the_case_fails_and_the_message_lists_them(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv = case(engine)
    fake_installs(monkeypatch, [sandbox.Exec(1, UNKNOWN)], engine._ws(inv))
    fake_runs(monkeypatch, checks=[False])
    rt = Scripted(give_up, give_up, give_up, give_up)
    with pytest.raises(Stop) as e:
        engine._install(inv, rt, time.monotonic())  # type: ignore[arg-type]
    assert rt.sessions == engine.s.install_rounds == 3
    assert e.value.code == "install_failed" and "round 1" in str(e.value) and "round 3" in str(e.value)
    assert inv.capabilities is not None and inv.capabilities.node_version == "20", "nothing changed"


def test_no_session_without_an_agent_keeps_the_old_failure(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    fake_installs(monkeypatch, [sandbox.Exec(1, UNKNOWN)], engine._ws(inv))
    rt = Scripted()
    with pytest.raises(Stop) as e:
        engine._install(inv, rt, time.monotonic())  # type: ignore[arg-type]
    assert rt.sessions == 1, "no second round when the first could not start"
    assert e.value.code == "install_failed" and "install mechanic" not in str(e.value)


def test_a_timed_out_install_goes_to_the_install_mechanic_too(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    fake_installs(monkeypatch, [sandbox.Exec(124, UNKNOWN, timed_out=True)], engine._ws(inv))
    fake_runs(monkeypatch)
    rt = Scripted(fix_with_node_22)
    engine._install(inv, rt, time.monotonic())  # type: ignore[arg-type]
    assert rt.sessions == 1


def test_changes_to_tracked_files_are_undone_after_a_repair(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = case(engine)
    ws = engine._ws(inv)
    fake_installs(monkeypatch, [sandbox.Exec(1, UNKNOWN)], ws)
    fake_runs(monkeypatch)
    undone: list[list[str]] = []
    monkeypatch.setattr(pipeline, "_tracked_changes", lambda w: ["src/index.ts"])
    monkeypatch.setattr(pipeline, "git", lambda w, args, **kw: undone.append(args) or "")
    with contextlib.suppress(Stop):
        engine._install(inv, Scripted(fix_with_node_22), time.monotonic())  # type: ignore[arg-type]
    assert ["checkout", "--", "."] in undone and any(
        "Undid changes to 1 tracked file" in e.text for e in engine.store.events(inv.id)
    )
