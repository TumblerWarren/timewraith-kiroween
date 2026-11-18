"""Restricted Docker workers. All target-repository code (install scripts, tests, typecheck, lint) runs here.

Each call is a fresh container: no extra privileges, all capabilities dropped, read-only root filesystem,
CPU, memory and process limits, and no network unless `network=True` (only for dependency install).
"""

from __future__ import annotations

import contextlib
import json
import shlex
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path

from .config import Settings
from .installfix import InstallOptions, command
from .models import CapabilityReport, ClockConfig


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


def _mount(s: Settings, path: Path, target: str, readonly: bool) -> str:
    """The `--mount` value that gives a sandbox container a folder of the data directory.

    On a PC the data directory is a normal folder, so it is bind-mounted. When the backend itself runs in Docker
    (`TW_DATA_VOLUME`), its data directory is a named volume: the host path of a folder is not known here, so the
    sibling container mounts that volume, narrowed to the one folder with `volume-subpath`."""
    ro = ",readonly" if readonly else ""
    if not s.data_volume:
        return f"type=bind,source={path},target={target}{ro}"
    sub = path.resolve().relative_to(s.data_dir.resolve()).as_posix()
    return f"type=volume,source={s.data_volume},target={target},volume-subpath={sub}{ro}"


def run(
    s: Settings,
    ws: Path,
    node: str,
    script: str,
    *,
    network: bool,
    timeout: int,
    env: dict[str, str] | None = None,
    readonly: bool = False,
    writable: tuple[str, ...] = (),
    scratch: tuple[str, ...] = (),
) -> Exec:
    """`readonly` mounts the workspace read-only; `writable` are workspace subfolders mounted back read-write,
    `scratch` are workspace subfolders replaced by an empty in-memory folder (runner caches)."""
    work = _mount(s, ws, "/work", readonly)
    extra: list[str] = []
    for rel in writable:
        (ws / rel).mkdir(parents=True, exist_ok=True)
        extra += ["--mount", _mount(s, ws / rel, f"/work/{rel}", False)]
    for rel in scratch:
        (ws / rel).mkdir(parents=True, exist_ok=True)
        extra += ["--tmpfs", f"/work/{rel}:rw,size=256m"]
    name = f"tw-sbx-{uuid.uuid4().hex[:12]}"
    args = [
        "docker",
        "run",
        "--rm",
        "--init",
        "--name",
        name,
        *s.group_labels("sandbox"),
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
        work,
        *extra,
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
        _kill(name)
        out = e.stdout if isinstance(e.stdout, str) else ""
        return Exec(code=124, out=out[-8000:], timed_out=True)
    return Exec(code=r.returncode, out=(r.stdout + r.stderr)[-8000:])


def _kill(name: str) -> None:
    """Stop a sandbox container by name. Killing the `docker run` client on a timeout leaves the container
    running, so a looping test would keep a CPU busy long after the case moved on."""
    with contextlib.suppress(OSError, subprocess.TimeoutExpired):
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=30, check=False)


def install(s: Settings, ws: Path, caps: CapabilityReport, opts: InstallOptions | None = None) -> Exec:
    """Install dependencies with network. `opts` are the fixed retry options of installfix.py."""
    assert caps.package_manager
    o = opts or InstallOptions(node=caps.node_version)
    return run(s, ws, o.node, command(caps.package_manager, o), network=True, timeout=s.install_timeout_s)


def _own_match(paths: list[str]) -> str:
    """Jest applies the repository's `testMatch` even to `--runTestsByPath`, so a config such as
    `**/tests/**/*.test.ts` skips TimeWraith's generated files. When every file run is TimeWraith's own
    (`__tw__/`), widen the match to them; the repository's own test runs keep its config."""
    own = bool(paths) and all("/__tw__/" in f"/{p}" for p in paths)
    return " --testMatch '**/__tw__/**'" if own else ""


def _runner_cmd(caps: CapabilityReport, test_path: str | None, out: str) -> str:
    q = shlex.quote
    if caps.test_runner == "vitest":
        target = f" {q(test_path)}" if test_path else ""
        return f"node_modules/.bin/vitest run{target} --reporter=json --outputFile={q(out)}"
    target = f" --runTestsByPath {q(test_path)}" if test_path else ""
    match = _own_match([test_path] if test_path else [])
    return f"node_modules/.bin/jest{target}{match} --json --outputFile={q(out)} --ci"


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


