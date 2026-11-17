"""Controlled execution: clock points, the JS sweep harness, the invariant oracles and generated regression tests.

The split that makes TimeWraith a bug hunter rather than a code writer:
- Pumpkin Mechanic (LLM) writes only an *adapter*: how to call the code and which output fields to read.
- This module (code) picks the clock points, runs nothing itself, and decides pass or fail with fixed invariants.
- Regression tests are generated from the violated invariant, not written by an LLM.
Every DST point comes from the IANA database (zoneinfo).
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .models import InvariantId, InvariantUse, OutputField, Violation

SWEEP_ZONES = [
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Australia/Sydney",
    "Australia/Lord_Howe",
    "Pacific/Auckland",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
]
BASELINE_ZONES = ["UTC", "America/New_York"]
YEARS = (2024, 2025, 2026)

# id -> (required output field, statement, exceptions). Shown to Pumpkin Mechanic and Raven Archivist.
INVARIANTS: dict[str, tuple[OutputField | None, str, str]] = {
    "well_formed": (None, "run() returns without throwing and no output field is NaN or an Invalid Date.", "None."),
    "deterministic": (
        None,
        "Two calls at the same instant and zone return the same output.",
        "Code that intentionally uses randomness or real elapsed time.",
    ),
    "local_date_matches": (
        "date",
        "`date` (YYYY-MM-DD) equals the calendar date of `now` in the process time zone.",
        "Functions documented to use a fixed reference zone such as UTC.",
    ),
    "instant_zone_independent": (
        "instant",
        "For the same `now`, `instant` is identical in every process time zone.",
        "Values defined in local wall-clock time, such as 'next local 09:00'. An adapter that passes `ctx.tz` into "
        "the code makes the zone an input, so a zone-dependent instant is expected; code drops this invariant then. "
        "To test it, pass a fixed zone literal or none, and let only the process zone vary.",
    ),
    "flag_monotonic": (
        "flag",
        "With fixed inputs, `flag` changes at most once as `now` moves forward "
        "(for example: once expired, always expired).",
        "Recurring windows such as opening hours that legitimately toggle.",
    ),
    "next_after_now": (
        "next",
        "`next` is strictly after `now`, never moves backwards as `now` advances, and is at "
        "most max_gap_ms after `now` when max_gap_ms is set.",
        "Wall-clock schedules (cron-like 'fire at local time') may skip a local time that does not exist in a "
        "DST gap, or fire a repeated local time only once in a DST overlap, so the gap to the next run can grow "
        "by the transition. This is intended when the repository's tests, docs or comments say so.",
    ),
}
ALWAYS = ["well_formed", "deterministic"]

# `ctx.tz`, `ctx["tz"]`, or `tz` destructured from ctx (in the parameter list or a declaration).
_ZONE_INPUT = re.compile(
    r"\bctx\s*(?:\?\.|\.)\s*tz\b|\bctx\s*\[\s*['\"]tz['\"]\s*\]"
    r"|\brun\s*\(\s*\{[^}]*\btz\b[^}]*\}|\{[^{}]*\btz\b[^{}]*\}\s*=\s*ctx\b"
)


def passes_zone(adapter_code: str) -> bool:
    """True when the adapter hands the sweep zone to the code under test. Then the zone is an input, and an
    instant that depends on it is expected, so `instant_zone_independent` cannot tell a bug from intended output."""
    return bool(_ZONE_INPUT.search(adapter_code))


ORDER = list(INVARIANTS)


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def iso(ms: int | float) -> str:
    return datetime.fromtimestamp(ms / 1000, UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def local_str(ms: int | float, zone: str) -> str:
    return datetime.fromtimestamp(ms / 1000, ZoneInfo(zone)).isoformat(timespec="milliseconds")


def parse_instant(s: str) -> int | None:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None or not 2000 <= dt.year <= 2100:
        return None
    return _ms(dt)


def dst_transitions(zone: str, year: int) -> list[datetime]:
    """UTC instants where the zone's UTC offset changes during `year`: hourly scan, then minute refinement."""
    tz = ZoneInfo(zone)
    out: list[datetime] = []
    t = datetime(year, 1, 1, tzinfo=UTC)
    end = datetime(year + 1, 1, 1, tzinfo=UTC)
    prev = t.astimezone(tz).utcoffset()
    while t < end:
        nxt = t + timedelta(hours=1)
        off = nxt.astimezone(tz).utcoffset()
        if off != prev:
            lo = t
            while lo < nxt and lo.astimezone(tz).utcoffset() == prev:
                lo += timedelta(minutes=1)
            out.append(lo)
            prev = off
        t = nxt
    return out


