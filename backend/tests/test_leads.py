from timewraith import leads

SOURCE = [
    "export class CronTime {",
    "  getNextDateFrom(start, timeZone) {",
    "    const date = new Date(start.getTime());",
    "    const hourTestDate = DateTime.fromFormat(",
    "      date.toISOString(), 'x',",
    "      { zone: timeZone });",
    "    return hourTestDate;",
    "  }",
    "}",
]


def test_quote_on_the_cited_line_is_cited() -> None:
    assert leads.locate(SOURCE, 3, "const date = new Date(start.getTime());") == (3, "cited")


def test_quote_on_another_line_is_moved_to_where_it_is() -> None:
    assert leads.locate(SOURCE, 9, "const date = new Date(start.getTime());") == (3, "moved")


def test_spacing_and_line_breaks_do_not_matter() -> None:
    quote = "DateTime.fromFormat(date.toISOString(), 'x', { zone: timeZone })"
    assert leads.locate(SOURCE, 4, quote) == (4, "cited")


def test_a_multi_line_quote_is_found() -> None:
    quote = "const date = new Date(start.getTime());\n    const hourTestDate = DateTime.fromFormat("
    assert leads.locate(SOURCE, 1, quote) == (3, "moved")


def test_an_invented_quote_is_not_found() -> None:
    assert leads.locate(SOURCE, 3, "const offset = zone.offset(Settings.now());") is None


def test_a_trivial_quote_proves_nothing() -> None:
    assert leads.locate(SOURCE, 3, "}") is None


def test_the_closest_of_several_matches_wins() -> None:
    lines = ["return value + offset;", "x", "x", "return value + offset;"]
    assert leads.locate(lines, 4, "return value + offset;") == (4, "cited")
    assert leads.locate(lines, 2, "return value + offset;") == (1, "moved")
