"""Shape a verified fix to the repository it is sent to.

A fix that passed TimeWraith's gates is not yet a good contribution: the repository has its own rules. This module
reads them from the repository's default branch (CONTRIBUTING, the pull request template, the commit convention, DCO,
CLA, any AI policy, where its tests live and which timezone its CI runs in) and builds what the pipeline needs to
follow them: the test file name and place, the test in the repository's typing style, a conventional title, and a pull
request description written into the repository's own template. Pure functions plus one network read; the pipeline
(`Engine.prepare_contribution`) runs the repository's formatter, linter, type check and tests on the result.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import PurePosixPath

from . import github
from .models import ClockConfig, RuleSummary

CONTRIBUTING_PATHS = ("CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md")
TEMPLATE_PATHS = (
    ".github/pull_request_template.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    "pull_request_template.md",
    "PULL_REQUEST_TEMPLATE.md",
    "docs/pull_request_template.md",
)
CHECK_SCRIPTS = ("lint", "format:check", "format", "typecheck", "test", "test:unit", "build")
_AI = re.compile(r"\b(AI|LLM|Copilot|ChatGPT|Claude|AI-assisted|machine[- ]generated|generated code)\b", re.I)
_ISSUE_FIRST = re.compile(r"(open|create|file|raise)\s+an\s+issue.{0,60}(before|first)|discuss.{0,40}before", re.I)
_TZ = re.compile(r"\bTZ=([A-Za-z0-9_/+-]+)")
_TEST_SUFFIX = re.compile(r"\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$")
MAX_TITLE = 72


@dataclass
class Rules:
    summary: RuleSummary
    contributing: str
    template: str
    scripts: dict[str, str]
    issue_first: bool


def read_rules(owner: str, repo: str, token: str) -> Rules:
    """The repository's contribution rules, from its own files on its default branch (public data)."""
    info = github.repo_info(owner, repo, token)
    default = str(info.get("default_branch") or "")
    if not default:
        raise OSError("GitHub did not name the repository's default branch")
    names = github.root_names(owner, repo, default, token)
    contributing, template, template_path = "", "", None
    for path in CONTRIBUTING_PATHS:
        text = github.raw(owner, repo, default, path)
        if text:
            contributing = text
            break
    for path in TEMPLATE_PATHS:
        text = github.raw(owner, repo, default, path)
        if text:
            template, template_path = text, path
            break
    scripts: dict[str, str] = {}
    pkg = github.raw(owner, repo, default, "package.json")
    if pkg:
        try:
            raw_scripts = json.loads(pkg).get("scripts", {})
            scripts = {k: str(v) for k, v in raw_scripts.items() if k in CHECK_SCRIPTS and isinstance(v, str)}
        except ValueError, AttributeError:
            pass
    commitlint = any(n.startswith((".commitlintrc", "commitlint.config")) for n in names)
    summary = RuleSummary(
        default_branch=default,
        archived=bool(info.get("archived")) or bool(info.get("disabled")),
        contributing_url=f"https://github.com/{owner}/{repo}/blob/{default}/CONTRIBUTING.md" if contributing else None,
        template_path=template_path,
        conventional_commits=commitlint or bool(re.search(r"conventional commit", contributing, re.I)),
        dco=bool(re.search(r"Signed-off-by|\bDCO\b|Developer Certificate of Origin", contributing)),
        cla=bool(re.search(r"\bCLA\b|Contributor License Agreement", contributing)),
        ai_policy=[ln.strip()[:200] for ln in contributing.splitlines() if _AI.search(ln)][:5],
        scripts=sorted(scripts),
    )
    return Rules(summary, contributing, template, scripts, bool(_ISSUE_FIRST.search(contributing)))


