from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from timewraith.agents import AgentUnavailable, ReviewOut, StubRuntime, _extract_json
from timewraith.pipeline import PROTECTED
from timewraith.planning import DST_ZONES, TZ_ZONES, clocks_for, dst_transitions


def test_new_york_2026_transitions_come_from_tzdb() -> None:
    a, b = dst_transitions("America/New_York", 2026)
    assert a == datetime(2026, 3, 8, 7, 0, tzinfo=UTC)  # 02:00 EST
    assert b == datetime(2026, 11, 1, 6, 0, tzinfo=UTC)  # 02:00 EDT


@pytest.mark.parametrize("zone", DST_ZONES)
def test_each_dst_zone_has_two_real_transitions(zone: str) -> None:
    trs = dst_transitions(zone, 2026)
    assert len(trs) == 2
    tz = ZoneInfo(zone)
    for t in trs:
        assert (t - timedelta(minutes=1)).astimezone(tz).utcoffset() != t.astimezone(tz).utcoffset()


@pytest.mark.parametrize(
    "cat", ["baseline", "expiry_boundary", "midnight_rollover", "dst_transition", "timezone_conversion"]
)
def test_clock_points_are_valid(cat: str) -> None:
    clocks = clocks_for(cat)
    assert clocks
    for c in clocks:
        ZoneInfo(c.time_zone)
        assert c.instant.endswith("Z")
        datetime.fromisoformat(c.instant.replace("Z", "+00:00"))
        assert c.scope == "test_process"


def test_timezone_points_cover_odd_offsets() -> None:
    zones = {c.time_zone for c in clocks_for("timezone_conversion")}
    assert {"Asia/Kathmandu", "Pacific/Kiritimati", "UTC"} <= zones == set(TZ_ZONES)


@pytest.mark.parametrize(
    "path",
    [
        "package.json",
        "pnpm-lock.yaml",
        "sub/package.json",
        ".github/workflows/ci.yml",
        "vitest.config.ts",
        "src/__tw__/x.tw.test.ts",
        "tsconfig.json",
    ],
)
def test_protected_files(path: str) -> None:
    assert PROTECTED.search(path)


@pytest.mark.parametrize("path", ["src/token.ts", "lib/date/format.js"])
def test_source_files_not_protected(path: str) -> None:
    assert not PROTECTED.search(path)


def test_stub_runtime_never_invents_output() -> None:
    with pytest.raises(AgentUnavailable):
        StubRuntime().call("doctor-stitch", "write_fix", "x", ReviewOut)


def test_extract_json_from_fenced_reply() -> None:
    assert _extract_json('noise\n```json\n{"items": []}\n```\n') == {"items": []}
    assert _extract_json('Sure: {"a": 1}') == {"a": 1}
    with pytest.raises(ValueError):
        _extract_json("no json here")
