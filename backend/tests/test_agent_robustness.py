from pathlib import Path

import pytest

from timewraith import agents as A
from timewraith import installsession as I
from timewraith.fixsession import ToolError


def _session(tmp_path: Path) -> I.InstallSession:
    return I.open_session(
        ws=tmp_path,
        tracked=frozenset(),
        extra_readable=frozenset(),
        node="22",
        on_event=lambda text, data: None,
        deadline=10**12,
        max_calls=100,
        max_commands=50,
        command_timeout_s=10,
        run=lambda node, command, timeout: I.CommandResult(1, "boom"),
        check=lambda node: (False, "no"),
    )


def test_a_command_that_keeps_failing_is_stopped(tmp_path: Path) -> None:
    s = _session(tmp_path)
    for _ in range(I.MAX_SAME_FAILURE):
        s.run_command("pnpm build")
    with pytest.raises(ToolError, match="different"):
        s.run_command("pnpm build")


def test_a_changed_command_is_allowed(tmp_path: Path) -> None:
    s = _session(tmp_path)
    for _ in range(I.MAX_SAME_FAILURE):
        s.run_command("pnpm build")
    assert "exit code 1" in s.run_command("pnpm build --filter core")


def test_refute_prompt_names_the_local_time_trap() -> None:
    text = A.prompt_refute(
        title="t",
        claim="c",
        reproduction="check(false)",
        failing="UTC@x",
        control="Pacific/Auckland@x",
        path="src/a.ts",
        source="a.getMonth()",
    )
    assert "same local calendar values" in text
    assert "Do not invent reasons" in text