def warnings_for(rules: Rules) -> list[str]:
    """Things the repository asks that TimeWraith cannot do for the contributor."""
    s, out = rules.summary, []
    if s.dco:
        out.append(
            "The repository asks for a Signed-off-by line (DCO). Add it yourself; TimeWraith cannot sign for you"
        )
    if s.cla:
        out.append("The repository mentions a contributor license agreement (CLA). You may have to sign it")
    if rules.issue_first:
        out.append("CONTRIBUTING asks to open an issue before larger changes: check that this one is small enough")
    if s.ai_policy:
        out.append("CONTRIBUTING mentions AI or generated code: read it before sending. " + s.ai_policy[0])
    return out


def ci_timezone(scripts: dict[str, str]) -> str:
    """The TZ the repository's own test script sets (cross-env TZ=UTC jest), else UTC."""
    for key in ("test:unit", "test", "test:coverage"):
        m = _TZ.search(scripts.get(key, ""))
        if m:
            return m.group(1)
    return "UTC"


def check_clocks(bug: ClockConfig, ci_zone: str) -> list[ClockConfig]:
    """The clocks a regression test is run under before a pull request: first the bug's own zone and instant, where
    it was seen to fail, then the repository's CI zone. A bug that only shows in one zone (a DST hour in
    America/Los_Angeles) passes in UTC, so judging "is it still there upstream" in the CI zone alone gives a
    false "already fixed"."""
    ci = ClockConfig(instant=bug.instant, time_zone=ci_zone, label="the repository's own test zone")
    return [bug] if ci_zone == bug.time_zone else [bug, ci]


def test_location(tracked: list[str], source_path: str, bug_title: str, is_test: Callable[[str], bool]) -> str:
    """Where the new test goes and what it is called: next to the repository's own tests, named like them
    (`<Source>.<topic>.test.ts`), as a new file so it cannot clash with the maintainers' own edits."""
    tests = [p for p in tracked if is_test(p) and _TEST_SUFFIX.search(p)]
    folders = Counter(str(PurePosixPath(p).parent) for p in tests)
    suffixes = Counter(_TEST_SUFFIX.search(p).group(0) for p in tests)  # type: ignore[union-attr]
    folder = folders.most_common(1)[0][0] if folders else "tests"
    suffix = suffixes.most_common(1)[0][0] if suffixes else ".test.ts"
    stem = PurePosixPath(source_path).stem.split(".")[0] or "regression"
    words = [w for w in re.sub(r"[^a-z0-9]+", " ", bug_title.lower()).split() if w not in {"does", "not", "at", "the"}]
    topic = "-".join(words[:4])[:40].strip("-") or "regression"
    return str(PurePosixPath(folder) / f"{stem}.{topic}{suffix}")


def native_test(code: str, test_path: str, *, relaxed: bool) -> str:
    """The generated regression test moved into the repository's test folder. The helpers get explicit types so the
    repository's strict TypeScript and ESLint accept the file; `relaxed` falls back to `@ts-nocheck` for a bug body
    the strict types cannot take."""
    depth = len(PurePosixPath(test_path).parent.parts)
    out = code.replace('"../../"', json.dumps("../" * depth))
    out = out.replace("// TimeWraith regression test: ", "// Regression test, drafted by TimeWraith: ", 1)
    if relaxed:
        return "/* eslint-disable */\n" + out
    out = out.replace("// @ts-nocheck\n", "", 1)
    out = out.replace("function print() {}", "function print(..._args: unknown[]): void {}")
    out = out.replace("function check(cond, msg) {", "function check(cond: unknown, msg?: string): void {")
    out = out.replace(
        "async function load(p) {",
        "// eslint-disable-next-line @typescript-eslint/no-explicit-any\nasync function load(p: string): Promise<any> {",  # noqa: E501
    )
    return out


def conventional_title(bug_title: str, rules: RuleSummary) -> str:
    """`fix: <what was wrong>`, at most 72 characters, cut at a word."""
    text = re.sub(r"\s+", " ", bug_title).strip().rstrip(".;:")
    title = f"fix: {text[:1].lower()}{text[1:]}" if rules.conventional_commits else text[:1].upper() + text[1:]
    if len(title) > MAX_TITLE:
        title = title[:MAX_TITLE].rsplit(" ", 1)[0].rstrip(",;:- ")
    return title


