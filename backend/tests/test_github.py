"""Sharing a fix on GitHub: the rules that must hold before anything leaves the machine. A fake container stands in
for `docker exec`, so no GitHub account is used."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from timewraith import gitbox, publish
from timewraith.config import Settings
from timewraith.models import (
    Bug,
    ClockConfig,
    CreateInvestigation,
    Fix,
    FixAttempt,
    FixBranch,
    Investigation,
    Target,
    Violation,
)
from timewraith.pipeline import Engine, Stop
from timewraith.store import Store

BRANCH = "timewraith/bug_1-next-does-not-move"
BASE = "a" * 40
TOKEN = "ghp_" + "A" * 36


class FakeBox:
    """Records every command sent to the container and answers from a script."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.push = (0, f"REBUILT TREE=t COMMIT={'b' * 40}\nPUSHED FORK=me/repo\n", "")
        self.pr = (0, "PR https://github.com/o/repo/pull/77\n", "")
        self.prs = "[]"

    def __call__(self, args: list[str], *, env: dict[str, str] | None = None, stdin: str | None = None,
                 timeout: float = 60) -> subprocess.CompletedProcess[str]:  # fmt: skip
        self.calls.append({"args": args, "env": env or {}, "stdin": stdin})
        script = args[-1]
        if script == publish.PUSH_SCRIPT:
            rc, out, err = self.push
        elif script == publish.PR_SCRIPT:
            rc, out, err = self.pr
        elif args[:3] == ["gh", "pr", "list"]:
            rc, out, err = 0, self.prs, ""
        else:
            rc, out, err = 0, "", ""
        return subprocess.CompletedProcess(args, rc, out, err)


@pytest.fixture
def box(monkeypatch: pytest.MonkeyPatch) -> FakeBox:
    fake = FakeBox()
    monkeypatch.setattr(publish, "exec_in", fake)
    monkeypatch.setattr(gitbox.manager, "identity", lambda fresh=False: (True, "me"))
    return fake


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    s = Settings(data_dir=tmp_path / "data", agent_runtime="stub")
    s.check_paths()
    return Engine(s, Store(s.db_path))


def accepted(engine: Engine, tmp_path: Path, **over: Any) -> tuple[Investigation, Bug]:
    patch = tmp_path / "b.patch"
    patch.write_text("From abc\nSubject: fix\n", encoding="utf-8")
    clock = ClockConfig(instant="2024-04-06T14:00:00.000Z", time_zone="UTC", label="x")
    v = Violation(invariant="next_after_now", zone="UTC", instant=clock.instant, local=clock.instant, detail="d",
                  count=1, context_ms=[1])  # fmt: skip
    branch = FixBranch(name=over.get("name", BRANCH), path=str(tmp_path / "gone"), base=BASE, commit="c" * 40,
                       files=["src/next.ts"], created_at="t", patch_file=str(patch), upstream_url="u")  # fmt: skip
    bug = Bug(
        id="bug_1", candidate_id="c", experiment_id="exp_1", title="next does not move forward at the DST end",
        category="dst_transition", invariant="next_after_now", status="reproduced", clock=clock, violation=v,
        failure="f", regression_test_path="t.ts", regression_test="x",
        fix=Fix(state="verified", user_decision=over.get("decision", "accepted"), branch=branch,
                attempts=[FixAttempt(attempt=1, summary="Moves forward.", root_cause="It did not.", diff="d",
                                     accepted_by_gates=True)]),
        issue_match={"number": "453", "title": "fix: addHour", "url": "https://github.com/o/repo/pull/453"},
    )  # fmt: skip
    inv = Investigation(
        id="case-g", created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/o/repo", ref="main"),
        target=Target(repository_url="https://github.com/o/repo", owner="o", repo="repo", ref="main"),
        bugs=[bug],
    )  # fmt: skip
    engine.store.save(inv)
    return inv, bug


def code_of(e: pytest.ExceptionInfo[Stop]) -> str:
    return e.value.code


def test_preview_lists_duplicates_and_what_would_be_sent(engine: Engine, tmp_path: Path, box: FakeBox) -> None:
    accepted(engine, tmp_path)
    box.prs = json.dumps([{"number": 12, "title": "other fix", "url": "https://github.com/o/repo/pull/12",
                           "state": "OPEN"}])  # fmt: skip
    p = engine.github_preview("case-g", "bug_1")
    assert p["ready"] and p["upstream"] == "o/repo" and p["fork"] == "me/repo" and p["branch"] == BRANCH
    assert [d["number"] for d in p["duplicates"]] == [453, 12], "Raven's known report first, then the search"
    assert p["title"].startswith("fix: ") and p["files"] == ["src/next.ts"]


def test_preview_says_what_is_missing(engine: Engine, tmp_path: Path, box: FakeBox,
                                      monkeypatch: pytest.MonkeyPatch) -> None:  # fmt: skip
    accepted(engine, tmp_path, decision="pending")
    monkeypatch.setattr(gitbox.manager, "identity", lambda fresh=False: (False, None))
    p = engine.github_preview("case-g", "bug_1")
    assert not p["ready"] and len(p["problems"]) == 2 and p["duplicates"] == []


@pytest.mark.parametrize(
    ("over", "confirm", "code"),
    [
        ({}, "timewraith/other", "confirm_mismatch"),
        ({"decision": "pending"}, BRANCH, "fix_not_accepted"),
        ({"name": "main"}, "main", "branch_not_allowed"),
        ({"name": "timewraith/../main"}, "timewraith/../main", "branch_not_allowed"),
    ],
)
def test_push_refuses_before_touching_the_container(
    engine: Engine, tmp_path: Path, box: FakeBox, over: dict[str, str], confirm: str, code: str
) -> None:
    accepted(engine, tmp_path, **over)
    with pytest.raises(Stop) as e:
        engine.github_push("case-g", "bug_1", confirm)
    assert code_of(e) == code and box.calls == []


