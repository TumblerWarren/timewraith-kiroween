from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from timewraith import sweep as S
from timewraith.agents import AGENTS, PROFILES, AgentUnavailable, ReviewOut, StubRuntime, _extract_json
from timewraith.models import FLOW, InvariantUse
from timewraith.pipeline import PROTECTED, _source_ok

T0 = int(datetime(2025, 6, 11, 12, tzinfo=UTC).timestamp() * 1000)
H = 3_600_000


def rec(t: int, **out: object) -> dict[str, object]:
    return {"t": t, "r0": dict(out), "r1": dict(out)}


# ---------- clock points ----------


def test_new_york_2026_transitions_come_from_tzdb() -> None:
    a, b = S.dst_transitions("America/New_York", 2026)
    assert a == datetime(2026, 3, 8, 7, 0, tzinfo=UTC)
    assert b == datetime(2026, 11, 1, 6, 0, tzinfo=UTC)


@pytest.mark.parametrize("zone", ["America/New_York", "Europe/London", "Australia/Sydney", "Australia/Lord_Howe"])
def test_dst_zones_have_two_real_transitions(zone: str) -> None:
    trs = S.dst_transitions(zone, 2026)
    assert len(trs) == 2
    tz = ZoneInfo(zone)
    for t in trs:
        assert (t - timedelta(minutes=1)).astimezone(tz).utcoffset() != t.astimezone(tz).utcoffset()


def test_points_cover_every_zone_and_shared_instants() -> None:
    pts = S.build_points([])
    assert set(pts) == set(S.SWEEP_ZONES)
    shared = S.shared_points()
    for z, ms in pts.items():
        ZoneInfo(z)
        assert shared <= set(ms)
        assert ms == sorted(set(ms))
    assert 1500 < sum(len(v) for v in pts.values()) < 5000


def test_anchor_adds_boundary_points() -> None:
    pts = S.build_points([T0])["UTC"]
    for d in (-60_000, -1, 0, 1, 60_000):
        assert T0 + d in pts


def test_future_window_reaches_leap_day_and_excludes_outside_points() -> None:
    window = S.future_window(datetime(2026, 11, 19, 23, 59, tzinfo=UTC))
    assert S.iso(window.start_ms) == "2026-11-20T00:00:00.000Z"
    assert S.iso(window.end_ms) == "2031-11-20T00:00:00.000Z"
    points = S.build_points([window.start_ms, window.end_ms], window)
    assert S.parse_instant("2028-02-29T00:00:00Z") in points["UTC"]
    assert all(window.contains(ms) for series in points.values() for ms in series)
    assert all(
        len(series) == 2 and all(window.contains(ms) for ms in series) for series in S.baseline_points(window).values()
    )


def test_parse_instant_requires_offset() -> None:
    assert S.parse_instant("2025-06-11T12:00:00Z") == T0
    assert S.parse_instant("2025-06-11T12:00:00") is None
    assert S.parse_instant("1900-01-01T00:00:00Z") is None


# ---------- oracles ----------


def test_clean_outputs_have_no_violations() -> None:
    outs = {"UTC": [rec(T0, flag=False), rec(T0 + H, flag=True), rec(T0 + 2 * H, flag=True)]}
    assert S.check(outs, [InvariantUse(id="flag_monotonic", reason="x")]) == []


def test_flag_that_flips_back_is_a_violation() -> None:
    outs = {"UTC": [rec(T0, flag=False), rec(T0 + H, flag=True), rec(T0 + 2 * H, flag=False)]}
    (v,) = S.check(outs, [InvariantUse(id="flag_monotonic", reason="x")])
    assert v.invariant == "flag_monotonic"
    assert v.context_ms == [T0, T0 + H, T0 + 2 * H]


def test_local_date_uses_the_zone_calendar() -> None:
    late = int(datetime(2025, 6, 11, 23, 30, tzinfo=ZoneInfo("America/Los_Angeles")).timestamp() * 1000)
    outs = {"America/Los_Angeles": [rec(late, date="2025-06-12")]}  # the toISOString().slice(0, 10) mistake
    (v,) = S.check(outs, [InvariantUse(id="local_date_matches", reason="x")])
    assert v.expected == "2025-06-11"


def test_undeclared_invariant_is_not_checked() -> None:
    late = int(datetime(2025, 6, 11, 23, 30, tzinfo=ZoneInfo("America/Los_Angeles")).timestamp() * 1000)
    assert S.check({"America/Los_Angeles": [rec(late, date="2025-06-12")]}, []) == []


def test_zone_independence_compares_with_utc() -> None:
    outs = {"UTC": [rec(T0, instant=T0)], "Asia/Kolkata": [rec(T0, instant=T0 - 19_800_000)]}
    (v,) = S.check(outs, [InvariantUse(id="instant_zone_independent", reason="x")])
    assert (v.zone, v.expected) == ("Asia/Kolkata", str(T0))


def test_next_moving_backwards_is_a_violation() -> None:
    outs = {"UTC": [rec(T0, next=T0 + 2 * H), rec(T0 + H, next=T0 + H + 1)]}
    (v,) = S.check(outs, [InvariantUse(id="next_after_now", reason="x")])
    assert "backwards" in v.detail and v.context_ms == [T0, T0 + H]


