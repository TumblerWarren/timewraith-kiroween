from __future__ import annotations

from pathlib import Path

from timewraith.analyze import analyze
from timewraith.discovery import build_feature_map


def _cap(report, cid):  # type: ignore[no-untyped-def]
    return next(i for i in report.items if i.id == cid)


def test_capabilities_for_js_repo(expiry_repo: Path) -> None:
    r = analyze(expiry_repo)
    assert _cap(r, "language.js_ts").status == "supported"
    assert r.package_manager == "npm"
    assert r.test_runner == "vitest"
    assert _cap(r, "adapter.js_tests.fake_timers").status == "supported"
    assert _cap(r, "clock.server").status == "unsupported"


def test_unsupported_language_is_reported(python_repo: Path) -> None:
    r = analyze(python_repo)
    item = _cap(r, "language.js_ts")
    assert item.status == "unsupported"
    assert "Python" in item.reason


def test_expiry_candidate_found(expiry_repo: Path) -> None:
    fm = build_feature_map(expiry_repo, 1_000_000)
    names = {c.unit.name: c for c in fm.candidates}
    assert "isExpired" in names
    c = names["isExpired"]
    assert "expiry_boundary" in c.bug_categories
    assert c.unit.exported
    assert c.status == "candidate"
    assert "src/token.test.ts" in c.existing_tests
    assert "timezone_conversion" in names["formatDay"].bug_categories
    assert all(not s.in_test or s.path.endswith(".test.ts") for s in fm.signals)
    assert fm.note == "These are candidates, not proven bugs."


def test_score_parts_sum_and_order(expiry_repo: Path) -> None:
    fm = build_feature_map(expiry_repo, 1_000_000)
    for c in fm.candidates:
        assert round(sum(c.score_parts.values()), 2) == c.score
    assert [c.score for c in fm.candidates] == sorted((c.score for c in fm.candidates), reverse=True)


def test_deterministic(expiry_repo: Path) -> None:
    a = build_feature_map(expiry_repo, 1_000_000)
    b = build_feature_map(expiry_repo, 1_000_000)
    assert a.model_dump() == b.model_dump()


def test_no_time_repo_has_no_candidates(no_time_repo: Path) -> None:
    assert build_feature_map(no_time_repo, 1_000_000).candidates == []


def test_engine_has_no_repo_specific_names() -> None:
    src = Path(__file__).resolve().parents[1] / "src" / "timewraith"
    banned = ["fullcalendar", "cal.com", "calcom", "jsonwebtoken", "node-cron", "react-big-calendar"]
    for name in ("analyze.py", "discovery.py", "planning.py"):
        text = (src / name).read_text(encoding="utf-8").lower()
        for b in banned:
            assert b not in text, f"{b} in {name}"
