"""Host smoke test of the sweep harness with real Vitest (no Docker). Uses a tiny fixture written here, never a
target repository. Run: uv --directory backend run python scripts/harness_smoke.py <path-to-frontend/node_modules>
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from timewraith import sweep as S
from timewraith.models import InvariantUse

# The classic mistake: "today" taken from the UTC ISO string instead of the local calendar.
SOURCE = "export function todayKey(d) {\n  return d.toISOString().slice(0, 10);\n}\n"
ADAPTER = "import { todayKey } from '../dates';\nexport function run(ctx) {\n  return { date: todayKey(ctx.now) };\n}\n"


def main(node_modules: Path) -> int:
    root = Path(tempfile.mkdtemp(prefix="tw-harness-"))
    try:
        (root / "package.json").write_text('{"type":"module"}', encoding="utf-8")
        (root / "src" / "__tw__").mkdir(parents=True)
        (root / "src" / "dates.js").write_text(SOURCE, encoding="utf-8")
        (root / "src" / "__tw__" / "exp_demo.adapter.js").write_text(ADAPTER, encoding="utf-8")
        harness = "src/__tw__/dates.exp_demo.tw.test.js"
        (root / harness).write_text(S.harness_code("exp_demo", "vitest"), encoding="utf-8")
        subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(root / "node_modules"), str(node_modules)],
            check=True,
            capture_output=True,
        )
        tw = root / ".tw"
        (tw / "out").mkdir(parents=True)
        zones = ["UTC", "America/Los_Angeles", "Asia/Kolkata"]
        points = {z: v for z, v in S.build_points([]).items() if z in zones}
        (tw / "points-exp_demo.json").write_text(json.dumps(points), encoding="utf-8")
        vitest = str(node_modules / "vitest" / "vitest.mjs")
        for z in zones:
            env = {**os.environ, "TZ": z, "TW_TZ": z, "TW_DIR": str(tw).replace("\\", "/"), "TW_SET": "points"}
            r = subprocess.run(
                ["node", vitest, "run", harness],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            if r.returncode != 0:
                print(r.stdout[-1500:], r.stderr[-1500:])
                return 1
        outputs = {z: json.loads((tw / "out" / f"exp_demo__{z.replace('/', '_')}.json").read_text()) for z in zones}
        print({z: len(v) for z, v in outputs.items()}, "points recorded")
        vs = S.check(outputs, [InvariantUse(id="local_date_matches", reason="todayKey is the local day")])
        for v in vs:
            print(f"{v.invariant} {v.zone} {v.local}: {v.detail} (x{v.count})")
        bad = next(v for v in vs if v.zone == "America/Los_Angeles")
        reg = "src/__tw__/bug_demo.regression.test.js"
        (root / reg).write_text(
            S.regression_code(exp_id="exp_demo", runner="vitest", v=bad, title="todayKey is local", target="fixture"),
            encoding="utf-8",
        )
        r = subprocess.run(
            ["node", vitest, "run", reg],
            cwd=root,
            env={**os.environ, "TZ": bad.zone},
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        print("regression test on buggy code:", "FAILS" if r.returncode else "passes")
        (root / "src" / "dates.js").write_text(
            "export function todayKey(d) {\n  return d.toLocaleDateString('en-CA');\n}\n", encoding="utf-8"
        )
        r2 = subprocess.run(
            ["node", vitest, "run", reg],
            cwd=root,
            env={**os.environ, "TZ": bad.zone},
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        print("regression test on fixed code:", "FAILS" if r2.returncode else "passes")
        return 0 if vs and r.returncode and not r2.returncode else 1
    finally:
        subprocess.run(["cmd", "/c", "rmdir", str(root / "node_modules")], check=False, capture_output=True)
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]).resolve()))
