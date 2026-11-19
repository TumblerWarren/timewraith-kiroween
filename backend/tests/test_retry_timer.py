"""Exercise the generated cancellation sweep and regression with the workspace's installed Vitest."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from timewraith import sweep as S
from timewraith.models import InvariantUse

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
VITEST = FRONTEND / "node_modules/vitest/vitest.mjs"


@pytest.mark.skipif(not VITEST.is_file() or not shutil.which("node"), reason="needs frontend Vitest and Node")
def test_cancelled_retry_replays_against_source_fix() -> None:
    with tempfile.TemporaryDirectory(dir=FRONTEND, prefix="tw-retry-fixture-") as tmp:
        root = Path(tmp)
        out = root / "out"
        out.mkdir()
        (root / "package.json").write_text('{"type":"module"}', "utf8")
        (root / "vitest.config.mjs").write_text("export default {};", "utf8")
        ms = 1840000000000
        (root / "points-exp_retry.json").write_text(json.dumps({"UTC": [ms]}), "utf8")
        source = root / "retry.js"
        schedule = "export function retry(notify, delay) { const id = setTimeout(notify, delay); return () => "
        source.write_text(schedule + "{}; }", "utf8")
        (root / "exp_retry.adapter.js").write_text(
            "import {retry} from './retry.js'; export async function run(ctx) {"
            "return {after_cancel: await ctx.cancelledRetry(retry)}; }",
            "utf8",
        )
        (root / "sweep.test.js").write_text(S.harness_code("exp_retry", "vitest"), "utf8")

        def run(name: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                ["node", str(VITEST), "run", name, "--configLoader", "runner"],
                cwd=root,
                env={**os.environ, "TZ": "UTC", "TW_TZ": "UTC", "TW_DIR": str(root), "TW_SET": "points"},
                capture_output=True,
                text=True,
                encoding="utf8",
                errors="replace",
                timeout=60,
                check=False,
            )

        result = run("sweep.test.js")
        assert result.returncode == 0, result.stdout + result.stderr
        records = json.loads((out / "exp_retry__UTC.json").read_text("utf8"))
        violations = S.check({"UTC": records}, [InvariantUse(id="retry_cancelled", reason="retry can be cancelled")])
        assert len(violations) == 1 and violations[0].invariant == "retry_cancelled"
        regression = S.regression_code(
            exp_id="exp_retry",
            runner="vitest",
            v=violations[0],
            title="cancelling suppresses the retry",
            target="fixture",
        )
        (root / "regression.test.js").write_text(regression, "utf8")
        result = run("regression.test.js")
        assert result.returncode == 1 and "AssertionError" in result.stderr + result.stdout
        source.write_text(schedule + "clearTimeout(id); }", "utf8")
        result = run("regression.test.js")
        assert result.returncode == 0, result.stdout + result.stderr
        source.write_text("export function retry() { return () => {}; }", "utf8")
        result = run("sweep.test.js")
        assert result.returncode != 0 and "Uncancelled retry must fire once" in result.stdout + result.stderr


@pytest.mark.skipif(not VITEST.is_file() or not shutil.which("node"), reason="needs frontend Vitest and Node")
def test_delivery_sweep_and_regressions() -> None:
    with tempfile.TemporaryDirectory(dir=FRONTEND, prefix="tw-delivery-fixture-") as tmp:
        root = Path(tmp)
        (root / "out").mkdir()
        (root / "package.json").write_text('{"type":"module"}', "utf8")
        (root / "vitest.config.mjs").write_text("export default {};", "utf8")
        ms = 1840000000000
        (root / "points-exp_delivery.json").write_text(json.dumps({"UTC": [ms, ms + 1]}), "utf8")
        source = root / "timers.js"
        source.write_text(
            "export function once(cb, ms) { if (Date.now() % 2) setTimeout(cb, ms - 1);"
            "else { setTimeout(cb, ms); setTimeout(cb, ms); } }"
            "export function every(cb, ms) { setInterval(cb, ms + 1); }",
            "utf8",
        )
        (root / "exp_delivery.adapter.js").write_text(
            "import {once,every} from './timers.js'; export async function run(ctx) { return {"
            "timeout_trace: await ctx.timerTrace(once), interval_trace: await ctx.timerTrace(every)}; }",
            "utf8",
        )
        (root / "sweep.test.js").write_text(S.harness_code("exp_delivery", "vitest"), "utf8")

        def run(name: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                ["node", str(VITEST), "run", name, "--configLoader", "runner"],
                cwd=root,
                env={**os.environ, "TW_DIR": str(root), "TW_TZ": "UTC", "TZ": "UTC"},
                capture_output=True,
                text=True,
                encoding="utf8",
                errors="replace",
                timeout=60,
            )

        result = run("sweep.test.js")
        assert result.returncode == 0, result.stderr
        records = json.loads((root / "out/exp_delivery__UTC.json").read_text("utf8"))
        assert records[0]["r0"] == records[0]["r1"] == {"timeout_trace": [10, 10], "interval_trace": [11, 22]}
        rules = [InvariantUse(id=k, reason="fixed delivery schedule") for k in S.TIMER_DELIVERY]
        violations = S.check({"UTC": records}, rules)
        assert {(v.invariant, v.failure_kind) for v in violations} == {
            ("timeout_delivery", "early_callback"),
            ("timeout_delivery", "extra_callback"),
            ("interval_delivery", "missing_callback"),
        }
        for i, v in enumerate(violations):
            (root / f"reg-{i}.test.js").write_text(
                S.regression_code(exp_id="exp_delivery", runner="vitest", v=v, title=v.failure_kind, target="fixture"),
                "utf8",
            )
        result = run("reg-")
        assert result.returncode == 1 and "3 failed" in result.stdout, result.stdout + result.stderr
        source.write_text(
            "export const once = (cb, ms) => setTimeout(cb, ms);export const every = (cb, ms) => setInterval(cb, ms);",
            "utf8",
        )
        result = run("reg-")
        assert result.returncode == 0 and "3 passed" in result.stdout, result.stdout + result.stderr


def test_expiry_comparison_requires_a_citation_only_at_equality() -> None:
    def evaluate(trace: list[bool], policy: bool | None, ref: str | None) -> list[str]:
        rule = InvariantUse(
            id="expiry_deadline", reason="documented lifetime", expired_at_deadline=policy, expectation_ref=ref
        )
        observation = {"expiry_trace": trace}
        records = {"UTC": [{"t": 1840000000000, "r0": observation, "r1": observation}]}
        return [v.failure_kind for v in S.check(records, [rule])]

    assert evaluate([True, True, False], None, None) == ["before_deadline", "after_deadline"]
    assert evaluate([False, False, True], True, None) == []
    assert evaluate([False, False, True], True, "README.md:2-2") == ["at_deadline"]
    assert evaluate([False, True, True], False, "README.md:2-2") == ["at_deadline"]


@pytest.mark.skipif(not VITEST.is_file() or not shutil.which("node"), reason="needs frontend Vitest and Node")
def test_expiry_trace_replays_one_object_across_its_deadline() -> None:
    with tempfile.TemporaryDirectory(dir=FRONTEND, prefix="tw-expiry-fixture-") as tmp:
        root = Path(tmp)
        (root / "out").mkdir()
        (root / "package.json").write_text('{"type":"module"}', "utf8")
        (root / "vitest.config.mjs").write_text("export default {};", "utf8")
        ms = 1840000000000
        (root / "points-exp_expiry.json").write_text(json.dumps({"UTC": [ms]}), "utf8")
        source = root / "item.js"
        create = "export function create(end) { return { end, reads: 0 }; }"
        read = "export function expired(item) { if (++item.reads !== Date.now()-item.end+2) throw Error('new item');"
        source.write_text(create + read + "return Date.now() > item.end; }", "utf8")
        (root / "exp_expiry.adapter.js").write_text(
            "import {create,expired} from './item.js'; export async function run(ctx) {"
            "return {expiry_trace: await ctx.expiryTrace(create,expired)}; }",
            "utf8",
        )
        (root / "sweep.test.js").write_text(S.harness_code("exp_expiry", "vitest"), "utf8")

        def run(name: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                ["node", str(VITEST), "run", name, "--configLoader", "runner"],
                cwd=root,
                env={**os.environ, "TW_DIR": str(root), "TW_TZ": "UTC", "TZ": "UTC"},
                capture_output=True,
                text=True,
                encoding="utf8",
                errors="replace",
                timeout=60,
            )

        result = run("sweep.test.js")
        assert result.returncode == 0, result.stderr
        records = json.loads((root / "out/exp_expiry__UTC.json").read_text("utf8"))
        assert records[0]["r0"] == records[0]["r1"] == {"expiry_trace": [False, False, True]}
        rule = InvariantUse(
            id="expiry_deadline",
            reason="item expires at deadline",
            expired_at_deadline=True,
            expectation_ref="README.md:1-1",
        )
        (v,) = S.check({"UTC": records}, [rule])
        assert v.failure_kind == "at_deadline"
        (root / "regression.test.js").write_text(
            S.regression_code(
                exp_id="exp_expiry", runner="vitest", v=v, title="expires at the boundary", target="fixture"
            ),
            "utf8",
        )
        result = run("regression.test.js")
        assert result.returncode == 1 and "AssertionError" in result.stdout + result.stderr
        source.write_text(create + read + "return Date.now() >= item.end; }", "utf8")
        result = run("regression.test.js")
        assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.skipif(not VITEST.is_file() or not shutil.which("node"), reason="needs frontend Vitest and Node")
def test_wall_clock_jumps_preserve_elapsed_deadlines() -> None:
    with tempfile.TemporaryDirectory(dir=FRONTEND, prefix="tw-jump-fixture-") as tmp:
        root = Path(tmp)
        (root / "out").mkdir()
        (root / "package.json").write_text('{"type":"module"}', "utf8")
        (root / "vitest.config.mjs").write_text("export default {};", "utf8")
        ms = 1840000000000
        (root / "points-exp_jump.json").write_text(json.dumps({"UTC": [ms]}), "utf8")
        source = root / "delay.js"
        poll = (
            "export function schedule(cb,delay) { const start=CLOCK.now(); const handle=setInterval(()=>{"
            "if(CLOCK.now()-start>=delay){ clearInterval(handle); cb(); } },1); }"
        )
        source.write_text(poll.replace("CLOCK", "Date"), "utf8")
        (root / "exp_jump.adapter.js").write_text(
            "import {schedule} from './delay.js'; export async function run(ctx){"
            "return {clock_jumps:await ctx.clockJumps(schedule)}; }",
            "utf8",
        )
        (root / "sweep.test.js").write_text(S.harness_code("exp_jump", "vitest"), "utf8")

        def run(name: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                ["node", str(VITEST), "run", name, "--configLoader", "runner"],
                cwd=root,
                env={**os.environ, "TW_DIR": str(root), "TW_TZ": "UTC", "TZ": "UTC"},
                capture_output=True,
                text=True,
                encoding="utf8",
                errors="replace",
                timeout=60,
            )

        result = run("sweep.test.js")
        assert result.returncode == 0, result.stdout + result.stderr
        records = json.loads((root / "out/exp_jump__UTC.json").read_text("utf8"))
        assert records[0]["r0"] == records[0]["r1"] == {"clock_jumps": {"forward": [5], "backward": []}}
        rule = InvariantUse(id="elapsed_clock_jump", reason="relative duration")
        violations = S.check({"UTC": records}, [rule])
        assert {v.failure_kind for v in violations} == {"forward", "backward"}
        for v in violations:
            (root / f"reg-{v.failure_kind}.test.js").write_text(
                S.regression_code(exp_id="exp_jump", runner="vitest", v=v, title=v.detail, target="fixture"), "utf8"
            )
        result = run("reg-")
        assert result.returncode == 1 and "2 failed" in result.stdout, result.stdout + result.stderr
        source.write_text(poll.replace("CLOCK", "performance"), "utf8")
        result = run("reg-")
        assert result.returncode == 0 and "2 passed" in result.stdout, result.stdout + result.stderr
        source.write_text("export function schedule(cb, delay) { setTimeout(cb, delay + 1); }", "utf8")
        result = run("sweep.test.js")
        assert result.returncode != 0 and "Unshifted timer must fire once at 10 ms" in result.stdout + result.stderr
