"""Test files are never the thing under test, whatever the repository calls them."""

from __future__ import annotations

from pathlib import Path

import pytest

from timewraith.analyze import is_test_file, looks_like_test
from timewraith.discovery import build_feature_map, source_inventory

SOURCE = (
    "export function addDays(date: Date, n: number): Date {\n"
    "  const d = new Date(date);\n"
    "  d.setDate(d.getDate() + n);\n"
    "  return d;\n"
    "}\n"
)
SPEC = (
    'import { describe, expect, it } from "vitest";\n'
    'import { addDays } from "./index.js";\n'
    'describe("addDays", () => {\n'
    '  it("adds", () => { expect(addDays(new Date(2026, 0, 1), 1).getDate()).toBe(2); });\n'
    '  it("subtracts", () => { expect(addDays(new Date(2026, 0, 3), -1).getDate()).toBe(2); });\n'
    "});\n"
)


@pytest.mark.parametrize(
    "path",
    [
        "pkgs/core/src/add/test.ts",  # date-fns: a file called test.ts beside the code
        "pkgs/tz/src/date/tests.ts",
        "src/a.test.ts",
        "src/a.spec.mts",
        "src/types.test-d.ts",
        "src/__tests__/a.ts",
        "test/helpers.ts",
    ],
)
def test_test_files_are_recognised_by_their_path(path: str) -> None:
    assert is_test_file(path)


@pytest.mark.parametrize(
    "path", ["src/add/index.ts", "src/testing.ts", "src/latest.ts", "src/contest/index.ts", "src/attest.ts"]
)
def test_ordinary_source_is_not_a_test_file(path: str) -> None:
    assert not is_test_file(path)


def test_a_file_is_a_test_by_what_it_contains_whatever_it_is_called() -> None:
    """A repository may keep its checks in files named anything."""
    assert looks_like_test("src/checks/clock.ts", SPEC)
    assert looks_like_test("lib/x.js", "const test = require('node:test');\ntest('a', () => {});\n")
    assert looks_like_test("lib/y.js", "describe('a', () => {});\ndescribe('b', () => {});\nit('c', () => {});\n")
    assert not looks_like_test("src/add/index.ts", SOURCE)
    assert not looks_like_test("src/describe.ts", "export function describe(x: string) { return x; }\n")


def write(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")


def test_candidates_come_from_source_and_a_test_beside_it_is_only_its_existing_test(tmp_path: Path) -> None:
    write(tmp_path, {"pkgs/core/src/addDays/index.ts": SOURCE, "pkgs/core/src/addDays/test.ts": SPEC})
    fm = build_feature_map(tmp_path, 1_000_000)
    assert fm.candidates, "the real function is a candidate"
    assert all(c.unit.path == "pkgs/core/src/addDays/index.ts" for c in fm.candidates)
    assert any("pkgs/core/src/addDays/test.ts" in c.existing_tests for c in fm.candidates)
    assert fm.skipped.get("test_files") == 1, "the number of recognised test files is on the record"


def test_an_unconventional_test_file_does_not_become_a_target(tmp_path: Path) -> None:
    write(tmp_path, {"src/addDays.ts": SOURCE, "src/checks/clock.ts": SPEC})
    fm = build_feature_map(tmp_path, 1_000_000)
    assert {c.unit.path for c in fm.candidates} == {"src/addDays.ts"}
    assert source_inventory(tmp_path, 1_000_000) == ["src/addDays.ts"], "the scout is not offered tests as source"


def test_timewraiths_own_adapters_are_never_targets(tmp_path: Path) -> None:
    """A re-plan scans a checkout that already holds this tool's generated files."""
    write(
        tmp_path, {"src/addDays.ts": SOURCE, "src/__tw__/exp_1.adapter.ts": SOURCE, "__tw__/exp_2.adapter.ts": SOURCE}
    )
    assert {c.unit.path for c in build_feature_map(tmp_path, 1_000_000).candidates} == {"src/addDays.ts"}
    assert source_inventory(tmp_path, 1_000_000) == ["src/addDays.ts"]
