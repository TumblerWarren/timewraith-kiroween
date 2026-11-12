"""Repository intent (intent.py) and the code check behind an intended-behaviour verdict."""

from __future__ import annotations

from pathlib import Path

from timewraith import intent
from timewraith import sweep as S
from timewraith.ingest import git

FILES = {
    "src/next-run.ts": (
        "import { Matcher } from './matcher';\nexport function nextRun(now) { return new Matcher().next(now); }\n"
    ),
    "src/matcher.ts": "export class Matcher { next(now) { return now + 60000; } }\n",
    "src/matcher.test.ts": (
        "import { Matcher } from './matcher';\n"
        "describe('fall-back overlap', () => {\n"
        "  it('fires the repeated hour once', () => {\n"
        "    // 01:00 EST is skipped on purpose\n"
        "    expect(next('2025-11-02T05:00:00Z')).toBe('2025-11-02T07:00:00.000Z');\n"
        "  });\n"
        "});\n"
    ),
    "src/other.test.ts": "describe('math', () => { it('adds', () => expect(1 + 1).toBe(2)); });\n",
    "README.md": "# lib\n\nnextRun follows the wall clock: during DST fall-back a time fires once.\n",
}


def _repo(root: Path) -> Path:
    for rel, text in FILES.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    git(root, ["init", "-q"])
    git(root, ["add", "-A"])
    return root


def test_finds_tests_of_the_code_and_its_local_dependencies_and_docs(tmp_path: Path) -> None:
    ws = _repo(tmp_path / "r")
    tracked = [ln for ln in git(ws, ["ls-files", "-z"]).split("\0") if ln]
    found = intent.find(ws, tracked, "nextRun", "src/next-run.ts", "America/New_York", "fall-back")
    paths = [s.path for s in found]
    # The overlap test of the dependency (Matcher) ranks first; the docs line is found; the unrelated test is not.
    assert paths[0] == "src/matcher.test.ts"
    assert "README.md" in paths and "src/other.test.ts" not in paths
    assert "5\t    expect(next('2025-11-02T05:00:00Z'))" in found[0].text
    assert intent.local_imports(ws / "src/next-run.ts") == ["Matcher", "matcher"]


def test_names_the_transition_near_a_clock_point() -> None:
    fall = S.parse_instant("2024-11-03T01:59:00.000-07:00")
    spring = S.parse_instant("2025-03-09T01:59:00.000-05:00")
    july = S.parse_instant("2025-07-01T12:00:00.000Z")
    assert fall and spring and july
    assert S.situation("America/Los_Angeles", fall) == "fall-back"
    assert S.situation("America/New_York", spring) == "spring-forward"
    assert S.situation("America/New_York", july) is None
    assert S.situation("UTC", fall) is None


def test_doc_and_test_files_are_told_apart() -> None:
    assert intent.is_doc_file("README.md") and intent.is_doc_file("docs/guide/dst.md")
    assert not intent.is_doc_file("src/dst.test.ts") and not intent.is_doc_file("src/dst.ts")