def situation(zone: str, instant_ms: int, window_ms: int = 6 * 3_600_000) -> str | None:
    """ "fall-back" or "spring-forward" when a DST transition in `zone` is within `window_ms` of the instant."""
    tz = ZoneInfo(zone)
    at = datetime.fromtimestamp(instant_ms / 1000, UTC)
    for tr in dst_transitions(zone, at.year):
        if abs(_ms(tr) - instant_ms) <= window_ms:
            before = (tr - timedelta(minutes=1)).astimezone(tz).utcoffset() or timedelta(0)
            after = tr.astimezone(tz).utcoffset() or timedelta(0)
            return "fall-back" if after < before else "spring-forward"
    return None


def zone_points(zone: str, anchors: list[int]) -> set[int]:
    tz = ZoneInfo(zone)
    pts: set[int] = set()
    for y in YEARS:
        for tr in dst_transitions(zone, y):
            base = _ms(tr)
            pts.update(base + d for d in (-3_600_000, -60_000, -1, 0, 1, 60_000, 1_800_000, 3_600_000))
        for m in range(1, 13):
            nxt = datetime(y + 1 if m == 12 else y, m % 12 + 1, 1, tzinfo=tz)
            pts.update((_ms(nxt) - 1, _ms(nxt), _ms(datetime(y, m, 15, 12, tzinfo=tz))))
    for mo, d, h, mi, s, us in (
        (2, 28, 23, 59, 59, 999_000),
        (2, 29, 0, 0, 0, 0),
        (2, 29, 12, 0, 0, 0),
        (3, 1, 0, 0, 0, 0),
    ):
        pts.add(_ms(datetime(2024, mo, d, h, mi, s, us, tzinfo=tz)))
    for a in anchors:
        pts.update(a + d for d in (-60_000, -1000, -1, 0, 1, 1000, 60_000))
    return pts


def shared_points() -> set[int]:
    """Instants present in every zone, so cross-zone invariants can compare like with like."""
    pts: set[int] = set()
    for zone in SWEEP_ZONES:
        for tr in dst_transitions(zone, 2026):
            pts.update((_ms(tr), _ms(tr) + 60_000))
    for m in range(1, 13):
        b = _ms(datetime(2025, m, 1, tzinfo=UTC))
        pts.update((b - 1, b))
    return pts


def build_points(anchors: list[int]) -> dict[str, list[int]]:
    shared = shared_points()
    return {z: sorted(zone_points(z, anchors) | shared) for z in SWEEP_ZONES}


def baseline_points() -> dict[str, list[int]]:
    pts = [_ms(datetime(2025, 6, 11, 12, tzinfo=UTC)), _ms(datetime(2025, 1, 15, 9, tzinfo=UTC))]
    return {z: pts for z in BASELINE_ZONES}


# ---------- JavaScript ----------

_NORM_JS = r"""
function twMs(x) {
  if (x === null || x === undefined) return null;
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? 'invalid' : x.getTime();
  if (typeof x === 'number') return Number.isFinite(x) ? x : 'invalid';
  if (typeof x === 'string') { const p = Date.parse(x); return Number.isNaN(p) ? 'invalid' : p; }
  const n = Number(x && typeof x.valueOf === 'function' ? x.valueOf() : NaN);
  return Number.isFinite(n) ? n : 'invalid';
}
function twNorm(v) {
  const o = {};
  v = v || {};
  if ('instant' in v) o.instant = twMs(v.instant);
  if ('next' in v) o.next = twMs(v.next);
  if ('flag' in v) o.flag = Boolean(v.flag);
  if ('date' in v) o.date = v.date === null || v.date === undefined ? null : String(v.date);
  if ('value' in v) {
    try { o.value = String(JSON.stringify(v.value)).slice(0, 300); } catch (e) { o.value = 'unserializable'; }
  }
  return o;
}
"""


