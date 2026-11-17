"""Apply a case's verified patch to its workspace, walk cron-parser's public next() across the Lord Howe fall-back,
then restore the workspace. Usage: uv run python scripts/check_patch.py <workspace repo dir> <patch file>
"""

from __future__ import annotations

import sys
from pathlib import Path

from timewraith import sandbox
from timewraith import sweep as S
from timewraith.config import Settings
from timewraith.ingest import git
from timewraith.models import CapabilityReport

BODY = """
const { CronExpressionParser } = await load('src/index');
const walk = (expr, tz, start, n) => {
  const it = CronExpressionParser.parse(expr, { tz, currentDate: new Date(start) });
  const out = [];
  for (let i = 0; i < n; i++) {
    try { out.push(it.next().toISOString()); } catch (e) { out.push('THROWS ' + e.message); break; }
  }
  return out;
};
const lh = walk('0 * * * *', 'Australia/Lord_Howe', '2024-04-06T12:30:00Z', 6);
print('Lord_Howe 0 * * * *', lh);
print('Lord_Howe 0 8 * * *', walk('0 8 * * *', 'Australia/Lord_Howe', '2024-04-06T00:00:00Z', 2));
print('New_York 0 * * * *', walk('0 * * * *', 'America/New_York', '2024-11-03T04:00:00Z', 4));
// Local 00:00, 01:00 (LHDT +11), then 02:00 (LHST +10:30) = 15:30Z: wall-clock hours, each once.
check(JSON.stringify(lh.slice(0, 4)) === JSON.stringify(
  ['2024-04-06T13:00:00.000Z', '2024-04-06T14:00:00.000Z', '2024-04-06T15:30:00.000Z', '2024-04-06T16:30:00.000Z']),
  'hourly schedule fires on each local hour across the fall-back');
"""


def main() -> None:
    ws, patch = Path(sys.argv[1]), Path(sys.argv[2]).read_text(encoding="utf-8")
    source_part = patch.split("\ndiff --git a/dev/null")[0].split("--- /dev/null")[0]
    caps = CapabilityReport(package_manager="npm", test_runner="jest", node_version="22")
    rel = f"{S.PROBE_TEST}.ts"
    (ws / rel).parent.mkdir(parents=True, exist_ok=True)
    (ws / rel).write_text(S.probe_code("jest", BODY), encoding="utf-8")
    s = Settings()
    try:
        for label in ("original", "patched"):
            if label == "patched":
                git(ws, ["apply", "--whitespace=nowarn", "-"], stdin=source_part)
            r = sandbox.probe(s, ws, caps, rel, "UTC", 1_700_000_000_000)
            print(label, r.status)
            for line in r.out:
                print("   ", line)
    finally:
        git(ws, ["checkout", "--", "."])
        (ws / rel).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
