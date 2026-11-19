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
