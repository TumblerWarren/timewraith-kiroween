"""Runner commands: TimeWraith's own files run even when the repository's Jest `testMatch` excludes them."""

from __future__ import annotations

from timewraith import sandbox
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
