"""Experiment templates: deterministic clock points per bug category.

DST points are computed from the IANA database (zoneinfo), never typed in, so a wrong transition date cannot slip in.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from .models import BugCategory, Candidate, CapabilityReport, ClockConfig, Experiment, TestPlan

DST_ZONES = ["America/New_York", "Europe/London", "Australia/Sydney"]
TZ_ZONES = ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Asia/Kathmandu", "Pacific/Kiritimati", "Pacific/Pago_Pago"]
DST_YEAR = 2026


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _local(zone: str, y: int, mo: int, d: int, h: int, mi: int, s: int) -> datetime:
    return datetime(y, mo, d, h, mi, s, tzinfo=ZoneInfo(zone))


def dst_transitions(zone: str, year: int) -> list[datetime]:
    """UTC instants where the zone's UTC offset changes during `year`, found by hourly scan then minute refinement."""
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


def clocks_for(category: BugCategory | str) -> list[ClockConfig]:
    if category == "expiry_boundary":
        r = datetime(2025, 6, 11, 12, 0, 0, tzinfo=UTC)
        pts = [
            (-60_000, "one minute before"),
            (-1, "1 ms before"),
            (0, "exact instant"),
            (1, "1 ms after"),
            (60_000, "one minute after"),
        ]
        return [
            ClockConfig(instant=_iso(r + timedelta(milliseconds=ms)), time_zone="UTC", label=f"expiry: {lbl}")
            for ms, lbl in pts
        ]
    if category == "midnight_rollover":
        out: list[ClockConfig] = []
        for zone in ("America/Los_Angeles", "Asia/Kolkata"):
            for hms, lbl in (((23, 59, 59), "23:59:59"), ((0, 0, 0), "00:00:00"), ((0, 0, 1), "00:00:01")):
                day = 11 if hms[0] == 23 else 12
                out.append(
                    ClockConfig(
                        instant=_iso(_local(zone, 2025, 6, day, *hms)), time_zone=zone, label=f"midnight {lbl} local"
                    )
                )
        for dt, lbl in (
            (_local("UTC", 2025, 1, 31, 23, 59, 59), "month end"),
            (_local("UTC", 2025, 12, 31, 23, 59, 59), "year end"),
            (_local("UTC", 2024, 2, 29, 12, 0, 0), "leap day"),
            (_local("UTC", 2024, 2, 28, 23, 59, 59), "eve of leap day"),
        ):
            out.append(ClockConfig(instant=_iso(dt), time_zone="UTC", label=lbl))
        return out
    if category == "dst_transition":
        out = []
        for zone in DST_ZONES:
            for i, tr in enumerate(dst_transitions(zone, DST_YEAR)):
                kind = "first transition" if i == 0 else "second transition"
                for delta, lbl in ((-30, "30 min before"), (0, "at"), (30, "30 min after")):
                    out.append(
                        ClockConfig(
                            instant=_iso(tr + timedelta(minutes=delta)),
                            time_zone=zone,
                            label=f"DST {kind} {DST_YEAR}: {lbl}",
                        )
                    )
        return out
    if category == "timezone_conversion":
        inst = datetime(2025, 6, 11, 23, 30, 0, tzinfo=UTC)
        return [ClockConfig(instant=_iso(inst), time_zone=z, label=f"same instant in {z}") for z in TZ_ZONES]
    return [ClockConfig(instant=_iso(datetime(2025, 6, 11, 12, 0, 0, tzinfo=UTC)), time_zone="UTC", label="baseline")]


def build_test_plan(cands: list[Candidate], caps: CapabilityReport, max_candidates: int) -> TestPlan:
    plan = TestPlan()
    selected = [c for c in cands if c.selected][:max_candidates]
    plan.capped = len([c for c in cands if c.selected]) > max_candidates
    for c in selected:
        cats: list[BugCategory | str] = ["baseline", *c.bug_categories]
        for cat in dict.fromkeys(cats):
            if cat == "other_temporal":
                continue
            if not caps.test_runner:
                ex, reason = "not_controllable", "No supported test runner (Vitest or Jest) to control the clock"
            elif not c.unit.exported and c.unit.name != "(module)":
                ex, reason = "needs_setup", "Unit is not exported; the experiment must reach it through its module"
            else:
                ex, reason = "ready", None
            eid = "exp_" + hashlib.sha256(f"{c.id}|{cat}".encode()).hexdigest()[:10]
            plan.experiments.append(
                Experiment(
                    id=eid,
                    candidate_id=c.id,
                    category=cat,  # type: ignore[arg-type]
                    clocks=clocks_for(cat),
                    executability=ex,  # type: ignore[arg-type]
                    executability_reason=reason,
                )
            )
    return plan
