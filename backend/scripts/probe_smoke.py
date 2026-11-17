"""Run one probe against a workspace that is already installed (a past case), without any agent.

Usage: uv run python scripts/probe_smoke.py <workspace repo dir> <runner: jest|vitest> <ext: ts|js>
"""

from __future__ import annotations

import sys
from pathlib import Path

from timewraith import sandbox
from timewraith import sweep as S
from timewraith.config import Settings
from timewraith.models import CapabilityReport, ClockConfig

BODY = """
const { CronExpressionParser } = await load('src/index');
const it = CronExpressionParser.parse('0 * * * *', { tz: 'Australia/Lord_Howe', currentDate: new Date() });
const a = it.next().getTime();
let b = null;
try { b = it.next().getTime(); } catch (e) { print('second next() threw: ' + e.message); }
print('first', new Date(a), 'second', b === null ? null : new Date(b));
check(b !== null && b > a, 'next() must keep moving forward');
"""


def main() -> None:
    ws, runner, ext = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    caps = CapabilityReport(package_manager="npm", test_runner=runner, node_version="22")  # type: ignore[arg-type]
    rel = f"{S.PROBE_TEST}.{ext}"
    (ws / rel).parent.mkdir(parents=True, exist_ok=True)
    (ws / rel).write_text(S.probe_code(runner, BODY), encoding="utf-8")
    s = Settings()
    for label, zone, iso in [
        ("failing", "Australia/Lord_Howe", "2024-04-06T13:30:00Z"),
        ("control", "Australia/Lord_Howe", "2024-06-06T13:30:00Z"),
    ]:
        ms = S.parse_instant(iso)
        assert ms is not None
        r = sandbox.probe(s, ws, caps, rel, zone, ms)
        print(label, r.status, r.out)
    (ws / rel).unlink()
    # The same body as a regression test, as code writes it after accepting a defect.
    ms = S.parse_instant("2024-04-06T13:30:00Z")
    assert ms is not None
    reg = f"src/__tw__/bug_smoke.regression.test.{ext}"
    (ws / reg).parent.mkdir(parents=True, exist_ok=True)
    code = S.reproduction_test_code(
        runner=runner, cases=[("smoke", BODY, ms)], zone="Australia/Lord_Howe", target="smoke", prefix="../../"
    )
    (ws / reg).write_text(code, encoding="utf-8")
    clock = ClockConfig(instant=S.iso(ms), time_zone="Australia/Lord_Howe", label="smoke")
    out = sandbox.run_test_file(s, ws, caps, reg, [clock])[0]
    print("regression test", out.outcome, (out.failure or "")[:300])
    (ws / reg).unlink()


if __name__ == "__main__":
    main()