def _head(runner: str, exp_id: str, with_fs: bool) -> str:
    if runner == "vitest":
        fs = "import * as twFs from 'node:fs';\n" if with_fs else ""
        return f"import {{ test, expect, vi }} from 'vitest';\n{fs}import * as twMod from './{exp_id}.adapter';\n"
    fs = "const twFs = require('node:fs');\n" if with_fs else ""
    return f"{fs}const twMod = require('./{exp_id}.adapter');\n"


def _timers(runner: str) -> str:
    return "vi" if runner == "vitest" else "jest"


def harness_code(exp_id: str, runner: str) -> str:
    """Generated sweep test. It records outputs only; it never asserts. A no-op unless TW_DIR is set."""
    t = _timers(runner)
    return (
        "// @ts-nocheck\n// TimeWraith sweep harness (generated). Records outputs; the oracles run in the backend.\n"
        + _head(runner, exp_id, True)
        + _NORM_JS
        + f"""
const TW_ID = {json.dumps(exp_id)};
const twA = twMod && twMod.default && typeof twMod.default.run === 'function' ? twMod.default : twMod;
test('timewraith sweep ' + TW_ID, async () => {{
  const dir = process.env.TW_DIR;
  if (!dir) return;
  const zone = process.env.TW_TZ || 'UTC';
  const set = process.env.TW_SET || 'points';
  const points = JSON.parse(twFs.readFileSync(dir + '/' + set + '-' + TW_ID + '.json', 'utf8'))[zone] || [];
  const out = [];
  {t}.useFakeTimers();
  try {{
    for (const ms of points) {{
      const rec = {{ t: ms }};
      for (const k of [0, 1]) {{
        {t}.setSystemTime(new Date(ms));
        try {{ rec['r' + k] = twNorm(await twA.run({{ now: new Date(ms), tz: zone }})); }}
        catch (e) {{ rec['r' + k] = {{ error: String((e && e.message) || e).slice(0, 300) }}; }}
      }}
      out.push(rec);
    }}
  }} finally {{
    {t}.useRealTimers();
  }}
  twFs.writeFileSync(dir + '/out/' + TW_ID + '__' + zone.replace(/\\//g, '_') + '.json', JSON.stringify(out));
}}, 120000);
"""
    )


PROBE_OUT = ".tw/probe/out.json"
PROBE_TEST = "__tw__/probe.tw.test"  # + .ts or .js