_CHECKBOX = re.compile(r"^(\s*[-*]\s*)\[( |x|X)\](\s*)(.*)$")


def fill_template(
    template: str, *, description: str, changes: list[str], related: list[str], verified: dict[str, bool]
) -> str:
    """The repository's own PR template with the real content in it. Checkboxes TimeWraith did not verify stay
    unchecked: `verified` maps a word in the box label (bug fix, tests pass, eslint, prettier) to whether it is true."""
    out: list[str] = []
    section = ""
    filled_desc = False
    used_desc = False
    change_iter = iter(changes)
    for line in template.replace("\r\n", "\n").split("\n"):
        heading = re.match(r"^#{1,6}\s+(.*)$", line)
        if heading:
            section, filled_desc = heading.group(1).strip().lower(), False
            out.append(line)
            continue
        box = _CHECKBOX.match(line)
        if box:
            label = box.group(4).lower()
            want = next((v for k, v in verified.items() if k in label), False)
            out.append(f"{box.group(1)}[{'x' if want else ' '}]{box.group(3)}{box.group(4)}")
            continue
        if section.startswith("description") and not filled_desc and line.strip() and not line.startswith("Fixes"):
            out.append(description)
            filled_desc = used_desc = True
            continue
        if section.startswith("changes") and line.strip() in {"-", "*"}:
            nxt = next(change_iter, None)
            if nxt is not None:
                out.append(f"- {nxt}")
            continue
        if re.match(r"^\s*(Fixes|Closes)\s+#\s*(\(.*\))?\s*$", line):
            continue  # an empty issue placeholder; TimeWraith does not know an issue this closes
        if section.startswith("related") and re.match(r"^\s*-\s*(Closes|Fixes|Related to)\s*#\s*$", line):
            continue  # an empty placeholder: replaced below
        out.append(line)
    text = "\n".join(out).rstrip() + "\n"
    if not used_desc:  # a template with no Description section (only a checklist): the text goes after it
        text += f"\n## Description\n\n{description}\n"
    if related:
        refs = "\n".join(f"- Related to {r}" for r in related)
        text = re.sub(r"(?im)^(#{1,6}\s+Related[^\n]*\n)", lambda m: m.group(1) + refs + "\n", text, count=1) \
            if re.search(r"(?im)^#{1,6}\s+Related", text) else text + f"\n{refs}\n"  # fmt: skip
    return text


def plain_body(description: str, changes: list[str], related: list[str], verified: dict[str, bool]) -> str:
    done = [k for k, v in verified.items() if v]
    lines = ["## Description", description, "", "## Changes", *[f"- {c}" for c in changes]]
    if done:
        lines += ["", "## Testing", *[f"- {k}" for k in done]]
    if related:
        lines += ["", "## Related", *[f"- Related to {r}" for r in related]]
    return "\n".join(lines) + "\n"


