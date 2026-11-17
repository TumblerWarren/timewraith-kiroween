"""The local branch of an accepted fix: one commit on the pinned revision, applicable with `git am`."""

from __future__ import annotations

from pathlib import Path

import pytest

from timewraith.config import Settings
from timewraith.ingest import git
from timewraith.models import (
    Bug,
    ClockConfig,
    CreateInvestigation,
    Fix,
    FixAttempt,
    GateResult,
    Investigation,
    Target,
    Violation,
)
from timewraith.pipeline import Engine, Stop
from timewraith.store import Store

DIFF = (
    "diff --git a/src/next.ts b/src/next.ts\n--- a/src/next.ts\n+++ b/src/next.ts\n@@ -1,3 +1,3 @@\n"
    " export function next(now: number) {\n-  return now;\n+  return now + 1;\n }\n"
)


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def verified_case(engine: Engine, case_id: str = "case-b") -> tuple[Investigation, Bug]:
    inv = Investigation(
        id=case_id,
        created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/o/r", ref="main"),
        target=Target(repository_url="https://github.com/o/r", owner="o", repo="r", ref="main", revision="a" * 40),
    )
    ws = engine._ws(inv)
    (ws / "src").mkdir(parents=True)
    (ws / "src" / "next.ts").write_bytes(b"export function next(now: number) {\n  return now;\n}\n")
    git(ws, ["init", "-q"])
    git(ws, ["add", "-A"])
    git(ws, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base"])
    (ws / ".tw").mkdir()  # TimeWraith's own folders stay out of the branch
    clock = ClockConfig(instant="2024-04-06T14:00:00.000Z", time_zone="UTC", label="x")
    v = Violation(invariant="next_after_now", zone="UTC", instant=clock.instant, local=clock.instant, detail="d",
                  count=1, context_ms=[1])  # fmt: skip
    gates = [
        GateResult(gate="test_first", passed=True, detail="ok"),
        GateResult(gate="fixed", passed=True, detail="ok"),
    ]
    bug = Bug(
        id="bug_1", candidate_id="c", experiment_id="exp_1", title="next() does not move forward at the DST end",
        category="dst_transition", invariant="next_after_now", status="reproduced", clock=clock, violation=v,
        failure="f", regression_test_path="src/__tw__/bug_1.regression.test.ts",
        regression_test="test('x', () => {});\n",
        fix=Fix(state="verified", user_decision="accepted",
                attempts=[FixAttempt(attempt=1, summary="Moves forward.", root_cause="It did not.", diff=DIFF,
                                     gates=gates, accepted_by_gates=True)]),
    )  # fmt: skip
    inv.bugs = [bug]
    engine.store.save(inv)
    return inv, bug


def test_branch_has_one_commit_with_the_fix_and_the_test(engine: Engine) -> None:
    inv, bug = verified_case(engine)
    b = engine._make_branch(inv, bug)
    dest = Path(b.path)
    assert b.name == "timewraith/bug_1-next-does-not-move-forward-at-the-dst"
    assert git(dest, ["branch", "--show-current"]).strip() == b.name
    assert git(dest, ["rev-list", "--count", f"{b.base}..{b.commit}"]).strip() == "1"
    assert sorted(b.files) == ["src/__tw__/bug_1.regression.test.ts", "src/next.ts"]
    assert "return now + 1" in (dest / "src" / "next.ts").read_text(encoding="utf-8")
    assert b"\r" not in (dest / "src" / "__tw__" / "bug_1.regression.test.ts").read_bytes()
    assert git(dest, ["remote", "get-url", "origin"]).strip() == "https://github.com/o/r"
    assert git(dest, ["status", "--short"]).strip() == ""
    message = git(dest, ["log", "-1", "--format=%an%n%B"])
    assert message.startswith("TimeWraith") and "test_first: pass" in message and "Moves forward." in message


def test_patch_file_applies_with_git_am_to_the_same_tree(engine: Engine, tmp_path: Path) -> None:
    inv, bug = verified_case(engine)
    b = engine._make_branch(inv, bug)
    fresh = tmp_path / "fresh"
    git(tmp_path, ["-c", "protocol.file.allow=always", "clone", "-q", engine._ws(inv).as_posix(), str(fresh)])
    git(fresh, ["-c", "user.name=x", "-c", "user.email=x@x", "am", b.patch_file])
    assert git(fresh, ["rev-parse", "HEAD^{tree}"]) == git(Path(b.path), ["rev-parse", "HEAD^{tree}"])


def test_branch_only_for_an_accepted_verified_fix(engine: Engine) -> None:
    inv, bug = verified_case(engine)
    bug.fix.user_decision = "pending"
    engine.store.save(inv)
    with pytest.raises(Stop) as e:
        engine.make_branch(inv.id, bug.id)
    assert e.value.code == "fix_not_accepted"


def test_accepting_makes_the_branch_and_a_failure_keeps_the_decision(engine: Engine) -> None:
    inv, bug = verified_case(engine)
    bug.fix.user_decision = "pending"
    engine.store.save(inv)
    assert engine.decide_fix(inv.id, bug.id, True).bugs[0].fix.branch is not None
    inv2, bug2 = verified_case(engine, "case-c")
    bug2.fix.user_decision = "pending"
    bug2.fix.attempts[0].diff = "not a diff"
    engine.store.save(inv2)
    done = engine.decide_fix(inv2.id, bug2.id, True)
    assert done.bugs[0].fix.user_decision == "accepted" and done.bugs[0].fix.branch is None
    assert any("branch could not be made" in n for n in done.notes)
