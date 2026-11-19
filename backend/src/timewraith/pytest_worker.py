"""Standalone script executed by the Python sandbox; target code is first imported by pytest."""

from __future__ import annotations

import datetime as dt
import json
import os
import platform
import sys
import tempfile
import time
import tomllib
from pathlib import Path
from types import ModuleType
from typing import Any
from zoneinfo import ZoneInfo


def install_clock(instant_ms: int, zone: ZoneInfo) -> None:
    wall_ns = instant_ms * 1_000_000
    elapsed_ns = 0

    def advance(seconds: float, *, wall: bool = True, monotonic: bool = True) -> None:
        nonlocal wall_ns, elapsed_ns
        delta = round(seconds * 1_000_000_000)
        if monotonic and delta < 0:
            raise ValueError("Monotonic time cannot move backwards")
        if wall:
            wall_ns += delta
        if monotonic:
            elapsed_ns += delta

    real_date, real_datetime = dt.date, dt.datetime

    class DateType(type):
        def __subclasscheck__(self, value: type) -> bool:
            return issubclass(value, real_date)

        def __instancecheck__(self, value: Any) -> bool:
            return isinstance(value, real_date)

    class DateTimeType(type):
        def __instancecheck__(self, value: Any) -> bool:
            return isinstance(value, real_datetime)

    class ClockDateTime(dt.datetime, metaclass=DateTimeType):
        @classmethod
        def now(cls, tz: dt.tzinfo | None = None) -> Any:
            value = cls.fromtimestamp(wall_ns / 1e9, zone if tz is None else tz)
            return value.replace(tzinfo=None) if tz is None else value

        @classmethod
        def today(cls) -> Any:
            return cls.now()

        @classmethod
        def utcnow(cls) -> Any:
            return cls.now(dt.UTC).replace(tzinfo=None)

    class ClockDate(dt.date, metaclass=DateType):
        @classmethod
        def today(cls) -> Any:
            now = ClockDateTime.now()
            return cls(now.year, now.month, now.day)

    for virtual, original in ((ClockDate, real_date), (ClockDateTime, real_datetime)):
        virtual.__name__, virtual.__qualname__, virtual.__module__ = (
            original.__name__,
            original.__qualname__,
            "datetime",
        )
    dt.datetime = ClockDateTime  # type: ignore[misc]
    dt.date = ClockDate  # type: ignore[misc]
    time.time = lambda: wall_ns / 1e9
    time.time_ns = lambda: wall_ns
    time.monotonic = lambda: elapsed_ns / 1e9
    time.monotonic_ns = lambda: elapsed_ns
    clock = ModuleType("timewraith_clock")
    clock.__dict__["advance"] = advance
    sys.modules[clock.__name__] = clock


def main() -> None:
    import pytest
    from packaging.specifiers import SpecifierSet

    root = Path.cwd()
    project = root / "pyproject.toml"
    required = (
        tomllib.loads(project.read_text("utf8")).get("project", {}).get("requires-python") if project.exists() else None
    )
    if required and not SpecifierSet(required).contains(platform.python_version()):
        raise RuntimeError(f"Project requires Python {required}; worker uses {platform.python_version()}")

    reports: dict[str, str] = {}
    errors: list[str] = []
    failures: list[str] = []
    collection_skips: list[str] = []

    exercised = False
    assertion_failure = False
    target = str((root / sys.argv[1]).resolve())
    generated = len(sys.argv) > 2

    def trace(frame: Any, event: str, arg: Any) -> None:
        nonlocal exercised
        if event == "call" and frame.f_code.co_filename == target and frame.f_code.co_name != "<module>":
            exercised = True

    class Results:
        @pytest.hookimpl(hookwrapper=True)
        def pytest_runtest_call(self) -> Any:
            previous = sys.getprofile()
            if generated:
                sys.setprofile(trace)
            try:
                yield
            finally:
                if generated:
                    sys.setprofile(previous)

        def pytest_collectreport(self, report: Any) -> None:
            if report.failed:
                errors.append(str(report.longrepr)[-500:])
            elif report.skipped:
                collection_skips.append(str(report.longrepr)[-400:])

        def pytest_exception_interact(self, call: Any, report: Any) -> None:
            nonlocal assertion_failure
            if call.when == "call" and isinstance(call.excinfo.value, AssertionError):
                assertion_failure = True
            if call.when == "call" and isinstance(call.excinfo.value, ImportError):
                errors.append(f"{report.nodeid}: {call.excinfo.value}")

        def pytest_runtest_logreport(self, report: Any) -> None:
            if report.when == "call" or report.skipped:
                reports[report.nodeid] = report.outcome
                if report.failed:
                    failures.append(f"{report.nodeid}: {str(report.longrepr)[-500:]}")
            elif report.failed:
                errors.append(f"{report.nodeid}: {str(report.longrepr)[-400:]}")

    if "TW_PYTEST_MS" in os.environ:
        if hasattr(time, "tzset"):
            time.tzset()
        install_clock(int(os.environ["TW_PYTEST_MS"]), ZoneInfo(os.environ["TZ"]))
    sys.path[:0] = [str(root), str(root / "src")]
    with tempfile.TemporaryDirectory(prefix="tw-pytest-") as tmp:
        test_path = "./" + sys.argv[1]
        if generated:
            probe = Path(tmp) / "test_reproduction.py"
            probe.write_text(sys.argv[2], encoding="utf8")
            test_path = str(probe)
        code = pytest.main(["-q", "-p", "no:cacheprovider", "-o", "addopts=", "--", test_path], plugins=[Results()])
    passed = sum(r == "passed" for r in reports.values())
    skipped = sum(r == "skipped" for r in reports.values())
    failed = len(failures)
    detail = "; ".join((errors or failures)[:3])
    if code == 5 and not errors:
        outcome = "skipped"
        detail = collection_skips[0] if collection_skips else "No tests collected"
    elif errors or code not in (0, 1) or (code == 1 and not failed):
        outcome = "blocked"
        detail = detail or f"pytest exit {code}; no usable test result"
    elif failed:
        outcome = "failed"
    else:
        outcome = "passed" if passed else "skipped"
    print(
        "TW_PYTEST_RESULT="
        + json.dumps(
            dict(
                outcome=outcome,
                assertion_failure=assertion_failure,
                exercised_source=exercised,
                passed=passed,
                skipped=skipped,
                failed=failed,
                detail=detail[:1200],
                runtime=f"Python {platform.python_version()} / pytest {pytest.__version__}",
            )
        )
    )


if __name__ == "__main__":
    main()
