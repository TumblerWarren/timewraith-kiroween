from timewraith import playbook


def test_vitest_include_advice_only_for_vitest() -> None:
    assert playbook.advice_for("No test files found, exiting with code 1", "vitest")
    assert not any("Vitest only collects" in a for a in playbook.advice_for("No test files found", "jest"))


def test_temporal_advice_says_timewraith_supplies_it() -> None:
    text = playbook.advice_text("ReferenceError: Temporal is not defined", "vitest")
    assert "supplies a polyfill" in text


def test_unknown_failure_has_no_advice() -> None:
    assert playbook.advice_text("something nobody has seen", "jest").startswith("(nothing known")


def test_differenceInMonths_style_source_is_local_time_by_design() -> None:
    from timewraith.environment import local_time_by_design

    source = "export function differenceInMonths(a, b, options) { const [x, y] = normalizeDates(options?.in, a, b); }"
    assert local_time_by_design(source)