def test_push_needs_a_sign_in_and_never_targets_your_own_original(
    engine: Engine, tmp_path: Path, box: FakeBox, monkeypatch: pytest.MonkeyPatch
) -> None:
    accepted(engine, tmp_path)
    monkeypatch.setattr(gitbox.manager, "identity", lambda fresh=False: (False, None))
    with pytest.raises(Stop) as e:
        engine.github_push("case-g", "bug_1", BRANCH)
    assert code_of(e) == "github_not_connected"
    monkeypatch.setattr(gitbox.manager, "identity", lambda fresh=False: (True, "O"))  # the original's owner
    with pytest.raises(Stop) as e2:
        engine.github_push("case-g", "bug_1", BRANCH)
    assert code_of(e2) == "not_your_fork" and box.calls == []


def test_push_sends_only_validated_names_and_records_what_was_pushed(
    engine: Engine, tmp_path: Path, box: FakeBox
) -> None:
    accepted(engine, tmp_path)
    pub = engine.github_push("case-g", "bug_1", BRANCH)
    call = next(c for c in box.calls if c["args"][-1] == publish.PUSH_SCRIPT)
    assert call["env"] == {"TW_OWNER": "o", "TW_REPO": "repo", "TW_BASE": BASE, "TW_BRANCH": BRANCH,
                           "TW_PARENT_LC": "o/repo"}  # fmt: skip
    assert "From abc" in call["stdin"], "the branch's patch is what goes in"
    assert pub.fork == "me/repo" and pub.branch == BRANCH and pub.commit == "b" * 40
    assert engine.store.get("case-g").bugs[0].fix.publish == pub  # type: ignore[union-attr]
    with pytest.raises(Stop) as e:
        engine.github_push("case-g", "bug_1", BRANCH)
    assert code_of(e) == "already_published"


def test_push_failures_are_named_and_never_leak_a_token(engine: Engine, tmp_path: Path, box: FakeBox) -> None:
    accepted(engine, tmp_path)
    box.push = (12, "", "NOT_YOUR_FORK me/repo")
    with pytest.raises(Stop) as e:
        engine.github_push("case-g", "bug_1", BRANCH)
    assert code_of(e) == "not_your_fork"
    box.push = (1, "", f"fatal: could not read Password for 'https://x-access-token:{TOKEN}@github.com'")
    with pytest.raises(Stop) as e2:
        engine.github_push("case-g", "bug_1", BRANCH)
    assert code_of(e2) == "push_failed" and TOKEN not in str(e2.value) and "***" in str(e2.value)
    assert engine.store.get("case-g").bugs[0].fix.publish is None  # type: ignore[union-attr]


def test_pull_request_follows_the_push_and_reports_the_link(engine: Engine, tmp_path: Path, box: FakeBox) -> None:
    accepted(engine, tmp_path)
    with pytest.raises(Stop) as e:
        engine.github_pull_request("case-g", "bug_1", "fix: x", "body", BRANCH)
    assert code_of(e) == "not_pushed"
    engine.github_push("case-g", "bug_1", BRANCH)
    with pytest.raises(Stop) as e2:
        engine.github_pull_request("case-g", "bug_1", "  ", "body", BRANCH)
    assert code_of(e2) == "invalid_title"
    with pytest.raises(Stop) as e3:
        engine.github_pull_request("case-g", "bug_1", "fix: x", "body", "timewraith/other")
    assert code_of(e3) == "confirm_mismatch"
    pub = engine.github_pull_request("case-g", "bug_1", "fix:\nx  y", "the body", BRANCH)
    assert pub.pr_url == "https://github.com/o/repo/pull/77" and pub.pr_number == 77
    call = next(c for c in box.calls if c["args"][-1] == publish.PR_SCRIPT)
    assert call["env"] == {"TW_UPSTREAM": "o/repo", "TW_BRANCH": BRANCH, "TW_TITLE": "fix: x y"}
    assert call["stdin"] == "the body"
    with pytest.raises(Stop) as e4:
        engine.github_pull_request("case-g", "bug_1", "fix: x", "body", BRANCH)
    assert code_of(e4) == "pr_exists"


def test_an_existing_pull_request_from_the_same_branch_is_not_duplicated(
    engine: Engine, tmp_path: Path, box: FakeBox
) -> None:
    accepted(engine, tmp_path)
    engine.github_push("case-g", "bug_1", BRANCH)
    box.pr = (14, "", "EXISTS https://github.com/o/repo/pull/5")
    with pytest.raises(Stop) as e:
        engine.github_pull_request("case-g", "bug_1", "fix: x", "body", BRANCH)
    assert code_of(e) == "pr_exists" and "pull/5" in str(e.value)


def test_device_output_and_token_scrubbing() -> None:
    out = "! First copy your one-time code: 24B0-096A\nOpen this URL to continue: https://github.com/login/device\n"
    assert gitbox.parse_device_output(out) == ("24B0-096A", "https://github.com/login/device")
    assert gitbox.parse_device_output("Logging in...") == (None, None)
    assert gitbox.scrub(f"token {TOKEN} and github_pat_{'B' * 30}") == "token *** and ***"


def test_the_scripts_cannot_reach_the_original_repository_with_a_push() -> None:
    pushes = [ln.strip() for ln in publish.PUSH_SCRIPT.splitlines() if "git push" in ln]
    assert pushes == ['git push -q fork "$TW_BRANCH"'], "the only push goes to the `fork` remote"
    assert 'git remote add fork "https://github.com/$ME/$TW_REPO.git"' in publish.PUSH_SCRIPT