def probe_code(runner: str, body: str) -> str:
    """A probe: an agent's short script, run as a test file so the repository's TypeScript transform applies.
    `load('src/x')` loads a repository file (path from the repository root), `print(...)` records output and
    `check(cond, msg)` marks the bug as present. The clock is frozen at TW_NOW in zone TZ. Only the result file
    is writable: the sandbox mounts the repository read-only for probes."""
    t = _timers(runner)
    # The probe file is PROBE_TEST at the repository root, so '../' + path reaches a repository file.
    if runner == "vitest":
        head = "import { test, vi } from 'vitest';\nimport * as twFs from 'node:fs';\n"
        load = "return await import('../' + String(p).replace(/^\\/+/, ''));"
    else:
        head = "const twFs = require('node:fs');\n"
        load = "return require('../' + String(p).replace(/^\\/+/, ''));"
    return (
        "// @ts-nocheck\n// TimeWraith probe (agent-written body, generated wrapper).\n"
        + head
        + f"""
const twOut = [];
let twStatus = 'passed';
class TwCheck extends Error {{}}
function twShow(x) {{
  if (typeof x === 'string') return x;
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? 'Invalid Date' : x.toISOString() + ' (' + x.getTime() + ')';
  try {{ return JSON.stringify(x, (k, v) => (v instanceof Date ? v.toISOString() : v)); }}
  catch (e) {{ return String(x); }}
}}
function print(...a) {{ if (twOut.length < 200) twOut.push(a.map(twShow).join(' ').slice(0, 500)); }}
function check(cond, msg) {{ if (!cond) throw new TwCheck(String(msg || 'check failed')); }}
async function load(p) {{ {load} }}
test('timewraith probe', async () => {{
  const now = process.env.TW_NOW ? new Date(Number(process.env.TW_NOW)) : null;
  if (now) {{ {t}.useFakeTimers(); {t}.setSystemTime(now); }}
  try {{
    await (async () => {{
{body}
    }})();
  }} catch (e) {{
    twStatus = e instanceof TwCheck ? 'check_failed' : 'error';
    const text = e instanceof TwCheck ? e.message : String((e && e.stack) || e).split('\\n').slice(0, 6).join('\\n');
    print((e instanceof TwCheck ? 'CHECK FAILED: ' : 'ERROR: ') + text);
  }} finally {{
    if (now) {t}.useRealTimers();
    twFs.writeFileSync('/work/{PROBE_OUT}', JSON.stringify({{ status: twStatus, out: twOut }}));
  }}
}}, 60000);
"""
    )


def reproduction_test_code(
    *, runner: str, cases: list[tuple[str, str, int]], zone: str, target: str, prefix: str
) -> str:
    """Raven's reproduction (and her user-level check) as a normal regression test: one test per (title, body,
    frozen instant), with `check` as an assertion, so it fails with an assertion on the original code and passes
    only once every case is fixed. `prefix` leads from the test file's folder to the repository root."""
    t = _timers(runner)
    if runner == "vitest":
        head = "import { test, expect, vi } from 'vitest';\n"
        load = f"return await import({json.dumps(prefix)} + String(p).replace(/^\\/+/, ''));"
    else:
        head = ""
        load = f"return require({json.dumps(prefix)} + String(p).replace(/^\\/+/, ''));"
    tests = "".join(
        f"""
test({json.dumps(title[:100])}, async () => {{
  {t}.useFakeTimers();
  {t}.setSystemTime(new Date({int(ms)}));
  const now = new Date({int(ms)});  // the same `now` the probe had
  try {{
{body}
  }} finally {{
    {t}.useRealTimers();
  }}
}}, 60000);
"""
        for title, body, ms in cases
    )
    when = ", ".join(iso(ms) for _, _, ms in cases)
    return (
        "// @ts-nocheck\n"
        "// TimeWraith regression test: Raven Archivist's reproduction, rerun by code before it was accepted.\n"
        f"// Failed on {target} at {when}. Run with TZ={zone}.\n"
        + head
        + f"""
function print() {{}}
function check(cond, msg) {{
  const rule = String(msg || 'check');
  expect({{ rule, holds: Boolean(cond) }}).toEqual({{ rule, holds: true }});
}}
async function load(p) {{ {load} }}
"""
        + tests
    )


