"""Runner commands: TimeWraith's own files run even when the repository's Jest `testMatch` excludes them."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from timewraith import sandbox
from timewraith.config import Settings
from timewraith.models import CapabilityReport

JEST = CapabilityReport(package_manager="npm", test_runner="jest")


def test_own_files_widen_the_jest_match() -> None:
    sweep = sandbox._files_cmd(JEST, ["src/__tw__/a.exp_1.tw.test.ts", "lib/__tw__/b.exp_2.tw.test.ts"])
    assert "--testMatch '**/__tw__/**'" in sweep
    one = sandbox._runner_cmd(JEST, "src/__tw__/bug_1.regression.test.ts", ".tw/run-0.json")
    assert "--testMatch '**/__tw__/**'" in one


def test_repository_tests_keep_the_repository_config() -> None:
    assert "--testMatch" not in sandbox._runner_cmd(JEST, "tests/CronDate.test.ts", ".tw/run-0.json")
    assert "--testMatch" not in sandbox._runner_cmd(JEST, None, ".tw/suite.json")
    assert "--testMatch" not in sandbox._files_cmd(JEST, ["src/__tw__/a.tw.test.ts", "tests/x.test.ts"])


def test_every_container_the_app_starts_joins_the_apps_group(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Docker Desktop shows containers with the same compose project label as one group."""
    seen: list[list[str]] = []

    def fake_run(args: list[str], **kw: object) -> subprocess.CompletedProcess[str]:
        seen.append(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(sandbox.subprocess, "run", fake_run)
    s = Settings(data_dir=tmp_path, project="myapp")
    s.check_paths()
    sandbox.run(s, tmp_path, "22", "true", network=False, timeout=5)
    args = seen[0]
    assert "com.docker.compose.project=myapp" in args and "com.docker.compose.service=sandbox" in args
    assert s.group_labels("crew") == [
        "--label",
        "com.docker.compose.project=myapp",
        "--label",
        "com.docker.compose.service=crew",
    ]
