"""Exercise the Python case entry points using only a locally authored pytest repository."""

import ensurepip
import os
import shlex
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import pytest

from timewraith import pipeline, sandbox
from timewraith.config import Settings
from timewraith.models import CreateInvestigation, Investigation
from timewraith.store import Store


def test_python_case_approval_and_real_pytest_results(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = tmp_path / "fixture"
    fixture.mkdir()
    (fixture / "calendar_api.py").write_text(
        "import time\nfrom calendar_dep import offset\n"
        "def calendar_day():\n    day = time.gmtime(time.time())\n"
        "    return day.tm_mday - (offset if (day.tm_mon, day.tm_mday) == (2, 29) else 0)\n",
        "utf8",
    )
    (fixture / "README.md").write_text("calendar_day returns today's UTC calendar day, including February 29.", "utf8")
    (fixture / "requirements.txt").write_text("calendar-dep==1.0\n", "utf8")
    with ZipFile(fixture / "calendar_dep-1.0-py3-none-any.whl", "w") as wheel:
        dist = "calendar_dep-1.0.dist-info/"
        wheel.writestr("calendar_dep.py", "offset = 1\n")
        wheel.writestr(dist + "METADATA", "Metadata-Version: 2.1\nName: calendar-dep\nVersion: 1.0\n")
        wheel.writestr(dist + "WHEEL", "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n")
        wheel.writestr(dist + "RECORD", "")
    pipeline.git(fixture, ["init", "-q", "-b", "main"])
    pipeline.git(fixture, ["add", "."])
    pipeline.git(fixture, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-qm", "fixture"])
    settings = Settings(data_dir=tmp_path / "data", agent_runtime="stub")
    settings.check_paths()
    engine = pipeline.Engine(settings, Store(settings.db_path))

    def start(case_id: str, phase: Callable[[Investigation], None]) -> None:
        inv = engine._get(case_id)
        phase(inv)
        engine.store.save(inv)

    calls = []

    class FixtureCrew:
        name = "kiro_crew"
        label = "Fixture Crew"

        def call(self, actor: str, step: str, prompt: str, schema: Any) -> Any:
            calls.append(step)
            reply: dict[str, Any] = {"reason": "Review the leap-day contract"}
            if step == "python_inspect":
                reply["paths"] = ["calendar_api.py", "README.md"]
            elif step == "python_discovery":
                assert "return day.tm_mday" in prompt
                reply["items"] = [
                    dict(
                        path="calendar_api.py",
                        line=5,
                        hypothesis="February 29 returns 28",
                        expectation="Return the current UTC day",
                    )
                ]
            elif step == "python_install":
                reply.update(method="requirements", requirements="requirements.txt")
            elif step in {"python_design", "python_verify"}:
                expression = (
                    "time.gmtime(time.time()).tm_mday"
                    if step == "python_design"
                    else "datetime.fromtimestamp(time.time(), timezone.utc).day"
                )
                reply.update(
                    action="test",
                    code="import calendar_api, time\nfrom datetime import datetime, timezone\n"
                    + "def test_calendar():\n    assert calendar_api.calendar_day() == "
                    + expression,
                    failing="2028-02-29T12:00:00Z",
                    control="2028-03-01T12:00:00Z",
                    zone="UTC",
                    evidence=[dict(kind="doc", ref="README.md:1", why="UTC day contract")],
                )
            elif step == "python_fix":
                reply.update(
                    summary="Preserve leap day",
                    root_cause="An offset was subtracted on February 29",
                    original="day.tm_mday - (offset if (day.tm_mon, day.tm_mday) == (2, 29) else 0)",
                    replacement="day.tm_mday",
                    regression="import calendar_api, time\ndef test_leap(monkeypatch):\n"
                    "    monkeypatch.setattr(time, 'time', lambda: 1835438400)\n"
                    "    assert calendar_api.calendar_day() == 29\n",
                    evidence=[dict(kind="source", ref="calendar_api.py:5", why="subtracts an offset")],
                )
            elif step == "review_fix":
                reply.update(approve=True)
            else:
                assert step == "python_followup"
            return schema.model_validate(reply)

    monkeypatch.setattr(engine, "_runtime", lambda _: FixtureCrew())

    def local_fixture(s: Settings, ws: Path, node: str, command: str, **kwargs: Any) -> sandbox.Exec:
        assert kwargs["python_worker"] and kwargs["readonly"] and kwargs["python_environment"] == 1
        dep = tmp_path / "fixture-deps"
        if kwargs["network"]:
            assert "pip install -r ./requirements.txt" in command
            pip_wheel = next((Path(ensurepip.__file__).parent / "_bundled").glob("pip-*.whl"))
            invoke = (
                f"import sys,runpy;sys.path.insert(0,{str(pip_wheel)!r});runpy.run_module('pip',run_name='__main__')"
            )
            setup = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    invoke,
                    "install",
                    "--disable-pip-version-check",
                    "--no-index",
                    "--find-links",
                    str(ws),
                    "--target",
                    str(dep),
                    "-r",
                    str(ws / "requirements.txt"),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            return sandbox.Exec(setup.returncode, setup.stdout + setup.stderr)
        args = shlex.split(command)
        args[4] = args[4].replace(
            "    root = Path.cwd()", f"    sys.path.insert(0, {str(dep)!r})\n    root = Path.cwd()"
        )
        try:
            result = subprocess.run(
                [sys.executable, *args[1:]],
                cwd=ws,
                env={**os.environ, **kwargs["env"]},
                text=True,
                capture_output=True,
                timeout=kwargs["timeout"],  # the limit the engine asks the sandbox for, not a number of our own
                check=False,
                encoding="utf8",
                errors="replace",
            )
        except subprocess.TimeoutExpired:
            return sandbox.Exec(124, "", timed_out=True)  # what the real sandbox reports
        return sandbox.Exec(result.returncode, result.stdout + result.stderr)

    monkeypatch.setattr(engine, "_start", start)
    monkeypatch.setattr(pipeline, "now_iso", lambda: "2026-11-19T00:00:00Z")
    monkeypatch.setattr(pipeline, "resolve_ref", lambda *_: "a" * 40)
    monkeypatch.setattr(pipeline, "clone", lambda target, ws, *_: shutil.copytree(fixture, ws))
    monkeypatch.setattr(sandbox, "docker_available", lambda: (True, "fixture"))
    monkeypatch.setattr(sandbox, "prepare_pytest", lambda *_: sandbox.Exec(0, "fixture"))
    monkeypatch.setattr(sandbox, "run", local_fixture)
    case_id = engine.create(CreateInvestigation(repository_url="https://github.com/example/clock", ref="main")).id

    def why_not() -> str:
        """If the sequence of agent calls differs, show each pytest run: a redesign means a run did not behave."""
        try:
            runs = engine._get(case_id).sweeps[0].pytest_results
        except IndexError, KeyError:
            return "no pytest runs"
        return "\n".join(f"{r.instant} {r.zone}: {r.outcome} {r.detail[:300]!r}" for r in runs)

    waiting = engine._get(case_id)
    assert waiting.stage == "awaiting-plan-approval" and not waiting.sweeps
    assert waiting.test_plan and all(ex.adapter == "python_crew" for ex in waiting.test_plan.experiments)
    engine.approve_plan(case_id)
    done = engine._get(case_id)
    assert done.stage == "completed" and done.status == "fixed-version-verified", done.bugs[0].fix
    assert len(done.bugs) == 1 and done.bugs[0].regression_test
    assert calls == [
        "python_inspect",
        "python_discovery",
        "python_install",
        "python_design",
        "python_verify",
        "python_followup",
        "python_fix",
        "review_fix",
    ], why_not()

    runs = done.sweeps[0].pytest_results
    assert all(r.exercised_source for r in runs)
    assert [r.outcome for r in runs] == ["failed", "passed"] + ["failed"] * settings.repeat_runs + ["passed"]

    fixed = done.bugs[0]
    assert fixed.fix.state == "verified" and len(fixed.fix.attempts[0].gates) == 8
    accepted = engine.decide_fix(case_id, fixed.id, True)
    assert engine.patch_file(case_id, fixed.id).is_file()
    branch = accepted.bugs[0].fix.branch
    assert branch and branch.files == ["calendar_api.py", fixed.regression_test_path], accepted.notes
    assert (Path(branch.path) / fixed.regression_test_path).read_text() == fixed.contribution_test
    from timewraith.contribute import Rules
    from timewraith.models import RuleSummary

    rules = Rules(RuleSummary(default_branch="main"), "", "", {}, False)
    monkeypatch.setattr(pipeline.contribute, "read_rules", lambda *_: rules)
    real_git = pipeline.git

    def local_fetch(ws: Path, args: list[str], **kwargs: Any) -> str:
        if args[0] == "fetch":
            return real_git(ws, ["-c", "protocol.file.allow=always", "fetch", "-q", str(fixture), args[-1]])
        return real_git(ws, args, **kwargs)

    monkeypatch.setattr(pipeline, "git", local_fetch)
    prepared = engine.prepare_contribution(case_id, fixed.id)
    assert all(c.passed for c in prepared.checks), prepared.checks
    assert prepared.test_path == fixed.regression_test_path

    # On a newer revision the stored Raven probe must run against the new source.
    def revision(ws: Path, args: list[str], **kwargs: Any) -> str:
        if args[0] == "checkout":
            source = ws / "calendar_api.py"
            source.write_text(source.read_text().replace("day.tm_mday - (offset", "day.tm_mday - (0 * offset"), "utf8")
        return "b" * 40 if args[0] == "rev-parse" else ""

    monkeypatch.setattr(pipeline, "git", revision)
    retested = engine.retest(case_id, done.bugs[0].id, "newer")
    assert retested.bugs[0].retests[-1].outcome == "fixed"


def test_worker_controls_calendar_fold_and_independent_elapsed_time(tmp_path: Path) -> None:
    from datetime import UTC, datetime

    from timewraith import pytest_worker

    (tmp_path / "clock_api.py").write_text(
        "from datetime import date, datetime\nfrom time import monotonic, monotonic_ns\n"
        "def snapshot():\n    return date.today(), datetime.now(), monotonic(), monotonic_ns()\n",
        "utf8",
    )
    probe = """
from datetime import date, datetime, timezone
from clock_api import snapshot
from timewraith_clock import advance
def test_calendar():
    first, local, seconds, ns = snapshot()
    assert (local.hour, local.minute, local.fold) == (1, 30, 0)
    assert isinstance(local, date)
    advance(3600, monotonic=False)
    assert snapshot()[1].fold == 1 and snapshot()[2:] == (seconds, ns)
    advance(1.25, wall=False)
    assert snapshot()[1] == local and snapshot()[2:] == (seconds + 1.25, ns + 1250000000)
    advance(-10800, monotonic=False)
    assert snapshot()[0] == date(2028, 11, 4)
    assert datetime.now(timezone.utc).date() == date(2028, 11, 5)
"""
    instant = datetime(2028, 11, 5, 5, 30, tzinfo=UTC)
    result = subprocess.run(
        [sys.executable, "-I", "-B", str(Path(pytest_worker.__file__).resolve()), "clock_api.py", probe],
        cwd=tmp_path,
        env={
            **os.environ,
            "TZ": "America/New_York",
            "TW_PYTEST_MS": str(int(instant.timestamp() * 1000)),
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        },
        text=True,
        capture_output=True,
        timeout=30,
    )
    assert '"outcome": "passed"' in result.stdout, result.stdout + result.stderr
