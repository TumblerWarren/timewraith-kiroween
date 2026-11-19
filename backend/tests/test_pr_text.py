"""The pull request text follows the repository's template and title style."""

from __future__ import annotations

from types import SimpleNamespace

from timewraith import contribute, pipeline
from timewraith.models import CheckResult, RuleSummary

DIFF = (
    "diff --git a/src/parseoptions.ts b/src/parseoptions.ts\n"
    "--- a/src/parseoptions.ts\n+++ b/src/parseoptions.ts\n@@ -43,1 +43,3 @@\n"
    "-  if (!opts.dtstart) opts.dtstart = new Date(new Date().setMilliseconds(0))\n"
    "+  if (!opts.dtstart) {\n+    opts.dtstart = new Date(Math.floor(Date.now() / 1000) * 1000)\n+  }\n"
)
TEMPLATE = "## Description\n<!-- describe -->\n\n## Type of Change\n- [ ] Bug fix\n- [ ] Added tests\n"


def _bug() -> SimpleNamespace:
    return SimpleNamespace(
        title="Default dtstart shifts by one hour",
        issue_match=None,
        contribution_test=None,
        evidence=[SimpleNamespace(kind="source", ref="src/parseoptions.ts:43")],
        violation=SimpleNamespace(
            zone="America/Los_Angeles", instant="2026-11-01T09:00:00.000Z", local="2026-11-01T01:00:00.000-08:00",
            detail="instant differs", count=2,
        ),
        reproduction={"code": "check(true)"},
    )  # fmt: skip


def _rules(template: str, *, conventional: bool) -> contribute.Rules:
    summary = RuleSummary(default_branch="master", conventional_commits=conventional)
    return contribute.Rules(summary, "", template, {}, False)


def _text(rules: contribute.Rules) -> tuple[str, str, bool]:
    attempt = SimpleNamespace(
        summary="Truncate the milliseconds from the epoch.", root_cause="setMilliseconds", diff=DIFF
    )
    checks = [
        CheckResult(name="ESLint (the repository's linter)", command="eslint", passed=True, detail=""),
        CheckResult(name="Prettier (the repository's formatter)", command="prettier", passed=True, detail=""),
        CheckResult(name="TypeScript (type check)", command="tsc --noEmit", passed=True, detail=""),
    ]
    return pipeline._pr_text(
        _bug(),
        attempt,
        rules,
        ["src/parseoptions.ts"],
        ["src/parseoptions.ts", "test/x.test.ts"],
        "test/x.test.ts",
        checks,
    )  # type: ignore[arg-type]


def test_the_description_fills_the_repositorys_own_template() -> None:
    title, body, trimmed = _text(_rules(TEMPLATE, conventional=True))
    assert title.startswith("fix")
    assert "## Description" in body and "## Type of Change" in body
    assert "Truncate the milliseconds" in body
    assert "- [x] Bug fix" in body and "- [x] Added tests" in body
    assert not trimmed


def test_a_repository_without_a_template_gets_a_plain_description() -> None:
    _, body, _ = _text(_rules("", conventional=False))
    assert "## Type of Change" not in body
    assert "Truncate the milliseconds" in body


CHECKLIST_ONLY = (
    "---\n### Thanks for contributing to `rrule`!\n"
    "To submit a pull request, please verify that you have done the following:\n"
    "- [ ] Merged in or rebased on the latest `master` commit\n"
    "- [ ] Linked to an existing bug or issue describing the bug or feature you're\n      addressing\n"
    "- [ ] Written one or more tests showing that your change works as advertised\n"
)


def test_a_checklist_only_template_still_gets_the_explanation_and_the_test_box() -> None:
    """The rrule template has no Description heading: the text must not be dropped, and the tests box is true."""
    _, body, _ = _text(_rules(CHECKLIST_ONLY, conventional=False))
    assert "Truncate the milliseconds" in body
    assert "- [x] Merged in or rebased" in body
    assert "- [x] Written one or more tests" in body
    assert "- [ ] Linked to an existing bug" in body  # nothing links an issue, so it stays unchecked
    assert body.index("Thanks for contributing") < body.index("Truncate the milliseconds")


CODE_QUALITY = (
    "## Code Quality\n"
    "- [ ] Code follows project style guidelines\n"
    "- [ ] ESLint checks pass (`npm run lint`)\n"
    "- [ ] Prettier formatting applied (`npm run format`)\n"
    "- [ ] TypeScript compilation successful (`npm run build`)\n"
    "- [ ] No new TypeScript errors or warnings\n"
    "- [ ] Benchmarks were run before and after changes\n"
)


def _checked(body: str) -> dict[str, bool]:
    return {ln[6:].strip(): ln.startswith("- [x]") for ln in body.splitlines() if ln.startswith(("- [x]", "- [ ]"))}


def test_code_quality_boxes_follow_the_checks_that_ran() -> None:
    _, body, _ = _text(_rules(CODE_QUALITY, conventional=False))
    boxes = _checked(body)
    assert boxes["Code follows project style guidelines"]
    assert boxes["ESLint checks pass (`npm run lint`)"]
    assert boxes["Prettier formatting applied (`npm run format`)"]
    assert not boxes["Benchmarks were run before and after changes"]  # nothing measured


def test_typescript_boxes_need_the_type_check_to_have_passed() -> None:
    eslint = CheckResult(name="ESLint (the repository's linter)", command="eslint", passed=True, detail="")
    prettier = CheckResult(name="Prettier (the repository's formatter)", command="prettier", passed=True, detail="")
    tsc = CheckResult(name="TypeScript (type check)", command="tsc --noEmit", passed=True, detail="")
    attempt = SimpleNamespace(summary="Fix.", root_cause="Cause.", diff=DIFF)
    rules = _rules(CODE_QUALITY, conventional=False)

    def boxes(checks: list[CheckResult]) -> dict[str, bool]:
        args = (_bug(), attempt, rules, ["src/parseoptions.ts"], ["src/parseoptions.ts"], "t.test.ts", checks)
        return _checked(pipeline._pr_text(*args)[1])  # type: ignore[arg-type]

    passed = boxes([eslint, prettier, tsc])
    assert passed["TypeScript compilation successful (`npm run build`)"]
    assert passed["No new TypeScript errors or warnings"]
    failed = boxes([eslint, prettier, tsc.model_copy(update={"passed": False})])
    assert not failed["TypeScript compilation successful (`npm run build`)"]
    assert not failed["No new TypeScript errors or warnings"]
    assert failed["Code follows project style guidelines"]  # style depends on lint and format only
    skipped = boxes([eslint, prettier])  # a repository without TypeScript checks: nothing is claimed
    assert not skipped["TypeScript compilation successful (`npm run build`)"]
