"""Shaping a fix to a repository's own rules: where the test goes, how the PR reads, what it warns about."""

from __future__ import annotations

from timewraith import contribute
from timewraith.models import ClockConfig, RuleSummary

TEMPLATE = """## Description
<!-- describe -->

## Type of Change
- [ ] Bug fix
- [ ] New feature

## Testing
- [ ] Tests pass locally
- [ ] ESLint passes

## Changes Made
-
-

## Related Issues
- Closes #
"""


def test_the_test_goes_next_to_the_repositorys_own_tests_with_their_name_style() -> None:
    tracked = ["tests/CronDate.test.ts", "tests/CronExpression.test.ts", "src/CronDate.ts", "src/__tw__/x.test.ts"]
    where = contribute.test_location(tracked, "src/CronDate.ts", "addHour does not advance at Lord Howe",
                                     lambda p: p.startswith("tests/"))  # fmt: skip
    assert where == "tests/CronDate.addhour-advance-lord-howe.test.ts"


def test_without_any_tests_it_falls_back_to_tests_folder() -> None:
    assert contribute.test_location([], "lib/a.js", "Bad", lambda p: False) == "tests/a.bad.test.ts"


def test_the_ci_timezone_comes_from_the_repositorys_test_script() -> None:
    assert contribute.ci_timezone({"test:unit": "cross-env TZ=Europe/Paris jest"}) == "Europe/Paris"
    assert contribute.ci_timezone({"test": "jest"}) == "UTC"


def test_native_test_gets_strict_types_or_falls_back_to_relaxed() -> None:
    code = '// @ts-nocheck\nfunction print() {}\nfunction check(cond, msg) {\nasync function load(p) {\nx("../../")\n'
    strict = contribute.native_test(code, "tests/A.test.ts", relaxed=False)
    assert "@ts-nocheck" not in strict and "cond: unknown" in strict and '"../"' in strict
    relaxed = contribute.native_test(code, "tests/A.test.ts", relaxed=True)
    assert relaxed.startswith("/* eslint-disable */")


def test_titles_follow_the_commit_convention_and_stay_short() -> None:
    conv, plain = RuleSummary(conventional_commits=True), RuleSummary()
    assert contribute.conventional_title("AddHour skips a day.", conv) == "fix: addHour skips a day"
    assert contribute.conventional_title("addHour skips a day", plain) == "AddHour skips a day"
    assert len(contribute.conventional_title("word " * 40, conv)) <= contribute.MAX_TITLE


def test_the_repositorys_template_is_filled_and_unverified_boxes_stay_empty() -> None:
    body = contribute.fill_template(
        TEMPLATE,
        description="It skips an hour.",
        changes=["Fix addHour"],
        related=["#453"],
        verified={"bug fix": True, "tests pass": True, "eslint": False},
    )
    assert "It skips an hour." in body and "<!-- describe -->" not in body
    assert "- [x] Bug fix" in body and "- [ ] New feature" in body
    assert "- [x] Tests pass locally" in body and "- [ ] ESLint passes" in body
    assert "- Fix addHour" in body and "- Related to #453" in body and "Closes #\n" not in body


def test_warnings_name_what_only_the_contributor_can_do() -> None:
    rules = contribute.Rules(RuleSummary(dco=True, cla=True, ai_policy=["No AI code"]), "", "", {}, True)
    text = " ".join(contribute.warnings_for(rules))
    assert "Signed-off-by" in text and "license agreement" in text and "open an issue" in text and "No AI code" in text
    assert contribute.warnings_for(contribute.Rules(RuleSummary(), "", "", {}, False)) == []


DIFF = (
    "diff --git a/src/A.ts b/src/A.ts\nindex 1..2 100644\n--- a/src/A.ts\n+++ b/src/A.ts\n@@ -1 +1 @@\n-old\n+new\n"
    "diff --git a/tests/A.test.ts b/tests/A.test.ts\nnew file mode 100644\n--- /dev/null\n+++ b/tests/A.test.ts\n"
    "@@ -0,0 +1 @@\n+t\n"
)


def _describe(level: int) -> str:
    return contribute.describe(
        level=level,
        summary="addHour now moves forward. Regression test and 13-zone check pass. Some repo tests fail under TZ.",
        root_cause="The clock goes back 30 minutes. Flooring lands on the start. So it never advances.", diff=DIFF,
        sources=["src/A.ts"], zone="Australia/Lord_Howe", instant="2024-04-06T14:00:00.000Z",
        local="2024-04-07T01:00:00.000+11:00", detail="next is not after now", count=4, reproduction="d.addHour();",
        source_ref="src/A.ts:145", checks=[("The new test fails on master without the fix", "jest x", True),
                                           ("Prettier", "prettier --check x", True), ("Suite", "jest", False)],
        test_path="tests/A.test.ts", related=["#453"],
    )  # fmt: skip


def test_the_description_has_scannable_sections_and_only_what_was_verified() -> None:
    text = _describe(2)
    for heading in ("## Summary", "## Reproduction", "## Cause", "## Fix", "## Test plan"):
        assert heading in text
    assert "addHour now moves forward." in text and "13-zone" not in text and "fail under TZ" not in text
    assert "- Time zone: `Australia/Lord_Howe`" in text and "seen 4 times" in text and "Known report: #453" in text
    assert (
        "Where: `src/A.ts:145`" in text
        and "The clock goes back 30 minutes. Flooring lands on the start. So it never advances." in text
        and "- `src/A.ts`: 1 added, 1 removed" in text
    )
    assert "-old\n+new" in text and "+t\n" not in text, "only the source patch, not the test"
    assert "- [x] Prettier: `prettier --check x`" in text and "- [ ] Suite: `jest`" in text
    assert text.count("fails without the fix") == 1, "the test line is written once"
    assert _describe(3).count("### ") == 5


def test_a_long_patch_is_cut_with_a_note() -> None:
    big = "diff --git a/src/A.ts b/src/A.ts\n" + "\n".join(f"+line {i}" for i in range(200))
    cut = contribute._diff_of_sources(big, ["src/A.ts"])
    assert len(cut.splitlines()) == contribute.MAX_DIFF_LINES + 1 and cut.endswith("more lines in the patch")


def test_the_commit_message_is_wrapped_and_in_blocks() -> None:
    msg = contribute.commit_message(
        "fix: addHour",
        "It moves forward. Regression test passes.",
        "The clock goes back. " * 6,
        "tests/A.test.ts",
        ["#453"],
    )
    blocks = msg.strip().split("\n\n")
    assert blocks[0] == "fix: addHour" and blocks[1] == "It moves forward."
    assert blocks[2].startswith("Cause: ") and blocks[-1] == "Related: #453"
    assert all(len(line) <= 72 for line in msg.splitlines())


def test_the_before_check_uses_the_bugs_own_zone_before_the_ci_zone() -> None:
    """A DST-hour bug passes in UTC; judging it there alone reports a false 'already fixed upstream'."""
    bug = ClockConfig(instant="2026-11-01T09:00:00.000Z", time_zone="America/Los_Angeles", label="bug")
    clocks = contribute.check_clocks(bug, "UTC")
    assert [(c.time_zone, c.instant) for c in clocks] == [
        ("America/Los_Angeles", "2026-11-01T09:00:00.000Z"),
        ("UTC", "2026-11-01T09:00:00.000Z"),
    ]
    assert contribute.check_clocks(bug, "America/Los_Angeles") == [bug]
