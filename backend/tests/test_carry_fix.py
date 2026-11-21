"""Carrying a verified fix onto the upstream's latest code when upstream changed the lines around it."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from timewraith.ingest import IngestError
from timewraith.pipeline import _carry_fix

BASE = "\n".join(f"line {i}" for i in range(1, 21)) + "\n"


def run(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", *args],
        cwd=repo, check=True, capture_output=True, text=True,
    ).stdout  # fmt: skip


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    run(tmp_path, "init", "-q")
    run(tmp_path, "config", "core.autocrlf", "false")
    (tmp_path / "a.txt").write_bytes(BASE.encode())
    run(tmp_path, "add", "-A")
    run(tmp_path, "commit", "-q", "-m", "base")
    return tmp_path


def fix_diff(repo: Path) -> str:
    """The fix: one line added after line 10, made on the base commit."""
    (repo / "a.txt").write_bytes(BASE.replace("line 10\n", "line 10\nFIX\n").encode())
    diff = run(repo, "diff")
    run(repo, "checkout", "--", ".")
    return diff


def move_upstream(repo: Path, old: str, new: str) -> None:
    (repo / "a.txt").write_bytes((repo / "a.txt").read_bytes().replace(old.encode(), new.encode()))
    run(repo, "commit", "-q", "-am", "upstream change")


def test_a_fix_that_still_fits_is_applied_as_it_is(repo: Path) -> None:
    diff = fix_diff(repo)
    assert _carry_fix(repo, diff) is False
    assert "FIX" in (repo / "a.txt").read_bytes().decode()


def test_a_fix_is_merged_in_when_upstream_changed_the_lines_next_to_it(repo: Path) -> None:
    diff = fix_diff(repo)
    move_upstream(repo, "line 8\n", "line 8 changed\nanother new line\n")
    move_upstream(repo, "line 13\n", "line 13 changed\n")
    plain = subprocess.run(["git", "apply", "--check", "-"], cwd=repo, input=diff, text=True, capture_output=True)
    assert plain.returncode != 0, "the upstream change must be one a plain apply cannot take"
    assert _carry_fix(repo, diff) is True
    text = (repo / "a.txt").read_bytes().decode()
    assert "FIX" in text and "line 8 changed" in text and "line 13 changed" in text


def test_a_real_conflict_is_not_guessed_at_and_leaves_the_tree_clean(repo: Path) -> None:
    diff = fix_diff(repo)
    move_upstream(repo, "line 10\n", "line 10 rewritten upstream\nFIXED DIFFERENTLY\n")
    before = (repo / "a.txt").read_bytes()
    with pytest.raises(IngestError):
        _carry_fix(repo, diff)
    assert (repo / "a.txt").read_bytes() == before
    assert run(repo, "status", "--porcelain").strip() == ""
