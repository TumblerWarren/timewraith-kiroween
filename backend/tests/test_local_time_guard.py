from timewraith import verifysession
from timewraith.environment import local_time_by_design


def test_local_getters_are_local_by_design() -> None:
    src = "export function differenceInMonths(a, b, options) { return a.getMonth() - b.getMonth(); }"
    assert local_time_by_design(src)


def test_context_option_counts_as_local() -> None:
    assert local_time_by_design("function f(date: DateArg, options?: ContextOptions<Date>) {}")


def test_utc_accessors_are_not_local() -> None:
    assert not local_time_by_design("return d.getUTCMonth() + d.getUTCDate();")


def test_mixed_utc_and_local_is_not_excused() -> None:
    assert not local_time_by_design("a.getMonth(); b.getUTCDate();")


def test_plain_code_is_not_local() -> None:
    assert not local_time_by_design("return Math.floor(ms / 60000);")


def test_verdict_accepts_zone_intent() -> None:
    vd = verifysession.Verdict(
        verdict="defect",
        claim="c",
        zone_intent="local_by_design",
        zone_intent_reason="reads getMonth()",
    )
    assert vd.zone_intent == "local_by_design"


def test_zone_intent_is_optional() -> None:
    assert verifysession.Verdict(verdict="defect", claim="c").zone_intent is None