def regression_code(*, exp_id: str, runner: str, v: Violation, title: str, target: str) -> str:
    """A normal failing test for one violation, generated from the invariant (no LLM)."""
    t = _timers(runner)
    t_ms = parse_instant(v.instant) or 0
    ctx = v.context_ms or [t_ms]
    if v.invariant == "well_formed":
        body = (
            f"let o; try {{ o = await twAt({t_ms}); }} catch (e) {{ o = {{ error: String(e) }}; }}\n"
            "    expect(o.error ?? null).toBeNull();\n"
            "    expect(Object.keys(o).filter((k) => o[k] === 'invalid')).toEqual([]);"
        )
    elif v.invariant == "deterministic":
        body = f"const a = await twAt({t_ms});\n    const b = await twAt({t_ms});\n    expect(b).toEqual(a);"
    elif v.invariant == "local_date_matches":
        want = json.dumps(v.expected)
        body = f"const o = await twAt({t_ms});\n    expect(String(o.date ?? '').slice(0, 10)).toBe({want});"
    elif v.invariant == "instant_zone_independent":
        body = f"const o = await twAt({t_ms});\n    expect(o.instant).toBe({v.expected});  // result in UTC"
    elif v.invariant == "flag_monotonic":
        body = (
            f"const f = [];\n    for (const ms of {json.dumps(sorted(ctx))}) f.push((await twAt(ms)).flag);\n"
            "    let changes = 0;\n    for (let i = 1; i < f.length; i++) if (f[i] !== f[i - 1]) changes++;\n"
            "    expect(changes).toBeLessThanOrEqual(1);"
        )
    else:  # next_after_now
        lines = [f"const o = await twAt({t_ms});", f"expect(o.next).toBeGreaterThan({t_ms});"]
        if len(ctx) > 1:
            lines += [f"const p = await twAt({min(ctx)});", "expect(o.next).toBeGreaterThanOrEqual(p.next);"]
        if v.expected:
            lines.append(f"expect(o.next - {t_ms}).toBeLessThanOrEqual({v.expected});")
        body = "\n    ".join(lines)
    return (
        "// @ts-nocheck\n"
        f"// TimeWraith regression test, generated from invariant `{v.invariant}` (not written by an LLM).\n"
        f"// Failed on {target} at {v.instant} ({v.local}). Run with TZ={v.zone}.\n"
        + _head(runner, exp_id, False)
        + _NORM_JS
        + f"""
const twA = twMod && twMod.default && typeof twMod.default.run === 'function' ? twMod.default : twMod;
const TW_ZONE = process.env.TZ || {json.dumps(v.zone)};
async function twAt(ms) {{
  {t}.setSystemTime(new Date(ms));
  return twNorm(await twA.run({{ now: new Date(ms), tz: TW_ZONE }}));
}}
test({json.dumps(title[:100])}, async () => {{
  {t}.useFakeTimers();
  try {{
    {body}
  }} finally {{
    {t}.useRealTimers();
  }}
}});
"""
    )


# ---------- oracles ----------

Outputs = dict[str, list[dict[str, Any]]]
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def baseline_problems(outputs: Outputs, fields: list[OutputField]) -> list[str]:
    problems: list[str] = []
    for zone, recs in outputs.items():
        for r in recs:
            a = r.get("r0") or {}
            if "error" in a:
                problems.append(f"{zone} {iso(r['t'])}: run() threw: {a['error']}")
                continue
            missing = [f for f in fields if f not in a]
            if missing:
                problems.append(f"{zone}: run() did not return {', '.join(missing)}")
            bad = [k for k, val in a.items() if val == "invalid"]
            if bad:
                problems.append(f"{zone} {iso(r['t'])}: invalid {', '.join(bad)} at an ordinary instant")
            if "date" in fields and a.get("date") is not None and not _DATE.match(str(a["date"])):
                problems.append(f"{zone}: date must start with YYYY-MM-DD, got {str(a['date'])[:30]!r}")
    if not any(outputs.values()):
        problems.append("No output: the runner did not collect or could not load the harness")
    return sorted(set(problems))[:8]


def baseline_violations(outputs: Outputs, invs: list[InvariantUse]) -> dict[str, str]:
    """Rules broken at ordinary baseline instants (no DST change, no month end, mid-day): invariant id -> detail.
    A rule that fails there almost always means the adapter's field does not mean what the rule says (such as
    `date` set to the result of addDay instead of today's date); real time bugs live at the edges."""
    out: dict[str, str] = {}
    for v in check(outputs, invs):
        if v.invariant not in ALWAYS and v.invariant not in out:
            out[v.invariant] = f"{v.zone} {v.local}: {v.detail}"
    return out