_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z`'\"(])")
_NOISE = re.compile(r"regression test|tests? fail|unrelated to this change|\d+-zone", re.I)
MAX_DIFF_LINES = 60


def sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE.split(" ".join(text.split())) if s.strip()]


def _diff_of_sources(diff: str, sources: list[str]) -> str:
    """The source part of the patch only (the test is its own section), at most MAX_DIFF_LINES lines."""
    keep: list[str] = []
    on = False
    for line in diff.replace("\r\n", "\n").split("\n"):
        if line.startswith("diff --git "):
            on = any(line.endswith(f" b/{p}") for p in sources)
        if on and not line.startswith(("index ", "new file mode", "deleted file mode")):
            keep.append(line)
    if len(keep) > MAX_DIFF_LINES:
        keep = [*keep[:MAX_DIFF_LINES], f"... {len(keep) - MAX_DIFF_LINES} more lines in the patch"]
    return "\n".join(keep)


def _changed_lines(diff: str, sources: list[str]) -> list[tuple[str, int, int]]:
    """(path, lines added, lines removed) for each source file in the patch."""
    counts: dict[str, list[int]] = {}
    current: list[int] | None = None
    for line in diff.replace("\r\n", "\n").split("\n"):
        if line.startswith("diff --git "):
            path = next((p for p in sources if line.endswith(f" b/{p}")), None)
            current = counts.setdefault(path, [0, 0]) if path else None
        elif current is not None and line.startswith("+") and not line.startswith("+++"):
            current[0] += 1
        elif current is not None and line.startswith("-") and not line.startswith("---"):
            current[1] += 1
    return [(p, a, r) for p, (a, r) in counts.items()]


def describe(
    *,
    level: int,
    summary: str,
    root_cause: str,
    diff: str,
    sources: list[str],
    zone: str,
    instant: str,
    local: str,
    detail: str,
    count: int,
    reproduction: str,
    source_ref: str | None,
    checks: list[tuple[str, str, bool]],
    test_path: str,
    related: list[str],
    with_diff: bool = True,
) -> str:
    """A pull request description in sections a maintainer can scan: Summary, Reproduction, Cause, Fix, Test plan.
    Built by code from what was verified, so every number and line in it can be traced to a run."""
    h = "#" * level
    lead = [s for s in sentences(summary) if not _NOISE.search(s)] or sentences(summary)[:1]
    out = [f"{h} Summary", "", lead[0] if lead else "", ""]
    out += [f"{h} Reproduction", "", f"- Time zone: `{zone}`", f"- Instant: `{instant}` (local `{local}`)",
            f"- What goes wrong: {detail}" + (f" (seen {count} times in the sweep)" if count > 1 else "")]  # fmt: skip
    if related:
        out.append(f"- Known report: {', '.join(related)}")
    if reproduction.strip():
        out += ["", "The regression test reproduces it with (`load` and `check` are its helpers):", "",
                "```js", reproduction.strip(), "```"]  # fmt: skip
    out += ["", f"{h} Cause", ""]
    cause = sentences(root_cause)
    for i in range(0, len(cause), 3):  # short paragraphs of up to three sentences
        out += [" ".join(cause[i : i + 3]), ""]
    if not cause:
        out += ["(not stated)", ""]
    if source_ref:
        out += [f"Where: `{source_ref}`", ""]
    out += [f"{h} Fix", ""]
    out += [f"- `{path}`: {added} added, {removed} removed" for path, added, removed in _changed_lines(diff, sources)]
    patch = _diff_of_sources(diff, sources) if with_diff else ""
    if patch:
        out += ["", "```diff", patch, "```"]
    out += ["", f"{h} Test plan", ""]
    out.append(f"- [x] New regression test `{test_path}` fails without the fix and passes with it")
    for name, command, passed in checks:
        if "new test" in name.lower():
            continue
        out.append(f"- [{'x' if passed else ' '}] {name}" + (f": `{command}`" if command else ""))
    return "\n".join(out) + "\n"


def commit_message(title: str, summary: str, root_cause: str, test_path: str, related: list[str]) -> str:
    """A commit message in the repository's style: title, one paragraph of what, then Cause / Tests / Related."""
    import textwrap  # noqa: PLC0415

    def wrap(label: str, text: str) -> str:
        return textwrap.fill(f"{label}{text}", 72, subsequent_indent="  ") if text else ""

    lead = [s for s in sentences(summary) if not _NOISE.search(s)] or sentences(summary)[:1]
    cause = " ".join(sentences(root_cause)[:2])
    blocks = [title, textwrap.fill(" ".join(lead[:2]), 72), wrap("Cause: ", cause),
              wrap("Test: ", f"{test_path} fails without the fix and passes with it."),
              wrap("Related: ", ", ".join(related))]  # fmt: skip
    return "\n\n".join(b for b in blocks if b) + "\n"


DISCLOSURE = (
    "\n_Disclosure: this change was found and drafted by TimeWraith, an automated tool, and checked with this "
    "repository's own tests, linter and formatter. Please review it as you would any contribution._\n"
)