def test_throw_and_nondeterminism_are_always_checked() -> None:
    outs = {"UTC": [{"t": T0, "r0": {"error": "boom"}, "r1": {"error": "boom"}},
                    {"t": T0 + H, "r0": {"value": "1"}, "r1": {"value": "2"}}]}  # fmt: skip
    assert {v.invariant for v in S.check(outs, [])} == {"well_formed", "deterministic"}


def test_baseline_problems_catch_missing_fields_and_bad_dates() -> None:
    outs = {"UTC": [rec(T0, date="11/06/2025")]}
    probs = S.baseline_problems(outs, ["date", "flag"])
    assert any("did not return flag" in p for p in probs)
    assert any("YYYY-MM-DD" in p for p in probs)
    assert S.baseline_problems({}, ["flag"]) == ["No output: the runner did not collect or could not load the harness"]


# ---------- generated JavaScript ----------


@pytest.mark.parametrize("runner", ["vitest", "jest"])
def test_harness_is_a_noop_without_tw_dir_and_never_asserts(runner: str) -> None:
    code = S.harness_code("exp_1", runner)
    assert "if (!dir) return;" in code
    assert "expect(" not in code
    assert ("import" in code) == (runner == "vitest")


def test_regression_test_is_generated_from_the_invariant() -> None:
    late = int(datetime(2025, 6, 11, 23, 30, tzinfo=ZoneInfo("America/Los_Angeles")).timestamp() * 1000)
    (v,) = S.check({"America/Los_Angeles": [rec(late, date="2025-06-12")]},
                   [InvariantUse(id="local_date_matches", reason="x")])  # fmt: skip
    code = S.regression_code(exp_id="exp_1", runner="vitest", v=v, title="t", target="o/r@abc")
    assert 'toBe("2025-06-11")' in code and "not written by an LLM" in code


# ---------- agents, flow, guards ----------


def test_every_kiro_agent_has_a_profile() -> None:
    for a in AGENTS:
        assert (PROFILES / f"{a}.md").exists()


def test_flow_has_five_steps_and_a_follow_on_fix() -> None:
    main = [f for f in FLOW if not f.follow_on]
    assert [f.title for f in main] == ["Repository", "Time-sensitive code discovery", "Autonomous experiment design",
                                       "Controlled execution", "Independent bug verification"]  # fmt: skip
    assert [f.kind for f in main] == ["code", "kiro-agent", "kiro-agent", "code", "kiro-agent"]
    assert [f.id for f in FLOW if f.follow_on] == ["fix"]


def test_source_evidence_must_resolve(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.ts").write_text("one\ntwo\nthree\n", encoding="utf-8")
    assert _source_ok(tmp_path, "src/a.ts:2")
    assert _source_ok(tmp_path, "src/a.ts:1-3")
    assert not _source_ok(tmp_path, "src/a.ts:4")
    assert not _source_ok(tmp_path, "src/a.ts:3-1")
    assert not _source_ok(tmp_path, "../secret.txt:1")
    assert not _source_ok(tmp_path, "src/missing.ts:1")


@pytest.mark.parametrize(
    "path",
    [
        "package.json",
        "pnpm-lock.yaml",
        "sub/package.json",
        ".github/workflows/ci.yml",
        "vitest.config.ts",
        "src/__tw__/x.adapter.ts",
        "tsconfig.json",
        ".tw/points.json",
    ],
)
def test_protected_files(path: str) -> None:
    assert PROTECTED.search(path)


@pytest.mark.parametrize("path", ["src/token.ts", "lib/date/format.js"])
def test_source_files_not_protected(path: str) -> None:
    assert not PROTECTED.search(path)


def test_usage_limit_is_named_not_hidden() -> None:
    from timewraith.agents import AgentQuotaReached, _raise_unavailable

    msg = "Error: Internal error (code -32603): ... The monthly usage limit has been reached (request_id: x)"
    with pytest.raises(AgentQuotaReached, match="usage limit reached"):
        _raise_unavailable("raven-archivist", msg)
    with pytest.raises(AgentUnavailable, match="could not run: boom") as e:
        _raise_unavailable("raven-archivist", "boom")
    assert not isinstance(e.value, AgentQuotaReached)


def test_stub_runtime_never_invents_output() -> None:
    with pytest.raises(AgentUnavailable):
        StubRuntime().call("doctor-stitch", "write_fix", "x", ReviewOut)


def test_extract_json_from_fenced_reply() -> None:
    assert _extract_json('noise\n```json\n{"items": []}\n```\n') == {"items": []}
    assert _extract_json('Sure: {"a": 1}') == {"a": 1}
    with pytest.raises(ValueError):
        _extract_json("no json here")


def test_cited_calendar_contract_detects_valid_but_wrong_result() -> None:
    output = {
        "calendar_cases": [
            {"name": "string-offset", "actual": "2028-03-12", "expected": "2028-03-03"},
            {"name": "number-control", "actual": "2028-03-03", "expected": "2028-03-03"},
        ]
    }
    samples = {"UTC": [{"t": T0, "r0": output, "r1": output}]}
    assert S.check(samples, []) == []
    rule = InvariantUse(id="calendar_contract", reason="Date representation equivalence", expectation_ref="README.md:1")
    [violation] = S.check(samples, [rule])
    assert violation.failure_kind == "string-offset"
    assert violation.expected == '"2028-03-03"'
    test = S.regression_code(exp_id="exp_fixture", runner="vitest", v=violation, title="calendar", target="fixture")
    assert 'c.name === "string-offset"' in test and 'toEqual("2028-03-03")' in test