def check(outputs: Outputs, invs: list[InvariantUse]) -> list[Violation]:
    """Apply the declared invariants (plus the always-on ones). First violation per (invariant, zone)."""
    ids = {i.id for i in invs} | set(ALWAYS)
    gap = next((i.max_gap_ms for i in invs if i.id == "next_after_now" and i.max_gap_ms), None)
    found: dict[tuple[str, str], Violation] = {}

    def add(
        inv: InvariantId, zone: str, t: int, detail: str, ctx: list[int] | None = None, expected: str | None = None
    ) -> None:
        key = (inv, zone)
        if key in found:
            found[key].count += 1
            return
        found[key] = Violation(
            invariant=inv,
            zone=zone,
            instant=iso(t),
            local=local_str(t, zone),
            detail=detail[:300],
            context_ms=ctx or [t],
            expected=expected,
        )

    for zone, recs in outputs.items():
        prev_flag: bool | None = None
        prev_t = 0
        first_change: list[int] = []
        changes = 0
        prev_next: float | None = None
        prev_next_t = 0
        for r in sorted(recs, key=lambda x: x["t"]):
            t = int(r["t"])
            a: dict[str, Any] = r.get("r0") or {}
            b: dict[str, Any] = r.get("r1") or {}
            if "error" in a:
                add("well_formed", zone, t, f"run() threw: {a['error']}")
                continue
            bad = [k for k, val in a.items() if val == "invalid"]
            if bad:
                add("well_formed", zone, t, f"invalid {', '.join(bad)}")
                continue
            if a != b:
                add("deterministic", zone, t, f"first call {json.dumps(a)[:120]}, second call {json.dumps(b)[:120]}")
            if "local_date_matches" in ids and a.get("date") is not None:
                want = datetime.fromtimestamp(t / 1000, ZoneInfo(zone)).date().isoformat()
                got = str(a["date"])[:10]
                if got != want:
                    add(
                        "local_date_matches",
                        zone,
                        t,
                        f"date {got}, but the calendar date in {zone} is {want}",
                        expected=want,
                    )
            if "flag_monotonic" in ids and isinstance(a.get("flag"), bool):
                if prev_flag is not None and a["flag"] != prev_flag:
                    changes += 1
                    if changes == 1:
                        first_change = [prev_t, t]
                    elif changes == 2:
                        add(
                            "flag_monotonic",
                            zone,
                            t,
                            f"flag changed back to {a['flag']} (second change)",
                            ctx=[*first_change, t],
                        )
                prev_flag = a["flag"]
            if "next_after_now" in ids and isinstance(a.get("next"), int | float):
                n = float(a["next"])
                if n <= t:
                    add("next_after_now", zone, t, f"next {iso(n)} is not after now")
                elif prev_next is not None and n < prev_next:
                    add(
                        "next_after_now",
                        zone,
                        t,
                        f"next moved backwards from {iso(prev_next)} to {iso(n)}",
                        ctx=[prev_next_t, t],
                    )
                elif gap and n - t > gap:
                    add(
                        "next_after_now", zone, t, f"next is {int(n - t)} ms after now (limit {gap})", expected=str(gap)
                    )
                prev_next, prev_next_t = n, t
            prev_t = t
    if "instant_zone_independent" in ids:
        ref = {int(r["t"]): (r.get("r0") or {}).get("instant") for r in outputs.get("UTC", [])}
        for zone, recs in outputs.items():
            if zone == "UTC":
                continue
            for r in sorted(recs, key=lambda x: x["t"]):
                t = int(r["t"])
                seen, base = (r.get("r0") or {}).get("instant"), ref.get(t)
                if isinstance(seen, int | float) and isinstance(base, int | float) and seen != base:
                    add(
                        "instant_zone_independent",
                        zone,
                        t,
                        f"instant {iso(seen)} differs from the UTC result {iso(base)}",
                        expected=str(int(base)),
                    )
    return sorted(found.values(), key=lambda v: (ORDER.index(v.invariant), v.zone))


def catalog_text() -> str:
    return "\n".join(f"- {k} (needs field: {f or 'none'}): {s} Exceptions: {e}" for k, (f, s, e) in INVARIANTS.items())
