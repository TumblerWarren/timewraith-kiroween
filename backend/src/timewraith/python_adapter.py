"""Execute Python tests in the case sandbox at a controlled Unix clock instant."""

from __future__ import annotations

import json
import shlex
from datetime import datetime
from pathlib import Path

from . import sandbox
from .config import Settings
from .models import PytestResult


def run(
    settings: Settings,
    root: Path,
    path: str,
    instant: str,
    zone: str,
    *,
    code: str | None = None,
    environment: int | None = None,
    controlled: bool = True,
) -> PytestResult:
    worker = Path(__file__).with_name("pytest_worker.py").read_text("utf-8-sig")
    python = "/deps/venv/bin/python" if environment is not None else "python"
    command = shlex.join([python, "-I", "-B", "-c", worker, path, *([code] if code is not None else [])])
    result = sandbox.run(
        settings,
        root,
        "",
        command,
        python_worker=True,
        python_environment=environment,
        readonly=True,
        network=False,
        timeout=settings.test_timeout_s,
        env={
            **({"TW_PYTEST_MS": str(int(datetime.fromisoformat(instant).timestamp() * 1000))} if controlled else {}),
            "TZ": zone,
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        },
    )
    if result.code == 0:
        marker = "TW_PYTEST_RESULT="
        message = next((line for line in reversed(result.out.splitlines()) if line.startswith(marker)), None)
        if message:
            try:
                data = json.loads(message[len(marker) :])
                return PytestResult(instant=instant, zone=zone, **data)
            except ValueError, TypeError:
                pass
    detail = "pytest timed out" if result.timed_out else (result.out.strip()[-800:] or "No usable pytest report")
    return PytestResult(instant=instant, zone=zone, outcome="blocked", detail=detail)