def _files_cmd(caps: CapabilityReport, paths: list[str]) -> str:
    files = " ".join(shlex.quote(p) for p in paths)
    if caps.test_runner == "vitest":
        return f"node_modules/.bin/vitest run {files}"
    return f"node_modules/.bin/jest --ci{_own_match(paths)} --runTestsByPath {files}"


def sweep(
    s: Settings, ws: Path, caps: CapabilityReport, harness_paths: list[str], zones: list[str], set_name: str
) -> dict[str, str]:
    """Run all harness files once per zone in one fresh no-network container.

    Each harness writes `.tw/out/<id>__<zone>.json`. Returns the runner log tail per zone for diagnostics.
    """
    out = ws / ".tw" / "out"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    q = shlex.quote
    parts = []
    limit = s.sweep_file_timeout_s
    for z in zones:
        safe = z.replace("/", "_")
        env = f"TZ={q(z)} TW_TZ={q(z)} TW_DIR=/work/.tw TW_SET={q(set_name)}"
        # One runner process per harness file, side by side, each with its own time limit: a harness that loops or
        # runs very long (a synchronous loop ignores Jest's own timeout) is killed alone and the others still report.
        jobs = []
        for i, path in enumerate(harness_paths):
            log = f".tw/out/log-{safe}.{i}.txt"
            run_one = f"timeout -k 5 {limit} {_files_cmd(caps, [path])}"
            skip = f".tw/out/skip-{i}"  # a file that timed out is not run again in the remaining zones
            note = f"{{ echo 'TIMEOUT: {path} exceeded {limit} s' >> {log}; touch {skip}; }}"
            jobs.append(f"[ -e {skip} ] || ( {env} {run_one} > {log} 2>&1; [ $? -ge 124 ] && {note} ) &")
        parts.append("\n".join(jobs) + f"\nwait; cat .tw/out/log-{safe}.*.txt > .tw/out/log-{safe}.txt 2>&1 || true")
    ex = run(s, ws, caps.node_version, "\n".join(parts), network=False, timeout=(limit + 15) * len(zones))
    logs: dict[str, str] = {}
    for z in zones:
        p = out / f"log-{z.replace('/', '_')}.txt"
        logs[z] = p.read_text(encoding="utf-8", errors="replace")[-1500:] if p.exists() else ""
        if ex.timed_out and not logs[z]:
            logs[z] = "timed out"
    return logs


@dataclass
class ProbeResult:
    status: str  # passed | check_failed | error | timeout
    out: list[str]


PROBE_DIR = ".tw/probe"


def probe(s: Settings, ws: Path, caps: CapabilityReport, test_rel: str, zone: str, now_ms: int) -> ProbeResult:
    """Run one probe file (sweep.probe_code) with the clock frozen at `now_ms` in process zone `zone`, no network,
    the repository read-only: only the probe's result folder is writable."""
    out = ws / PROBE_DIR / "out.json"
    out.unlink(missing_ok=True)
    q = shlex.quote
    log = f"/work/{PROBE_DIR}/log.txt"
    script = f"TZ={q(zone)} TW_NOW={int(now_ms)} {_files_cmd(caps, [test_rel])} > {log} 2>&1 || true"
    caches = ("node_modules/.vite", "node_modules/.vitest") if caps.test_runner == "vitest" else ()
    ex = run(
        s, ws, caps.node_version, script, network=False, timeout=s.test_timeout_s,
        readonly=True, writable=(PROBE_DIR,), scratch=caches,
    )  # fmt: skip
    if ex.timed_out:
        return ProbeResult("timeout", [f"The probe ran longer than {s.test_timeout_s} s"])
    try:
        data = json.loads(out.read_text(encoding="utf-8"))
        return ProbeResult(str(data.get("status", "error")), [str(x) for x in data.get("out", [])][:200])
    except OSError, ValueError:
        tail = (ws / PROBE_DIR / "log.txt").read_text(encoding="utf-8", errors="replace")[-1500:]
        return ProbeResult("error", ["The probe did not run (no result). Runner output:", tail or ex.out[-1500:]])


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
