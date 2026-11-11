"""Restricted Docker workers. All target-repository code (install scripts, tests, typecheck, lint) runs here.

Each call is a fresh container: no extra privileges, all capabilities dropped, read-only root filesystem,
CPU, memory and process limits, and no network unless `network=True` (only for dependency install).
"""

from __future__ import annotations

import json
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import Settings
from .models import CapabilityReport, ClockConfig

INSTALL = {
    "npm": "npm ci --no-audit --no-fund",
    "pnpm": "corepack enable --install-directory /tmp/bin && /tmp/bin/pnpm install --frozen-lockfile",
    "yarn": "corepack enable --install-directory /tmp/bin && /tmp/bin/yarn install --frozen-lockfile",
}


@dataclass
class Exec:
    code: int
    out: str
    timed_out: bool = False


def docker_available() -> tuple[bool, str]:
    try:
        r = subprocess.run(
            ["docker", "info", "--format", "{{.OSType}}"], capture_output=True, text=True, timeout=20, check=False
        )
    except OSError, subprocess.TimeoutExpired:
        return False, "Docker is not installed or not responding"
    if r.returncode != 0 or r.stdout.strip() != "linux":
        return False, "Docker Desktop is not running (Linux engine)"
    return True, "Docker Linux engine available"


def run(
    s: Settings, ws: Path, node: str, script: str, *, network: bool, timeout: int, env: dict[str, str] | None = None
) -> Exec:
    args = [
        "docker",
        "run",
        "--rm",
        "--init",
        "--network",
        "bridge" if network else "none",
        "--cpus",
        s.docker_cpus,
        "--memory",
        s.docker_memory,
        "--pids-limit",
        "512",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,exec,size=1g",  # noqa: S108 (tmpfs inside the container, not a host temp file)
        "--mount",
        f"type=bind,source={ws},target=/work",
        "-w",
        "/work",
        "--user",
        "node",
        "-e",
        "HOME=/tmp",
        "-e",
        "CI=1",
        "-e",
        "npm_config_cache=/tmp/npm",
        "-e",
        "COREPACK_HOME=/tmp/corepack",
    ]
    for k, v in (env or {}).items():
        args += ["-e", f"{k}={v}"]
    args += [f"node:{node}-bookworm-slim", "sh", "-c", script]
    try:
        r = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout, check=False, encoding="utf-8", errors="replace"
        )
    except subprocess.TimeoutExpired as e:
        out = e.stdout if isinstance(e.stdout, str) else ""
        return Exec(code=124, out=out[-8000:], timed_out=True)
    return Exec(code=r.returncode, out=(r.stdout + r.stderr)[-8000:])


def install(s: Settings, ws: Path, caps: CapabilityReport) -> Exec:
    assert caps.package_manager
    return run(s, ws, caps.node_version, INSTALL[caps.package_manager], network=True, timeout=s.install_timeout_s)


def _runner_cmd(caps: CapabilityReport, test_path: str | None, out: str) -> str:
    q = shlex.quote
    if caps.test_runner == "vitest":
        target = f" {q(test_path)}" if test_path else ""
        return f"node_modules/.bin/vitest run{target} --reporter=json --outputFile={q(out)}"
    target = f" --runTestsByPath {q(test_path)}" if test_path else ""
    return f"node_modules/.bin/jest{target} --json --outputFile={q(out)} --ci"


@dataclass
class TestOutcome:
    outcome: str  # passed | assertion_failed | error | timeout
    failure: str | None
    failed_names: set[str]
    total: int


def _parse(report_file: Path, ex: Exec) -> TestOutcome:
    if ex.timed_out:
        return TestOutcome("timeout", "Run exceeded the time limit", set(), 0)
    try:
        data = json.loads(report_file.read_text(encoding="utf-8"))
    except OSError, ValueError:
        return TestOutcome("error", ex.out[-1500:] or "No test report produced", set(), 0)
    failed: set[str] = set()
    messages: list[str] = []
    total = 0
    suite_errors: list[str] = []
    for suite in data.get("testResults", []):
        for a in suite.get("assertionResults", []):
            total += 1
            if a.get("status") == "failed":
                failed.add(f"{Path(suite.get('name', '')).name} › {a.get('fullName') or a.get('title')}")
                messages.extend(a.get("failureMessages") or [])
        if suite.get("status") == "failed" and not suite.get("assertionResults"):
            suite_errors.append(suite.get("message") or "Test file failed to load")
    if suite_errors or total == 0:
        return TestOutcome("error", (suite_errors or ["No tests ran"])[0][:1500], failed, total)
    if not failed:
        return TestOutcome("passed", None, failed, total)
    msg = "\n".join(messages)[:1500]
    assertion = any(k in msg for k in ("AssertionError", "expect(", "Expected", "toBe", "toEqual"))
    crash = any(k in msg for k in ("TypeError", "ReferenceError", "SyntaxError", "Cannot find module"))
    return TestOutcome("assertion_failed" if assertion and not crash else "error", msg, failed, total)


def run_test_file(
    s: Settings, ws: Path, caps: CapabilityReport, test_path: str, clocks: list[ClockConfig]
) -> list[TestOutcome]:
    """Run one test file once per clock point, in one fresh container without network."""
    tw = ws / ".tw"
    tw.mkdir(exist_ok=True)
    parts = []
    for i, c in enumerate(clocks):
        out = f".tw/run-{i}.json"
        (ws / out).unlink(missing_ok=True)
        env = f"TZ={shlex.quote(c.time_zone)} TW_INSTANT={shlex.quote(c.instant)} TW_TZ={shlex.quote(c.time_zone)}"
        parts.append(f"{env} {_runner_cmd(caps, test_path, out)} >/dev/null 2>&1 || true")
    ex = run(s, ws, caps.node_version, "; ".join(parts), network=False, timeout=s.test_timeout_s * max(1, len(clocks)))
    return [_parse(ws / f".tw/run-{i}.json", ex) for i in range(len(clocks))]


def run_suite(s: Settings, ws: Path, caps: CapabilityReport) -> TestOutcome:
    out = ".tw/suite.json"
    (ws / ".tw").mkdir(exist_ok=True)
    (ws / out).unlink(missing_ok=True)
    ex = run(
        s,
        ws,
        caps.node_version,
        _runner_cmd(caps, None, out) + " >/dev/null 2>&1 || true",
        network=False,
        timeout=s.test_timeout_s * 5,
    )
    return _parse(ws / out, ex)


def static_checks(s: Settings, ws: Path, caps: CapabilityReport) -> dict[str, int]:
    """Exit codes of the repo's own typecheck and lint, when present. Missing tools are left out."""
    checks: dict[str, str] = {}
    if (ws / "tsconfig.json").exists() and (ws / "node_modules/.bin/tsc").exists():
        checks["typecheck"] = "node_modules/.bin/tsc --noEmit -p tsconfig.json"
    if (ws / "node_modules/.bin/eslint").exists():
        checks["lint"] = "node_modules/.bin/eslint . --quiet"
    result: dict[str, int] = {}
    for name, cmd in checks.items():
        result[name] = run(s, ws, caps.node_version, cmd, network=False, timeout=s.test_timeout_s * 3).code
    return result
