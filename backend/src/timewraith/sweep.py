"""Controlled execution: clock points, the JS sweep harness, the invariant oracles and generated regression tests.

The split that makes TimeWraith a bug hunter rather than a code writer:
- Pumpkin Mechanic (LLM) writes only an *adapter*: how to call the code and which output fields to read.
- This module (code) picks the clock points, runs nothing itself, and decides pass or fail with fixed invariants.
- Regression tests are generated from the violated invariant, not written by an LLM.
Every DST point comes from the IANA database (zoneinfo).
"""

from __future__ import annotations

import calendar
import json
import re
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

from .models import InvariantId, InvariantUse, OutputField, SweepWindow, Violation

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
    "calendar_contract": (
        "calendar_cases",
        "Each named case returns the expected calendar result for its specific inputs.",
        "Inputs outside the documented contract, or expectations inferred from the implementation under test.",
    ),
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
    "elapsed_clock_jump": (
        "clock_jumps",
        "A relative 10 ms timeout keeps its elapsed-time deadline when wall time changes by an hour. "
        "Return clock_jumps from await ctx.clockJumps(schedule), using the public API in schedule(notify, delayMs). "
        "Cite the elapsed-time contract.",
        "Absolute dates, calendar alarms, jittered timers, and wall-clock deadlines.",
    ),
    "expiry_deadline": (
        "expiry_trace",
        "An item is valid 1 ms before its deadline and expired 1 ms after. Return expiry_trace "
        "from await ctx.expiryTrace(create, isExpired). create(deadlineMs) sets a fixed deadline via the real API; "
        "isExpired(item) returns a boolean. Set expired_at_deadline only when a cited test or doc explicitly states "
        "the equality policy. Otherwise leave it null.",
        "Sliding expiry, grace periods, and coarse-resolution APIs.",
    ),
    "timeout_delivery": (
        "timeout_trace",
        "A one-shot timer due at 10 ms fires once, at 10 ms under the virtual clock. "
        "Return timeout_trace from await ctx.timerTrace(schedule), where schedule(notify, delayMs) uses the "
        "repository API.",
        "Timers with documented jitter, coalescing, or variable retry delays.",
    ),
    "interval_delivery": (
        "interval_trace",
        "A fixed 10 ms interval fires at 10, 20 and 30 ms under the virtual clock. "
        "Return interval_trace from await ctx.timerTrace(schedule).",
        "Immediate-first, jittered, or backoff schedules.",
    ),
    "retry_cancelled": (
        "after_cancel",
        "No callback fires after cancelling a pending one-shot retry. Return after_cancel from "
        "await ctx.cancelledRetry((notify, delayMs) => { /* schedule through the public API; return cancel fn */ }). "
        "Each call must create a fresh retry. Cite its cancellation contract.",
        "APIs that only cancel future retries after the current callback has started.",
    ),
    "next_after_now": (
        "next",
        "`next` is strictly after `now`, never moves backwards as `now` advances, and is at "
        "most max_gap_ms after `now` when max_gap_ms is set.",
        "Wall-clock schedules (cron-like 'fire at local time') may skip a local time that does not exist in a "
        "DST gap, or fire a repeated local time only once in a DST overlap, so the gap to the next run can grow "
        "by the transition. This is intended when the repository's tests, docs or comments say so.",
    ),
    "next_clock_independent": (
        "next_early",
        "For a function that takes an explicit start instant (getNextDateFrom(start), nextAfter(date)), the answer "
        "for that start does not depend on what the real clock says. Return next_early from the same call that gives "
        "`next`, made inside `await ctx.atClock(-30 * 86400000, () => call(ctx.now))`, which sets the clock 30 days "
        "earlier for that call only. It must be strictly after `now` and equal to `next` (the call with the clock at "
        "`now`). Hint: libraries that resolve a repeated or missing local hour by the offset at the current time "
        "answer differently when the clock is before a DST change.",
        "Functions that are relative to the current time by design (nextRun(), in 5 minutes, a start in the past "
        "that is rejected or rewritten to now), and callers that do not take a start instant.",
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


@lru_cache(maxsize=512)
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


def future_window(reference: datetime) -> SweepWindow:
    start = reference.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    year = start.year + 5
    end = start.replace(year=year, day=min(start.day, calendar.monthrange(year, start.month)[1]))
    return SweepWindow(start_ms=_ms(start), end_ms=_ms(end))


def zone_points(zone: str, anchors: list[int], years: tuple[int, ...] = YEARS) -> set[int]:
    tz = ZoneInfo(zone)
    pts: set[int] = set()
    for y in years:
        for tr in dst_transitions(zone, y):
            base = _ms(tr)
            pts.update(base + d for d in (-3_600_000, -60_000, -1, 0, 1, 60_000, 1_800_000, 3_600_000))
        for m in range(1, 13):
            nxt = datetime(y + 1 if m == 12 else y, m % 12 + 1, 1, tzinfo=tz)
            pts.update((_ms(nxt) - 1, _ms(nxt), _ms(datetime(y, m, 15, 12, tzinfo=tz))))
    for year in years:
        if calendar.isleap(year):
            for mo, d, h, mi, s, us in (
                (2, 28, 23, 59, 59, 999_000),
                (2, 29, 0, 0, 0, 0),
                (2, 29, 12, 0, 0, 0),
                (3, 1, 0, 0, 0, 0),
            ):
                pts.add(_ms(datetime(year, mo, d, h, mi, s, us, tzinfo=tz)))
    for a in anchors:
        pts.update(a + d for d in (-60_000, -1000, -1, 0, 1, 1000, 60_000))
    return pts


def shared_points(window: SweepWindow | None = None) -> set[int]:
    """Instants present in every zone, so cross-zone invariants can compare like with like."""
    pts: set[int] = set()
    for zone in SWEEP_ZONES:
        for year in window_years(window) if window else (2026,):
            for tr in dst_transitions(zone, year):
                pts.update((_ms(tr), _ms(tr) + 60_000))
    for year in window_years(window) if window else (2025,):
        for m in range(1, 13):
            b = _ms(datetime(year, m, 1, tzinfo=UTC))
            pts.update((b - 1, b))
    return pts


def thin_points(points: dict[str, list[int]], near_ms: int = 2 * 3_600_000) -> dict[str, list[int]]:
    """A smaller point set for a function too slow to sweep in full: in each zone only the instants within `near_ms`
    of one of its DST changes, which is where the time bugs are. A zone with no DST change keeps a thin even spread."""
    out: dict[str, list[int]] = {}
    for zone, times in points.items():
        if not times:
            out[zone] = []
            continue
        years = range(
            datetime.fromtimestamp(min(times) / 1000, UTC).year, datetime.fromtimestamp(max(times) / 1000, UTC).year + 1
        )
        changes = [_ms(tr) for y in years for tr in dst_transitions(zone, y)]
        near = [t for t in times if any(abs(t - c) <= near_ms for c in changes)]
        out[zone] = near if changes else times[:: max(1, -(-len(times) // 24))]
    return out


def window_years(window: SweepWindow) -> tuple[int, ...]:
    start = datetime.fromtimestamp(window.start_ms / 1000, UTC)
    end = datetime.fromtimestamp(window.end_ms / 1000, UTC)
    return tuple(range(start.year, end.year + 1))


def clock_jump_fits(window: SweepWindow, start_ms: int) -> bool:
    return window.contains(start_ms + 4 - 3_600_000) and window.contains(start_ms + 31 + 3_600_000)


def build_points(anchors: list[int], window: SweepWindow | None = None) -> dict[str, list[int]]:
    shared = shared_points(window)
    years = window_years(window) if window else YEARS
    ordinary = baseline_points(window) if window else {}
    result = {}
    for zone in SWEEP_ZONES:
        points = zone_points(zone, anchors, years) | shared | set(ordinary.get(zone, []))
        result[zone] = sorted(ms for ms in points if window is None or window.contains(ms))
    return result


def baseline_points(window: SweepWindow | None = None) -> dict[str, list[int]]:
    if window:
        ordinary = (_ms(datetime(year, month, 15, 12, tzinfo=UTC)) for year in window_years(window) for month in (1, 6))
        pts = [ms for ms in ordinary if window.contains(ms)][:2]
    else:
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
  if ('next_early' in v) o.next_early = twMs(v.next_early);
  if ('clock_jumps' in v) {
    const traces = v.clock_jumps;
    const valid = traces && ['forward', 'backward'].every(key => Array.isArray(traces[key])
      && traces[key].length <= 8 && traces[key].every(Number.isSafeInteger));
    o.clock_jumps = valid ? { forward: traces.forward, backward: traces.backward } : 'invalid';
  }
  if ('expiry_trace' in v) {
    const a = v.expiry_trace;
    o.expiry_trace = Array.isArray(a) && a.length === 3 && [0, 1, 2].every(i => typeof a[i] === 'boolean')
      ? a : 'invalid';
  }
  for (const key of ['timeout_trace', 'interval_trace']) {
    if (key in v) {
      const trace = v[key];
      o[key] = Array.isArray(trace) && trace.length <= 8 && trace.every(Number.isSafeInteger) ? trace : 'invalid';
    }
  }
  if ('after_cancel' in v) {
    o.after_cancel = Number.isSafeInteger(v.after_cancel) && v.after_cancel >= 0 ? v.after_cancel : 'invalid';
  }
  if ('flag' in v) o.flag = Boolean(v.flag);
  if ('date' in v) o.date = v.date === null || v.date === undefined ? null : String(v.date);
  if ('calendar_cases' in v) {
    const cases = v.calendar_cases;
    const scalar = x => x === null || typeof x === 'boolean' || Number.isSafeInteger(x)
      || (typeof x === 'string' && x.length <= 160);
    const valid = Array.isArray(cases) && cases.length > 0 && cases.length <= 8 && cases.every(c =>
      c && typeof c.name === 'string' && /^[a-z0-9_-]{1,48}$/.test(c.name)
      && scalar(c.actual) && scalar(c.expected))
      && new Set(cases.map(c => c.name)).size === cases.length;
    o.calendar_cases = valid ? cases.map(({ name, actual, expected }) => ({ name, actual, expected })) : 'invalid';
  }
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


def _retry_helpers(runner: str) -> str:
    t = _timers(runner)
    return f"""
class RetrySetupError extends Error {{}}
async function clockJumpTrace(schedule, direction) {{
  if (typeof {t}.advanceTimersByTimeAsync !== 'function' || typeof globalThis.performance?.now !== 'function')
    throw new RetrySetupError('Virtual elapsed clock unavailable');
  const shifts = {{ none: 0, forward: 3600000, backward: -3600000 }};
  if (!Object.hasOwn(shifts, direction)) throw new RetrySetupError('Unknown wall clock shift');
  const start = Date.now();
  const origin = performance.now();
  const elapsed = () => performance.now() - origin;
  const trace = [];
  try {{
    schedule(() => {{ if (trace.length < 8) trace.push(elapsed()); }}, 10);
    await {t}.advanceTimersByTimeAsync(4);
    if (direction !== 'none') {t}.setSystemTime(start + 4 + shifts[direction]);
    if (elapsed() !== 4 || Date.now() !== start + 4 + shifts[direction])
      throw new RetrySetupError('Runner cannot independently control wall and elapsed time');
    await {t}.advanceTimersByTimeAsync(27);
    if (elapsed() !== 31) throw new RetrySetupError('Elapsed clock did not advance as requested');
    return trace;
  }} finally {{
    {t}.clearAllTimers();
    {t}.setSystemTime(start);
  }}
}}
async function clockJumps(schedule) {{
  const control = await clockJumpTrace(schedule, 'none');
  if (control.length !== 1 || control[0] !== 10) throw new RetrySetupError('Unshifted timer must fire once at 10 ms');
  return {{ forward: await clockJumpTrace(schedule, 'forward'), backward: await clockJumpTrace(schedule, 'backward') }};
}}
async function atClock(shiftMs, fn) {{
  const real = Date.now();
  try {{
    {t}.setSystemTime(real + shiftMs);
    return await fn();
  }} finally {{
    {t}.setSystemTime(real);
  }}
}}
async function expiryTrace(create, isExpired) {{
  if (typeof {t}.advanceTimersByTimeAsync !== 'function') throw new RetrySetupError('Async fake timers unavailable');
  const start = Date.now();
  try {{
    const item = await create(start + 1000);
    const states = [];
    for (const step of [999, 1, 1]) {{
      await {t}.advanceTimersByTimeAsync(step);
      const expired = await isExpired(item);
      if (typeof expired !== 'boolean') throw new RetrySetupError('Expiry check must return a boolean');
      states.push(expired);
    }}
    return states;
  }} finally {{
    {t}.clearAllTimers();
    {t}.setSystemTime(start);
  }}
}}
async function timerTrace(schedule) {{
  if (typeof {t}.advanceTimersByTimeAsync !== 'function') throw new RetrySetupError('Async fake timers unavailable');
  const start = Date.now();
  const trace = [];
  try {{
    schedule(() => {{ if (trace.length < 8) trace.push(Date.now() - start); }}, 10);
    await {t}.advanceTimersByTimeAsync(31);
    return trace;
  }} finally {{
    {t}.clearAllTimers();
    {t}.setSystemTime(start);
  }}
}}
async function retryCalls(schedule, cancel) {{
  if (typeof {t}.advanceTimersByTimeAsync !== 'function') throw new RetrySetupError('Async fake timers unavailable');
  let calls = 0;
  const stop = schedule(() => {{ calls += 1; }}, 10);
  if (typeof stop !== 'function') throw new RetrySetupError('Retry adapter must return a cancellation function');
  await {t}.advanceTimersByTimeAsync(9);
  if (calls !== 0) throw new RetrySetupError('Retry fired before the cancellation step');
  if (cancel) await stop();
  await {t}.advanceTimersByTimeAsync(11);
  return calls;
}}
async function cancelledRetry(schedule) {{
  const start = Date.now();
  try {{
    if (await retryCalls(schedule, false) !== 1) throw new RetrySetupError('Uncancelled retry must fire once');
    {t}.clearAllTimers();
    {t}.setSystemTime(start);
    return await retryCalls(schedule, true);
  }} finally {{
    {t}.clearAllTimers();
    {t}.setSystemTime(start);
  }}
}}
"""


def harness_code(exp_id: str, runner: str) -> str:
    """Generated sweep test. It records outputs only; it never asserts. A no-op unless TW_DIR is set."""
    t = _timers(runner)
    return (
        "// @ts-nocheck\n// TimeWraith sweep harness (generated). Records outputs; the oracles run in the backend.\n"
        + _head(runner, exp_id, True)
        + _NORM_JS
        + _retry_helpers(runner)
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
        const ctx = {{ now: new Date(ms), tz: zone, cancelledRetry, timerTrace, expiryTrace, clockJumps, atClock }};
        try {{ rec['r' + k] = twNorm(await twA.run(ctx)); }}
        catch (e) {{
          if (e instanceof RetrySetupError) throw e;
          rec['r' + k] = {{ error: String((e && e.message) || e).slice(0, 300) }};
        }}
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
        + _retry_helpers(runner)
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
    helpers = ("cancelledRetry", "retryCalls", "timerTrace", "expiryTrace", "clockJumpTrace", "clockJumps", "atClock")
    uses_timers = any(name in body for _, body, _ in cases for name in helpers)
    when = ", ".join(iso(ms) for _, _, ms in cases)
    return (
        "// @ts-nocheck\n"
        "// TimeWraith regression test: Raven Archivist's reproduction, rerun by code before it was accepted.\n"
        f"// Failed on {target} at {when}. Run with TZ={zone}.\n"
        + head
        + (_retry_helpers(runner) if uses_timers else "")
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
    elif v.invariant == "calendar_contract":
        name = json.dumps(v.failure_kind)
        body = (
            f"const o = await twAt({t_ms});\n"
            f"    const example = o.calendar_cases.find(c => c.name === {name});\n"
            f"    expect(example.actual).toEqual({v.expected});"
        )
    elif v.invariant == "local_date_matches":
        want = json.dumps(v.expected)
        body = f"const o = await twAt({t_ms});\n    expect(String(o.date ?? '').slice(0, 10)).toBe({want});"
    elif v.invariant == "instant_zone_independent":
        body = f"const o = await twAt({t_ms});\n    expect(o.instant).toBe({v.expected});  // result in UTC"
    elif v.invariant == "elapsed_clock_jump":
        key = json.dumps(v.failure_kind)
        body = f"const o = await twAt({t_ms});\n    expect(o.clock_jumps[{key}]).toEqual([10]);"
    elif v.invariant == "expiry_deadline":
        index = EXPIRY_STEPS.index(v.failure_kind)
        body = f"const o = await twAt({t_ms});\n    expect(o.expiry_trace[{index}]).toBe({v.expected});"
    elif v.invariant in ("timeout_delivery", "interval_delivery"):
        field, expected = TIMER_DELIVERY[v.invariant]
        body = f"const o = await twAt({t_ms});\n    expect(o.{field}).toEqual({json.dumps(expected)});"
    elif v.invariant == "retry_cancelled":
        body = f"const o = await twAt({t_ms});\n    expect(o.after_cancel).toBe(0);"
    elif v.invariant == "flag_monotonic":
        body = (
            f"const f = [];\n    for (const ms of {json.dumps(sorted(ctx))}) f.push((await twAt(ms)).flag);\n"
            "    let changes = 0;\n    for (let i = 1; i < f.length; i++) if (f[i] !== f[i - 1]) changes++;\n"
            "    expect(changes).toBeLessThanOrEqual(1);"
        )
    elif v.invariant == "next_clock_independent":
        if v.failure_kind == "differs_with_clock":
            body = f"const o = await twAt({t_ms});\n    expect(o.next_early).toBe(o.next);"
        else:
            body = f"const o = await twAt({t_ms});\n    expect(o.next_early).toBeGreaterThan({t_ms});"
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
        + _retry_helpers(runner)
        + f"""
const twA = twMod && twMod.default && typeof twMod.default.run === 'function' ? twMod.default : twMod;
const TW_ZONE = process.env.TZ || {json.dumps(v.zone)};
async function twAt(ms) {{
  {t}.setSystemTime(new Date(ms));
  const ctx = {{ now: new Date(ms), tz: TW_ZONE, cancelledRetry, timerTrace, expiryTrace, clockJumps, atClock }};
  return twNorm(await twA.run(ctx));
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
    The pipeline checks for repository expectations before deciding whether to repair the adapter."""
    out: dict[str, str] = {}
    for v in check(outputs, invs):
        if v.invariant not in ALWAYS and v.invariant not in out:
            out[v.invariant] = f"{v.zone} {v.local}: {v.detail}"
    return out


EXPIRY_STEPS = ("before_deadline", "at_deadline", "after_deadline")

TIMER_DELIVERY: dict[InvariantId, tuple[str, list[int]]] = {
    "timeout_delivery": ("timeout_trace", [10]),
    "interval_delivery": ("interval_trace", [10, 20, 30]),
}


def check(outputs: Outputs, invs: list[InvariantUse]) -> list[Violation]:
    """Keep a representative for each distinct rule failure in each zone."""
    ids = {i.id for i in invs if i.id != "calendar_contract" or i.expectation_ref} | set(ALWAYS)
    gap = next((i.max_gap_ms for i in invs if i.id == "next_after_now" and i.max_gap_ms), None)
    equality = next((i.expired_at_deadline for i in invs if i.id == "expiry_deadline" and i.expectation_ref), None)
    found: dict[tuple[str, str, str], Violation] = {}

    def add(
        inv: InvariantId,
        zone: str,
        t: int,
        detail: str,
        ctx: list[int] | None = None,
        expected: str | None = None,
        *,
        kind: str = "",
    ) -> None:
        key = (inv, zone, kind)
        if key in found:
            found[key].count += 1
            return
        found[key] = Violation(
            failure_kind=kind or inv,
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
                add("well_formed", zone, t, f"run() threw: {a['error']}", kind="exception")
                continue
            bad = [k for k, val in a.items() if val == "invalid"]
            if bad:
                add("well_formed", zone, t, f"invalid {', '.join(bad)}", kind="invalid_" + "_".join(sorted(bad)))
                continue
            if a != b:
                add("deterministic", zone, t, f"first call {json.dumps(a)[:120]}, second call {json.dumps(b)[:120]}")
            if "calendar_contract" in ids and isinstance(a.get("calendar_cases"), list):
                for example in a["calendar_cases"]:
                    actual = json.dumps(example["actual"])
                    expected = json.dumps(example["expected"])
                    if actual != expected:
                        name = example["name"]
                        add(
                            "calendar_contract",
                            zone,
                            t,
                            f"{name}: expected {expected}, observed {actual}",
                            expected=expected,
                            kind=name,
                        )
            if "elapsed_clock_jump" in ids and isinstance(a.get("clock_jumps"), dict):
                for direction in ("forward", "backward"):
                    shifted = a["clock_jumps"][direction]
                    if shifted != [10]:
                        add(
                            "elapsed_clock_jump",
                            zone,
                            t,
                            f"Wall clock moved {direction} one hour at 4 ms elapsed. Unshifted callback: [10] ms; "
                            f"shifted callbacks through 31 ms: {shifted} ms (first eight).",
                            kind=direction,
                        )
            if "expiry_deadline" in ids and isinstance(a.get("expiry_trace"), list):
                states = zip(EXPIRY_STEPS, a["expiry_trace"], (False, equality, True), strict=True)
                for kind, actual, expected_state in states:
                    if expected_state is not None and actual != expected_state:
                        detail = (
                            f"Deadline {iso(t + 1000)}, {kind.replace('_', ' ')}: "
                            f"expected {'expired' if expected_state else 'valid'}, "
                        )
                        add(
                            "expiry_deadline",
                            zone,
                            t,
                            detail + f"observed {'expired' if actual else 'valid'}",
                            expected=json.dumps(expected_state),
                            kind=kind,
                        )
            for rule, (field, expected_times) in TIMER_DELIVERY.items():
                trace = a.get(field)
                if rule in ids and isinstance(trace, list) and trace != expected_times:
                    if len(trace) > len(expected_times) or len(set(trace)) < len(trace):
                        kind = "extra_callback"
                    elif any(observed < due for observed, due in zip(trace, expected_times, strict=False)):
                        kind = "early_callback"
                    elif len(trace) < len(expected_times):
                        kind = "missing_callback"
                    else:
                        kind = "late_callback"
                    add(
                        rule,
                        zone,
                        t,
                        f"Expected callbacks at {expected_times} ms; observed {trace} ms "
                        "during 31 ms of virtual time (first 8 callbacks recorded)",
                        kind=kind,
                    )
            if "retry_cancelled" in ids and isinstance(a.get("after_cancel"), int) and a["after_cancel"] > 0:
                add(
                    "retry_cancelled",
                    zone,
                    t,
                    f"Retry due at 10 ms, cancelled at 9 ms: "
                    f"{a['after_cancel']} callback(s) by 20 ms; uncancelled control fired once",
                )
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
            if "next_clock_independent" in ids and isinstance(a.get("next_early"), int | float):
                early = float(a["next_early"])
                if early <= t:
                    add(
                        "next_clock_independent",
                        zone,
                        t,
                        f"With the clock 30 days earlier, the next time after {iso(t)} came back as {iso(early)}, "
                        "which is not after it",
                        kind="not_after_start",
                    )
                elif isinstance(a.get("next"), int | float) and early != float(a["next"]):
                    add(
                        "next_clock_independent",
                        zone,
                        t,
                        f"After {iso(t)} the answer is {iso(float(a['next']))} with the clock at that instant, "
                        f"but {iso(early)} with the clock 30 days earlier",
                        expected=str(int(a["next"])),
                        kind="differs_with_clock",
                    )
            if "next_after_now" in ids and isinstance(a.get("next"), int | float):
                n = float(a["next"])
                if n <= t:
                    add("next_after_now", zone, t, f"next {iso(n)} is not after now", kind="not_after_now")
                elif prev_next is not None and n < prev_next:
                    add(
                        "next_after_now",
                        zone,
                        t,
                        f"next moved backwards from {iso(prev_next)} to {iso(n)}",
                        ctx=[prev_next_t, t],
                        kind="moves_backwards",
                    )
                elif gap and n - t > gap:
                    add(
                        "next_after_now",
                        zone,
                        t,
                        f"next is {int(n - t)} ms after now (limit {gap})",
                        expected=str(gap),
                        kind="exceeds_gap",
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
