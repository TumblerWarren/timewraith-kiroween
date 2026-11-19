"""The investigation state machine. Kiro agents propose; this code decides every transition.

Flow (top of the Case Board):
  1 Repository              Wraith Director   code         clone, capability report
  2 Discovery               Bat Scout         Kiro agent   reviews scanned candidates
  3 Experiment design       Pumpkin Mechanic  Kiro agent   writes adapters, picks invariants
     (plan approval by the user, unless auto)
  4 Controlled execution    Spider Weaver     code         sweeps clock points in Docker, oracles mark violations
  5 Bug verification        Raven Archivist   Kiro agent   rules on violations repeated 3/3
  follow-on: Fix            Doctor Stitch     Kiro agent   patches, judged by eight gates
Every agent call ends in a DecisionRecord: the claim, the evidence that resolved, and the rule that decided.
"""

from __future__ import annotations

import difflib
import hashlib
import json
import re
import shlex
import shutil
import stat
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from . import agents as A
from . import (
    contribute,
    designsession,
    fixsession,
    github,
    installfix,
    installsession,
    intent,
    publish,
    python_adapter,
    python_crew,
    python_fix,
    resume,
    sandbox,
    verifysession,
)
from . import (
    environment as E,
)
from . import sweep as S
from .analyze import analyze, is_test_file
from .config import Settings
from .discovery import build_feature_map, source_candidate, source_inventory
from .fixsession import SessionRegistry
from .ingest import IngestError, clone, git, make_target, parse_issue_url, resolve_ref, validate_ref
from .models import (
    ATTENTION_PREFIX,
    LADDER,
    STAGE_PHASE,
    Actor,
    Bug,
    BugCategory,
    Candidate,
    CapabilityReport,
    CheckResult,
    ClockConfig,
    Contribution,
    CoverageRow,
    CreateInvestigation,
    DecisionRecord,
    EnvironmentCheck,
    EventKind,
    Evidence,
    EvidenceStatus,
    Experiment,
    Fix,
    FixAttempt,
    FixBranch,
    GateResult,
    IntendedFinding,
    Intent,
    InvariantUse,
    Investigation,
    OutputField,
    Phase,
    Publish,
    ReplayEvent,
    Retest,
    RunSummary,
    ServerClockReading,
    SweepResult,
    TestPlan,
    Version,
    Violation,
)
from .planning import build_test_plan
from .store import Store

VKey = tuple[str, str, str, str, str]  # experiment, invariant, zone, instant, failure kind

PROTECTED = re.compile(
    r"(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|\.github/.*|"
    r"(vitest|jest|vite|babel|eslint|prettier)\.config\.[^/]+|\.eslintrc[^/]*|__tw__/.*|\.tw/.*)$"
)
_REPAIR_PROMPT = (
    "\nUse run_command to diagnose tests and fixture failures in a writable copy. "
    "Use save_fixture to make a working fixture available to verification. "
    "Use write_runner_config when available if the runner setup needs repair. "
    "Apply verified source changes through your existing edit tools."
)
RUNNING = {"cloning", "analyzing", "discovering", "designing", "installing", "experimenting", "verifying", "fixing"}
_SRC_REF = re.compile(r"^(?P<p>[^:]+):(?P<a>\d+)(?:-(?P<b>\d+))?$")
INVARIANT_CATEGORY: dict[str, BugCategory] = {
    "local_date_matches": "midnight_rollover",
    "calendar_contract": "other_temporal",
    "instant_zone_independent": "timezone_conversion",
    "flag_monotonic": "expiry_boundary",
    "retry_cancelled": "other_temporal",
    "expiry_deadline": "expiry_boundary",
    "next_after_now": "dst_transition",
}


def _window_hint(inv: Investigation) -> str:
    window = inv.sweep_window
    return f"\nCase clock window: {S.iso(window.start_ms)} to {S.iso(window.end_ms)} (exclusive)." if window else ""


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Stop(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Engine:
    def __init__(self, s: Settings, store: Store) -> None:
        self.s = s
        self.store = store
        self._slots = threading.Semaphore(2)
        self._cancel: set[str] = set()
        self._lock = threading.Lock()
        self._working: set[str] = set()
        self._publishing: set[str] = set()  # "case/bug" with a GitHub step running
        self._repair_notes: dict[str, str] = {}  # experiment id -> why its last repair was rejected
        self._started: dict[str, float] = {}  # monotonic start of the current active stretch, per case
        self.sessions = SessionRegistry()  # live fix sessions, served by POST /internal/fix-tools/*

    # ---------- public API ----------

    def create(self, req: CreateInvestigation) -> Investigation:
        target = make_target(req.repository_url, req.ref)
        if req.mode != "open-hunt":
            if not req.issue_url:
                raise IngestError("issue_required", "Known issue and Blind hunt need an issue URL")
            parse_issue_url(req.issue_url, target.owner, target.repo)
        inv = Investigation(id=str(uuid.uuid4()), created_at=now_iso(), request=req, target=target)
        inv.sweep_window = S.future_window(datetime.fromisoformat(inv.created_at))
        rt = A.make_runtime(self.s, lambda *_: None)
        inv.runtime, inv.runtime_label = rt.name, rt.label
        self.store.save(inv)
        self._start(inv.id, self._phase_one)
        return inv

    def approve_plan(self, inv_id: str) -> Investigation:
        inv = self._get(inv_id)
        if inv.stage != "awaiting-plan-approval":
            raise Stop("not_awaiting_approval", "This investigation is not waiting for plan approval")
        self._event(inv, "watchtower-warden", "approval", "Plan approved by the user", data={"approval": "plan"})
        inv.stage = "installing"
        self.store.save(inv)
        self._start(inv_id, self._phase_two)
        return inv

    def decide_fix(self, inv_id: str, bug_id: str, accept: bool) -> Investigation:
        inv = self._get(inv_id)
        bug = next((b for b in inv.bugs if b.id == bug_id), None)
        if not bug or bug.fix.state != "verified":
            raise Stop("fix_not_verified", "Only a fix that passed all gates can be accepted or rejected")
        bug.fix.user_decision = "accepted" if accept else "rejected"
        if accept:
            self._branch_after_accept(inv, bug)
        self._event(
            inv,
            "watchtower-warden",
            "approval",
            f"Fix for {bug.title} {'accepted' if accept else 'rejected'} by the user",
            phase="fix",
            data={"approval": "fix", "bug_id": bug_id, "accepted": accept},
        )
        self.store.save(inv)
        return inv

    def _branch_after_accept(self, inv: Investigation, bug: Bug) -> None:
        """Accepting a verified fix makes its branch. A failure keeps the acceptance and says so, so the branch can
        be made again (POST .../branch) without losing the decision."""
        try:
            bug.fix.branch = self._make_branch(inv, bug)
        except (IngestError, OSError, ValueError) as e:
            note = f"The fix for {bug.id} was accepted, but its branch could not be made: {e}"
            inv.notes.append(note[:400])
            self._event(inv, "watchtower-warden", "note", note[:400], phase="fix")

    def make_branch(self, inv_id: str, bug_id: str) -> FixBranch:
        """(Re)make the local branch of an accepted fix."""
        inv = self._get(inv_id)
        bug = next((b for b in inv.bugs if b.id == bug_id), None)
        if not bug or bug.fix.state != "verified" or bug.fix.user_decision != "accepted":
            raise Stop("fix_not_accepted", "A branch is made for a fix that passed all gates and that you accepted")
        if inv_id in self._working:
            raise Stop("busy", "Wait for the case to stop before making the branch")
        try:
            bug.fix.branch = self._make_branch(inv, bug)
        except (IngestError, OSError, ValueError) as e:
            raise Stop("branch_failed", f"The branch could not be made: {e}") from e
        self.store.save(inv)
        return bug.fix.branch

    def branch_patch(self, inv_id: str, bug_id: str) -> Path:
        inv = self._get(inv_id)
        bug = next((b for b in inv.bugs if b.id == bug_id), None)
        if not bug or not bug.fix.branch or bug.fix.user_decision != "accepted":
            raise Stop("fix_not_accepted", "The branch exists after you accept a verified fix")
        path = Path(bug.fix.branch.patch_file)
        if not path.is_file():
            raise Stop("branch_missing", "The patch file is gone; make the branch again")
        return path

    # ---------- sharing an accepted fix on GitHub (publish.py; runs in the GitHub container) ----------

    def _bug(self, inv_id: str, bug_id: str) -> tuple[Investigation, Bug]:
        inv = self._get(inv_id)
        bug = next((b for b in inv.bugs if b.id == bug_id), None)
        if bug is None:
            raise Stop("not_found", "Bug not found")
        return inv, bug

    def github_preview(self, inv_id: str, bug_id: str) -> dict[str, Any]:
        inv, bug = self._bug(inv_id, bug_id)
        return publish.preview(inv, bug)

    def _publish_step(
        self, inv_id: str, bug_id: str, action: str, step: Callable[[Investigation, Bug], Publish]
    ) -> Bug:
        inv, bug = self._bug(inv_id, bug_id)
        key = f"{inv_id}/{bug_id}"
        with self._lock:
            if key in self._publishing:
                raise Stop("busy", "A GitHub step for this fix is already running")
            self._publishing.add(key)
        try:
            pub = step(inv, bug)
            self._event(inv, "doctor-stitch", "fix", f"{action}: {pub.pr_url or pub.fork + ' ' + pub.branch}",
                        phase="fix", data={"bug_id": bug.id, "fork": pub.fork, "pr_url": pub.pr_url})  # fmt: skip
            with self._lock:
                self.store.save(inv)
        finally:
            with self._lock:
                self._publishing.discard(key)
        return bug

    def github_push(
        self, inv_id: str, bug_id: str, confirm_branch: str, acknowledge_duplicates: bool = False
    ) -> Publish:
        def step(inv: Investigation, b: Bug) -> Publish:
            return publish.push(inv, b, confirm_branch, acknowledge_duplicates)

        bug = self._publish_step(inv_id, bug_id, "Pushed to your fork", step)
        assert bug.fix.publish
        return bug.fix.publish

    def github_update(self, inv_id: str, bug_id: str, title: str, body: str, confirm_branch: str) -> Publish:
        def step(inv: Investigation, b: Bug) -> Publish:
            return publish.update(inv, b, title, body, confirm_branch)

        bug = self._publish_step(inv_id, bug_id, "Updated the branch on your fork", step)
        assert bug.fix.publish
        return bug.fix.publish

    def github_pull_request(
        self,
        inv_id: str,
        bug_id: str,
        title: str,
        body: str,
        confirm_branch: str,
        acknowledge_duplicates: bool = False,
    ) -> Publish:
        def step(inv: Investigation, b: Bug) -> Publish:
            return publish.pull_request(inv, b, title, body, confirm_branch, acknowledge_duplicates)

        bug = self._publish_step(inv_id, bug_id, "Pull request opened", step)
        assert bug.fix.publish
        return bug.fix.publish

    def prepare_contribution(self, inv_id: str, bug_id: str) -> Contribution:
        """Check the accepted fix against the repository's own rules and rebuild its branch to follow them: rebased on
        the upstream's latest default branch, the test in the repository's test folder and style, formatted and linted
        with its own tools, its tests run, and a pull request text written in its own template. Nothing leaves the
        machine here; a fix that fails the repository's checks is not ready to share (publish.py enforces that)."""
        inv, bug = self._bug(inv_id, bug_id)
        if bug.fix.state != "verified" or bug.fix.user_decision != "accepted":
            raise Stop("fix_not_accepted", "Check a fix against the repository's rules after you accepted it")
        if bug.fix.branch is None:
            raise Stop("branch_missing", "The fix has no branch yet; make the branch first")
        ok, why = sandbox.docker_available()
        if not ok:
            raise Stop("sandbox_unavailable", f"The checks run in Docker: {why}")
        with self._lock:
            if inv_id in self._working or f"{inv_id}/{bug_id}" in self._publishing:
                raise Stop("busy", "The case is busy; wait for it to finish")
            self._working.add(inv_id)
        try:
            try:
                contribution = self._shape(inv, bug)
            except (IngestError, OSError, ValueError) as e:
                raise Stop("contribution_failed", f"The fix could not be checked against the repository: {e}") from e
            assert bug.fix.branch
            bug.fix.branch.contribution = contribution
            failed = [c.name for c in contribution.checks if not c.passed and not c.preexisting]
            self._event(inv, "doctor-stitch", "fix", f"Checked against {inv.target.owner}/{inv.target.repo}'s rules: "
                        + ("all checks pass" if not failed else f"{len(failed)} check(s) fail"), phase="fix",
                        data={"bug_id": bug.id, "failed": failed, "base": contribution.base})  # fmt: skip
            with self._lock:
                self.store.save(inv)
        finally:
            with self._lock:
                self._working.discard(inv_id)
        return contribution

    def generate_description(self, inv_id: str, bug_id: str) -> dict[str, str]:
        """The pull request title and description, written again in the repository's own style: its current pull
        request template and title convention, with the results of the last repository check. The sandbox does not
        run and nothing is saved or sent; the page shows the text for you to edit."""
        inv, bug = self._bug(inv_id, bug_id)
        branch = bug.fix.branch
        contribution = branch.contribution if branch else None
        attempt = next((a for a in reversed(bug.fix.attempts) if a.accepted_by_gates and a.diff.strip()), None)
        if contribution is None or attempt is None:
            raise Stop("not_prepared", "Check the fix against the repository's rules before writing its description")
        owner, repo = publish.upstream_of(inv)
        try:
            rules = contribute.read_rules(owner, repo, self.s.github_token)
        except (OSError, ValueError) as e:
            raise Stop("description_failed", f"The repository's pull request rules could not be read: {e}") from e
        sources = [p for p in re.findall(r"^\+\+\+ b/(.+)$", attempt.diff, re.M) if p != contribution.test_path]
        title, body, _ = _pr_text(
            bug,
            attempt,
            rules,
            sources,
            [*sources, contribution.test_path],
            contribution.test_path,
            contribution.checks,
        )
        return {"title": title, "body": body, "template": rules.summary.template_path or ""}

    def _shape(self, inv: Investigation, bug: Bug) -> Contribution:
        caps, fm, br = inv.capabilities, inv.feature_map, bug.fix.branch
        assert caps and fm and br
        attempt = next((a for a in reversed(bug.fix.attempts) if a.accepted_by_gates and a.diff.strip()), None)
        cand = next((c for c in fm.candidates if c.id == bug.candidate_id), None)
        if attempt is None or cand is None:
            raise ValueError("there is no verified patch to check")
        owner, repo = publish.upstream_of(inv)
        rules = contribute.read_rules(owner, repo, self.s.github_token)
        rs = rules.summary
        if rs.archived:
            raise Stop("repo_archived", f"{owner}/{repo} is archived or disabled: it takes no pull requests")
        ws = self._ws(inv)
        pinned = inv.target.revision or br.base
        if caps.test_runner == "pytest":
            test_path = bug.regression_test_path
            rs.test_dir, rs.test_pattern = str(Path(test_path).parent), "test_*.py"
            src_paths = [cand.unit.path]
            tip, py_checks, py_files = self._check_python_contribution(
                inv, bug, cand.unit.path, attempt, rs.default_branch
            )
            return self._commit_contribution(
                inv,
                bug,
                attempt,
                rules,
                tip,
                src_paths,
                test_path,
                py_files,
                py_checks,
                ["Python checks used the case's pinned dependencies."],
            )
        tracked = [p for p in git(ws, ["ls-files", "-z"]).split("\0") if p]
        test_path = contribute.test_location(tracked, cand.unit.path, bug.title, is_test_file)
        clocks = contribute.check_clocks(bug.clock, contribute.ci_timezone(rules.scripts))
        # The install was made in Linux, so `.bin` links do not resolve on a Windows host: look for the packages.
        have = {t: (ws / "node_modules" / pkg / "package.json").exists()
                for t, pkg in (("prettier", "prettier"), ("eslint", "eslint"), ("tsc", "typescript"))}  # fmt: skip
        checks: list[CheckResult] = []
        notes: list[str] = []
        final: dict[str, bytes] = {}
        experiments = inv.test_plan.experiments if inv.test_plan else []
        folders = [".tw", *sorted({Path(e.adapter_path).parent.as_posix() for e in experiments if e.adapter_path})]

        def sh(cmd: str) -> sandbox.Exec:
            return sandbox.run(self.s, ws, caps.node_version, cmd, network=False, timeout=self.s.test_timeout_s * 3)

        def tail(text: str) -> str:
            lines = [ln for ln in text.strip().splitlines() if ln.strip()]
            return "\n".join(lines[-6:])[:600]

        def write_test(relaxed: bool) -> None:
            (ws / test_path).parent.mkdir(parents=True, exist_ok=True)
            code = contribute.native_test(bug.regression_test, test_path, relaxed=relaxed)
            (ws / test_path).write_bytes(code.encode("utf-8"))

        with _aside(ws, folders):
            try:
                git(ws, ["fetch", "-q", "--depth", "1", "origin", rs.default_branch], timeout=self.s.clone_timeout_s)
                tip = git(ws, ["rev-parse", "FETCH_HEAD"]).strip()
                git(ws, ["checkout", "-q", "FETCH_HEAD", "--", "."])  # the upstream's latest code, our install kept
                if tip != pinned:
                    notes.append(
                        f"{rs.default_branch} moved on since the pinned commit; the fix was carried over to {tip[:12]}"
                    )
                if (ws / "package-lock.json").exists() and git(ws, ["diff", "--name-only", pinned, tip]).count(
                    "package"
                ):
                    notes.append("Dependencies changed upstream; the checks ran on the install of the pinned commit")
                numstat = git(ws, ["apply", "--numstat", "-"], stdin=attempt.diff)
                src_paths = [ln.split("\t", 2)[2] for ln in numstat.splitlines() if ln.count("\t") >= 2]
                base_suite = sandbox.run_suite(self.s, ws, caps)
                base_tsc = sh("node_modules/.bin/tsc --noEmit -p tsconfig.json").code if have["tsc"] else 0
                src_formatted = (
                    have["prettier"] and sh(f"node_modules/.bin/prettier --check {q_all(src_paths)}").code == 0
                )
                # 1. the new test must fail on the upstream's latest code without the fix
                relaxed = False
                write_test(relaxed)
                # in the bug's own zone: a DST-hour bug passes in UTC, which would read as "already fixed"
                before = sandbox.run_test_file(self.s, ws, caps, test_path, clocks[:1])[0]
                if before.outcome == "error":
                    relaxed = True
                    write_test(relaxed)
                    before = sandbox.run_test_file(self.s, ws, caps, test_path, clocks[:1])[0]
                if before.outcome == "passed":
                    raise Stop(
                        "already_fixed_upstream",
                        f"The test already passes on {owner}/{repo}'s {rs.default_branch} ({tip[:12]}): "
                        "the bug seems to be fixed upstream. Nothing to send",
                    )
                checks.append(
                    CheckResult(
                        name=f"The new test fails on {rs.default_branch} without the fix",
                        command=f"jest {test_path}",
                        passed=before.outcome == "assertion_failed",
                        detail=tail(before.failure or before.outcome),
                    )
                )
                # 2. the fix must still apply
                try:
                    git(ws, ["apply", "--whitespace=nowarn", "-"], stdin=attempt.diff)
                except IngestError as e:
                    raise Stop("rebase_conflict", f"The fix no longer applies to {rs.default_branch}: {e}") from e
                # 3. format and lint with the repository's own tools; the strict typing of the test may need relaxing
                owned = [test_path, *(src_paths if src_formatted else [])]
                for attempt_no in (1, 2):
                    if have["eslint"]:
                        _eslint_fix(ws, sh, [test_path, *src_paths], src_paths)
                    if have["prettier"]:
                        sh(f"node_modules/.bin/prettier --write {q_all(owned)}")
                    fmt = sh(f"node_modules/.bin/prettier --check {q_all(owned)}") if have["prettier"] else None
                    lint = sh(f"node_modules/.bin/eslint {q_all([test_path, *src_paths])}") if have["eslint"] else None
                    tsc = sh("node_modules/.bin/tsc --noEmit -p tsconfig.json") if have["tsc"] else None
                    good = all(r is None or r.code == 0 for r in (fmt, lint)) and (
                        tsc is None or tsc.code == 0 or base_tsc != 0
                    )
                    if good or relaxed or attempt_no == 2:
                        break
                    relaxed = True
                    write_test(relaxed)
                    notes.append("The test needed relaxed typing to pass the repository's strict TypeScript and ESLint")
                if relaxed and not any("relaxed" in n for n in notes):
                    notes.append("The test uses relaxed typing: the repository's strict TypeScript did not accept it")
                if not src_formatted and have["prettier"]:
                    notes.append(
                        "The source files are not Prettier-formatted upstream either, so only the test was formatted"
                    )
                for name, tool, res, base_ok in (
                    ("Prettier (the repository's formatter)", f"prettier --check {', '.join(owned)}", fmt, True),
                    ("ESLint (the repository's linter)", f"eslint {', '.join([test_path, *src_paths])}", lint, True),
                    ("TypeScript (type check)", "tsc --noEmit", tsc, base_tsc == 0),
                ):
                    if res is None:
                        notes.append(f"The repository has no {name.split(' ')[0]}; that check was skipped")
                        continue
                    checks.append(CheckResult(name=name, command=tool, passed=res.code == 0, detail=tail(res.out),
                                              preexisting=res.code != 0 and not base_ok))  # fmt: skip
                # 4. the tests, as the repository runs them
                afters = sandbox.run_test_file(self.s, ws, caps, test_path, clocks)  # bug's zone and the CI zone
                worst = next((a for a in afters if a.outcome != "passed"), afters[0])
                checks.append(
                    CheckResult(
                        name="The new test passes with the fix",
                        command=f"jest {test_path}",
                        passed=all(a.outcome == "passed" for a in afters),
                        detail=tail(worst.failure or worst.outcome),
                    )
                )
                suite = sandbox.run_suite(self.s, ws, caps)
                new = sorted(suite.failed_names - base_suite.failed_names)
                summary = f"New failures: {', '.join(new[:4])}" if new else f"{suite.total} tests, no new failures"
                checks.append(
                    CheckResult(
                        name="The repository's own test suite",
                        command="jest",
                        passed=not new and suite.total > 0,
                        detail=summary,
                    )
                )
                for path in [*src_paths, test_path]:
                    final[path] = (ws / path).read_bytes()
            finally:
                git(ws, ["reset", "-q", "--hard", "HEAD"])
                (ws / test_path).unlink(missing_ok=True)
        return self._commit_contribution(inv, bug, attempt, rules, tip, src_paths, test_path, final, checks, notes)

    def _commit_contribution(
        self,
        inv: Investigation,
        bug: Bug,
        attempt: FixAttempt,
        rules: contribute.Rules,
        tip: str,
        src_paths: list[str],
        test_path: str,
        final: dict[str, bytes],
        checks: list[CheckResult],
        notes: list[str],
    ) -> Contribution:
        br = bug.fix.branch
        assert br
        dest, rs, pinned = Path(br.path), rules.summary, inv.target.revision or br.base
        # The branch: one commit on the upstream's latest code, in the repository's own commit style.
        related = [f"#{bug.issue_match['number']}"] if bug.issue_match else []
        title, body, trimmed = _pr_text(bug, attempt, rules, src_paths, [*src_paths, test_path], test_path, checks)
        if trimmed:
            notes.append("The pull request text was too long to include the patch; it lists the files instead")
        git(dest, ["fetch", "-q", "--depth", "1", "origin", tip], timeout=self.s.clone_timeout_s)
        git(dest, ["checkout", "-q", "-B", br.name, tip])
        for path, data in final.items():
            (dest / path).parent.mkdir(parents=True, exist_ok=True)
            (dest / path).write_bytes(data)
        git(dest, ["add", "-A", "--", *final])
        message = contribute.commit_message(title, attempt.summary, attempt.root_cause, test_path, related)
        git(dest, ["-c", "user.name=TimeWraith", "-c", "user.email=timewraith@localhost", "-c", "commit.gpgsign=false",
                   "commit", "-q", "-m", message])  # fmt: skip
        commit = git(dest, ["rev-parse", "HEAD"]).strip()
        patch_file = Path(br.patch_file)
        patch_file.write_bytes(git(dest, ["format-patch", "-1", "--stdout", commit]).encode("utf-8", "surrogateescape"))
        br.base, br.commit = tip, commit
        br.files = git(dest, ["diff", "--name-only", f"{tip}..{commit}"]).split()
        return Contribution(prepared_at=now_iso(), rules=rs, base=tip, rebased=tip != pinned, notes=notes,
                            checks=checks, title=title, body=body, test_path=test_path)  # fmt: skip

    def _check_python_contribution(
        self, inv: Investigation, bug: Bug, source: str, attempt: FixAttempt, branch: str
    ) -> tuple[str, list[CheckResult], dict[str, bytes]]:
        ws = self._ws(inv)
        if not bug.contribution_test:
            raise ValueError("No portable pytest regression was verified")
        git(ws, ["fetch", "-q", "--depth", "1", "origin", branch], timeout=self.s.clone_timeout_s)
        tip = git(ws, ["rev-parse", "FETCH_HEAD"]).strip()
        with python_fix.checkout(ws, tip) as work:
            src = python_fix.safe_path(work, source)
            test = python_fix.safe_path(work, bug.regression_test_path)
            if test.exists() or not src.is_file():
                raise Stop("rebase_conflict", "Upstream moved the source or already uses the regression test path")

            def regression() -> str:
                return python_fix.test_result(
                    self, inv, work, bug, source, bug.contribution_test or "", bug.clock.instant, controlled=False
                )

            before = regression()
            if before == "passed":
                raise Stop("already_fixed_upstream", "The portable regression already passes on the upstream revision")
            try:
                git(work, ["apply", "--whitespace=nowarn", "-"], stdin=attempt.diff)
            except IngestError as exc:
                raise Stop("rebase_conflict", f"The Python patch no longer applies: {exc}") from exc
            test.parent.mkdir(parents=True, exist_ok=True)
            test.write_bytes(bug.contribution_test.encode("utf8"))
            after = regression()
            native = python_adapter.run(
                self.s,
                work,
                bug.regression_test_path,
                bug.clock.instant,
                bug.clock.time_zone,
                controlled=False,
                environment=inv.python_environment,
            )
            checks = [
                CheckResult(
                    name="Regression test fails on upstream",
                    command="pytest",
                    detail=before,
                    passed=before == "assertion_failed",
                ),
                CheckResult(
                    name="Regression test passes with fix",
                    command=f"pytest {bug.regression_test_path}",
                    detail=native.detail or after,
                    passed=after == "passed" and native.outcome == "passed" and native.passed == 1,
                ),
                python_fix.suite(self, inv, work, bug),
                *python_fix.static_checks(self, inv, work, source),
            ]
            return tip, checks, {source: src.read_bytes(), bug.regression_test_path: test.read_bytes()}

    def _make_branch(self, inv: Investigation, bug: Bug) -> FixBranch:
        """One commit on the pinned revision, in a clone of its own: the source change the gates tested plus the
        regression test (and the adapter, when the test needs it). Code makes it, with a fixed identity; nothing is
        pushed, and the clone's `origin` is the upstream repository so you can push the branch to your own fork."""
        attempt = next((a for a in reversed(bug.fix.attempts) if a.accepted_by_gates and a.diff.strip()), None)
        ex = next((e for e in (inv.test_plan.experiments if inv.test_plan else []) if e.id == bug.experiment_id), None)
        if attempt is None or not bug.regression_test.strip():
            raise ValueError("there is no verified patch or regression test to commit")
        ws = self._ws(inv)
        if not (ws / ".git").is_dir():
            raise ValueError("the case's workspace is gone, so there is nothing to clone")
        slug = ""
        for word in re.sub(r"[^a-z0-9]+", "-", bug.title.lower()).strip("-").split("-"):
            if len(slug) + len(word) + 1 > 40:
                break  # whole words only
            slug = f"{slug}-{word}" if slug else word
        name = f"timewraith/{bug.id}" + (f"-{slug}" if slug else "")
        base_dir = (self.s.branches / inv.id).resolve()
        dest = base_dir / inv.target.repo
        _force_rmtree(dest)
        base_dir.mkdir(parents=True, exist_ok=True)
        # `protocol.allow=never` in the hardened git flags would block a clone from a local folder; allow `file`.
        git(ws, ["-c", "protocol.file.allow=always", "clone", "-q", "--no-hardlinks", ws.as_posix(), str(dest)],
            timeout=self.s.clone_timeout_s)  # fmt: skip
        git(dest, ["remote", "set-url", "origin", inv.target.repository_url])
        base = git(dest, ["rev-parse", "HEAD"]).strip()
        git(dest, ["checkout", "-q", "-b", name])
        git(dest, ["apply", "--whitespace=nowarn", "-"], stdin=attempt.diff)
        paths = [bug.regression_test_path]
        (dest / bug.regression_test_path).parent.mkdir(parents=True, exist_ok=True)
        # Bytes, not write_text: on Windows write_text would turn the generated LF files into CRLF in a repository
        # that uses LF, and `git am` strips those CRs, so the patch file would not match the branch.
        (dest / bug.regression_test_path).write_bytes((bug.contribution_test or bug.regression_test).encode("utf-8"))
        if (
            ex
            and ex.adapter == "js_sweep"
            and ex.adapter_path
            and ex.adapter_code
            and f"{ex.id}.adapter" in bug.regression_test
        ):
            (dest / ex.adapter_path).parent.mkdir(parents=True, exist_ok=True)
            (dest / ex.adapter_path).write_bytes(ex.adapter_code.encode("utf-8"))
            paths.append(ex.adapter_path)
        git(dest, ["add", "-A", "--", *paths])
        git(dest, ["add", "-u"])  # the source files the patch changed
        gates = "\n".join(f"- {g.gate}: {'pass' if g.passed else 'FAIL'}" for g in attempt.gates)
        issue = f"\nPublic report: {bug.issue_match['url']}" if bug.issue_match else ""
        message = (
            f"fix: {bug.title}\n\n{attempt.summary}\n\nRoot cause: {attempt.root_cause}\n\n"
            f"Found and fixed by TimeWraith on {inv.target.owner}/{inv.target.repo}@{(inv.target.revision or '')[:12]}."
            f"{issue}\nRegression test: {bug.regression_test_path}\nGates:\n{gates}\n"
        )
        git(dest, ["-c", "user.name=TimeWraith", "-c", "user.email=timewraith@localhost", "-c", "commit.gpgsign=false",
                   "commit", "-q", "-m", message])  # fmt: skip
        commit = git(dest, ["rev-parse", "HEAD"]).strip()
        files = git(dest, ["diff", "--name-only", f"{base}..{commit}"]).split()
        mbox = git(dest, ["format-patch", "-1", "--stdout", commit])
        out = self.s.artifacts / inv.id
        out.mkdir(parents=True, exist_ok=True)
        patch_file = out / f"{bug.id}.branch.patch"
        patch_file.write_bytes(mbox.encode("utf-8", errors="surrogateescape"))
        self._event(inv, "doctor-stitch", "fix", f"Branch {name} made at {commit[:12]}", phase="fix",
                    data={"bug_id": bug.id, "branch": name, "path": str(dest)})  # fmt: skip
        return FixBranch(
            name=name,
            path=str(dest),
            base=base,
            commit=commit,
            files=files,
            created_at=now_iso(),
            patch_file=str(patch_file),
            upstream_url=inv.target.repository_url,
        )

    def cancel(self, inv_id: str) -> None:
        self._cancel.add(inv_id)
        inv = self._get(inv_id)
        if inv.stage in {"awaiting-plan-approval", "queued"}:
            inv.stage = "cancelled"
            self.store.save(inv)

    def delete(self, inv_id: str) -> None:
        """Remove a stopped case and only its own workspace and results."""
        with self._lock:
            inv = self._get(inv_id)
            if inv_id in self._working or inv.stage not in {"completed", "failed", "cancelled"}:
                raise Stop("case_busy", "Cancel the case and wait for it to stop before deleting it")
            paths = []
            for root in (self.s.workspaces, self.s.artifacts):
                base = root.resolve()
                target = (base / inv_id).resolve()
                if target.parent != base:
                    raise Stop("invalid_case_path", "The case files are outside their storage folder")
                paths.append(target)
            try:
                for path in paths:
                    if path.exists():
                        # Git object files can be read-only on Windows. Retry only those files,
                        # and never change permissions through a symlink or outside this case.
                        def remove_readonly(
                            fn: Callable[..., object], filename: str, error: BaseException, case_path: Path = path
                        ) -> None:
                            item = Path(filename)
                            if not isinstance(error, PermissionError) or item.is_symlink():
                                raise error
                            if not item.resolve().is_relative_to(case_path) or item.stat().st_mode & stat.S_IWUSR:
                                raise error
                            item.chmod(item.stat().st_mode | stat.S_IWUSR)
                            fn(filename)

                        shutil.rmtree(path, onexc=remove_readonly)
            except OSError as e:
                raise Stop(
                    "case_delete_failed", "Could not remove the case files. Close files in use and try again."
                ) from e
            self.store.delete(inv_id)
            self._cancel.discard(inv_id)

    def patch_file(self, inv_id: str, bug_id: str) -> Path:
        inv = self._get(inv_id)
        bug = next((b for b in inv.bugs if b.id == bug_id), None)
        if not bug or bug.fix.state != "verified" or bug.fix.user_decision != "accepted":
            raise Stop("fix_not_accepted", "The patch is available after the fix is verified and accepted")
        return self.s.artifacts / inv.id / f"{bug.id}.patch"

    def recover(self) -> None:
        for inv in self.store.recent(limit=500):
            if inv.stage in RUNNING or inv.stage == "queued":
                inv.stage, inv.error = "failed", "interrupted"
                self.store.save(inv)

    # ---------- plumbing ----------

    def _get(self, inv_id: str) -> Investigation:
        inv = self.store.get(inv_id)
        if not inv:
            raise Stop("not_found", "Investigation not found")
        return inv

    # ---------- continuing a case whose agents stopped ----------
    def unfinished(self, inv: Investigation) -> list[str]:
        """What the agents left undone in a finished case, in words. Empty while it runs or when nothing is left."""
        if inv.stage not in {"completed", "failed"} or inv.id in self._working:
            return []
        return resume.describe(resume.find_gaps(inv))

    def continue_case(self, inv_id: str) -> Investigation:
        """Run again the agent steps that could not run (the Kiro account was out of usage, its sign-in expired, the
        service was throttled), in the same case, with the account that is signed in now. Whatever finished stays."""
        from .crew import manager as crew_manager

        inv = self._get(inv_id)
        if inv_id in self._working or inv.stage not in {"completed", "failed"}:
            raise Stop("busy", "Wait for the case to stop before continuing it")
        gaps = resume.find_gaps(inv)
        if not gaps.any:
            raise Stop("nothing_to_continue", "The agents left nothing unfinished in this case")
        if not crew_manager.signed_in(fresh=True):
            raise Stop("not_signed_in", "Sign in to Kiro on the Crew page first, then continue the case")
        ok, why = sandbox.docker_available()
        if not ok:
            raise Stop("sandbox_unavailable", f"Execution not run: {why}")
        if not (self._ws(inv) / ".git").exists():
            raise Stop("workspace_missing", "This case's checkout is gone, so it cannot continue. Open the case again.")
        self._cancel.discard(inv_id)
        self._event(inv, "watchtower-warden", "stage", "Continuing: " + "; ".join(resume.describe(gaps)),
                    data={"continue": True})  # fmt: skip
        self._forget_stop(inv, gaps)
        inv.stage, inv.error = "experimenting", None
        self.store.save(inv)
        self._start(inv_id, lambda i: self._continue_run(i, gaps))
        return inv

    def _forget_stop(self, inv: Investigation, gaps: resume.Gaps) -> None:
        """Put the case back to where the agents stopped: the notes about the stop go (the run writes new ones if the
        problem is still there), and the steps that did not run become runnable again. The record of what happened
        stays in the decisions."""
        stale = (ATTENTION_PREFIX, "Inconclusive:", "No anomaly observed")
        inv.notes = [n for n in inv.notes if not (n.startswith(stale) or resume.STOPPED.search(n))]
        exps = {e.id: e for e in inv.test_plan.experiments} if inv.test_plan else {}
        for eid in gaps.repair:
            ex = exps[eid]
            ex.status, ex.failure_kind, ex.executability_reason = "designed", None, None
        for bug in inv.bugs:
            if bug.id in gaps.fix:
                bug.fix.state, bug.fix.label = "not-started", ""
        if inv.status == "inconclusive":
            inv.status = "observed-anomaly" if any(s.violations for s in inv.sweeps) else "planned"

    def _continue_run(self, inv: Investigation, gaps: resume.Gaps) -> None:
        t0 = time.monotonic()
        rt = self._runtime(inv)
        caps, plan = inv.capabilities, inv.test_plan
        assert caps and plan and caps.package_manager
        ws = self._ws(inv)
        baseline_keys: set[VKey] = set()
        for sweep in inv.sweeps:
            baseline_keys |= _keys(sweep.experiment_id, sweep.violations)
        by_id = {e.id: e for e in plan.experiments}

        # 1 experiments the agent never got to design, then every experiment whose adapter still needs its repair
        for eid in gaps.design:
            self._check(inv, t0)
            self._design(inv, rt, by_id[eid], feedback=None)
        todo = [by_id[i] for i in [*gaps.design, *gaps.repair] if by_id[i].status == "designed"]
        valid: list[Experiment] = []
        if todo:
            if not (ws / "node_modules").exists():
                self._stage(inv, "installing", "Installing dependencies in an isolated container")
                self._install(inv, rt, t0)
            self._stage(inv, "experimenting", "Checking the adapters the agents did not get to")
            env = inv.environment
            if env is None or env.status != "ok":
                if not self._environment(inv, rt, todo, t0):
                    self._run_health(inv)
                    self._finish(inv)
                    return
            elif env.runner_config:  # the profile found earlier is shared by the experiments that come back
                for e in todo:
                    e.runner_config = e.runner_config or env.runner_config
            self._validate(inv, rt, todo, t0)
            valid = [e for e in todo if e.status == "designed"]
            if valid:
                self._stage(inv, "verifying", "Sweeping, then repeating violations from clean containers")
                self._sweep_and_verify(inv, rt, valid, baseline_keys)

        # 2 violations nobody judged, in experiments that were swept before the agents stopped
        pending = {i: resume.unjudged(inv, by_id[i]) for i in gaps.judge}
        if any(pending.values()):
            self._stage(inv, "verifying", "Raven is judging the violations that were left unjudged")
            need = self.s.verify_session_s + 180
            for eid, violations in pending.items():
                for violation in violations:
                    if inv.budget.agent_calls + 1 >= self.s.max_agent_calls or not self._preflight(
                        inv, need, "judging the violations that were left"
                    ):
                        break
                    bug = self._verify(inv, rt, by_id[eid], violation)
                    if bug:
                        inv.bugs.append(bug)
                    self.store.save(inv)

        # 3 the planner's next round, then the fixes that were not attempted
        swept = [e for e in plan.experiments if e.status == "swept"]
        if gaps.planner or valid:
            first = 1 + max((i.round for i in inv.intents), default=0)
            self._plan_rounds(inv, rt, swept, baseline_keys, t0, first)
        inv.coverage = self._ledger(inv)
        self.store.save(inv)
        owed = [b for b in inv.bugs if b.fix.state == "not-started"]
        if owed:
            self._fix_bugs(inv, rt, owed[: self.s.max_bugs_to_fix], swept, baseline_keys, t0)
        if not inv.bugs and not inv.intended and not any(r.violations for r in inv.sweeps):
            self._report_no_anomaly(inv)
        self._run_health(inv)
        self._reveal(inv, rt)
        self._finish(inv)

    def _start(self, inv_id: str, fn: object) -> None:
        with self._lock:
            self._working.add(inv_id)

        def go() -> None:
            with self._slots:
                inv = self._get(inv_id)
                t0 = time.monotonic()
                self._started[inv_id] = t0
                try:
                    if inv_id in self._cancel:
                        raise Stop("cancelled", "Cancelled by the user")
                    fn(inv)  # type: ignore[operator]
                except (Stop, IngestError) as e:
                    code = e.code
                    inv.stage, inv.error = ("cancelled", None) if code == "cancelled" else ("failed", code)
                    inv.notes.append(str(e))
                    self._event(inv, "watchtower-warden", "stage", f"Stopped: {e}", data={"code": code})
                except Exception as e:  # noqa: BLE001 (record, never crash the server)
                    inv.stage, inv.error = "failed", "internal_error"
                    inv.notes.append(f"Internal error: {type(e).__name__}")
                    self._event(
                        inv, "watchtower-warden", "stage", "Stopped: internal error", data={"code": "internal_error"}
                    )
                finally:
                    self._started.pop(inv_id, None)
                    inv.budget.active_seconds += time.monotonic() - t0
                    with self._lock:
                        self.store.save(inv)
                        self._working.discard(inv_id)

        threading.Thread(target=go, daemon=True, name=f"inv-{inv_id[:8]}").start()

    def _ws(self, inv: Investigation) -> Path:
        return self.s.workspaces / inv.id / "repo"

    def _check(self, inv: Investigation, t0: float) -> None:
        if inv.id in self._cancel:
            raise Stop("cancelled", "Cancelled by the user")
        if inv.budget.active_seconds + (time.monotonic() - t0) > self.s.investigation_budget_s:
            raise Stop("budget_time", "Time budget of the investigation reached")

    def _remaining(self, inv: Investigation) -> float:
        """Seconds left of the case's time budget, counting the stretch that is running now."""
        running = time.monotonic() - self._started.get(inv.id, time.monotonic())
        return self.s.investigation_budget_s - inv.budget.active_seconds - running

    @staticmethod
    def _unrun_reasons(exps: list[Experiment], limit: int = 3) -> str:
        """Why experiments could not run, most common first, short enough to read in a note."""
        counts: dict[str, int] = {}
        for e in exps:
            if e.status == "adapter_invalid" and e.executability_reason:
                first = next((ln.strip() for ln in e.executability_reason.splitlines() if ln.strip()), "")
                key = re.sub(r"\s+", " ", first.split(";")[0])[:110]
                counts[key] = counts.get(key, 0) + 1
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:limit]
        return "Reasons: " + "; ".join(f"{why} (x{n})" for why, n in top) + "." if top else ""

    def _report_no_anomaly(self, inv: Investigation) -> None:
        """A case with no violations says how much it actually tested. Finding nothing after most experiments failed to
        run says nothing about the repository, so that case is inconclusive, not clean."""
        exps = inv.test_plan.experiments if inv.test_plan else []
        tried = [e for e in exps if e.status in {"swept", "adapter_invalid", "not_run"}]
        ran = [e for e in tried if e.status == "swept"]
        if tried and len(ran) / len(tried) < self.s.min_experiments_ran:
            inv.status = "inconclusive"
            text = (
                f"Inconclusive: only {len(ran)} of {len(tried)} experiments could run, so finding nothing proves "
                f"{self._unrun_reasons(tried)} Run the case again after the cause is fixed."
            )
        else:
            text = f"No anomaly observed: {len(ran)} of {len(tried)} experiments ran and none found a violation."
            if len(ran) < len(tried):
                text += f" {len(tried) - len(ran)} could not run. {self._unrun_reasons(tried)}"
        inv.notes.append(text.strip())
        self._event(inv, "raven-archivist", "note", text.strip(), phase="verification")

    ENV_FRAMING = (
        "This is the environment canary, not a real experiment: its adapter imports nothing from the repository. It "
        "fails because the test runner here does not collect or run a generated test file at all, so every experiment "
        "would fail the same way. Fix the runner setup, not the adapter: read the repository's runner configuration to "
        "see why the harness is not collected, and write a configuration that collects every generated file matching "
        "**/__tw__/*.tw.test.* (write_runner_config for Vitest). Experiments will share what you write."
    )

    def _canary_passes(self, inv: Investigation, canary: Experiment, env: EnvironmentCheck) -> bool:
        outputs, errors = self._sweep(inv, [canary], ["UTC"], "baseline")[canary.id]
        problems = S.baseline_problems(outputs, canary.fields) + errors[:2]
        if problems or not outputs.get("UTC"):
            env.attempts.append(re.sub(r"\s+", " ", "; ".join(problems))[:400] or "the canary produced no output")
            return False
        env.node, env.missing_globals = E.facts_from(outputs)
        return True

    def _environment(self, inv: Investigation, rt: A.AgentRuntime, designed: list[Experiment], t0: float) -> bool:
        """Can a generated test run in this repository at all? Found once, with a canary, before any experiment is
        judged: what stops one experiment (the runner does not collect the harness, a read-only folder) stops them all,
        so it is fixed once and the fix is shared. Order: the repository's own setup, a default profile, then an agent
        that reads the repository's runner configuration. If none works the case ends here, with the reason, instead of
        spending its budget on experiments that cannot run."""
        caps = inv.capabilities
        assert caps
        env = inv.environment = EnvironmentCheck()
        if caps.test_runner not in {"vitest", "jest"} or not designed or not designed[0].adapter_path:
            env.status = "skipped"
            return True
        ws, first = self._ws(inv), designed[0]
        adapter = Path(first.adapter_path or "")
        canary = E.canary_experiment(first.candidate_id, adapter.parent.as_posix(), adapter.suffix or ".js")
        E.write_canary(ws, canary, S.harness_code(canary.id, caps.test_runner), S.baseline_points(inv.sweep_window))
        self._event(inv, "watchtower-warden", "step", "Checking that a generated test can run in this repository",
                    phase="execution")  # fmt: skip
        try:
            ok = self._canary_passes(inv, canary, env)
            env.how = "the repository's own setup" if ok else ""
            if not ok and caps.test_runner == "vitest":
                canary.runner_config = E.write_default_profile(ws)
                ok = self._canary_passes(inv, canary, env)
                env.how = "the default runner profile" if ok else ""
            rounds = 0
            while not ok and getattr(rt, "supports_sessions", False) and rounds < self.s.environment_repair_rounds:
                rounds += 1
                self._check(inv, t0)
                self._workshop(inv, rt, canary, [self.ENV_FRAMING, *env.attempts[-1:]], t0)
                ok = self._canary_passes(inv, canary, env)
                env.how = f"an agent repair (round {rounds})" if ok else ""
            if ok:
                self._supply_temporal(inv, designed, canary, env)
        finally:
            E.remove_canary(ws, canary)
        if ok:
            env.status, env.runner_config = "ok", canary.runner_config
            env.polyfills = E.installed_polyfills(ws)
            if env.runner_config:  # the profile every experiment shares, unless the agent chose its own for one
                for e in designed:
                    e.runner_config = e.runner_config or env.runner_config
            self._decide(inv, agent="watchtower-warden", step="environment_check", subject="environment",
                         claim="Generated tests can run in this repository", evidence=[],
                         dropped=0, checks=[f"works through {env.how}", *(f"Node {env.node}" for _ in [0] if env.node),
                                            *(f"missing globals: {', '.join(env.missing_globals)}"
                                              for _ in [0] if env.missing_globals)],
                         decision="accepted", rule="A canary harness is collected and runs",
                         phase="execution")  # fmt: skip
            return True
        env.status, env.reason = "failed", env.attempts[-1] if env.attempts else "the canary did not run"
        self._decide(inv, agent="watchtower-warden", step="environment_check", subject="environment",
                     claim="Generated tests can run in this repository", evidence=[], dropped=0,
                     checks=env.attempts[-3:], decision="rejected",
                     rule="No generated test can run here, so no experiment would be a fair test",
                     phase="execution")  # fmt: skip
        for e in designed:
            e.status, e.failure_kind = "not_run", "environment"
            e.executability_reason = f"The test environment cannot run generated tests: {env.reason}"[:500]
        inv.status = "inconclusive"
        return False

    def _supply_temporal(
        self, inv: Investigation, designed: list[Experiment], canary: Experiment, env: EnvironmentCheck
    ) -> None:
        """Node 22 has no Temporal. When the code under test uses it, a test of that code cannot even build its input,
        so TimeWraith supplies it: a polyfill installed in `.tw/deps` (never in the repository, no scripts run) and
        loaded as the global in every test of the case. The canary runs again to prove it works, and the case says
        that Temporal here is a polyfill. If anything fails the case goes on without it and says why."""
        caps, fm = inv.capabilities, inv.feature_map
        assert caps
        ws = self._ws(inv)
        if E.POLYFILL_GLOBAL not in env.missing_globals or env.polyfills or not fm:
            return
        units = [c.unit.path for e in designed for c in fm.candidates if c.id == e.candidate_id]
        if not E.uses_global(ws, units):
            return
        package = self.s.temporal_polyfill
        name = E.package_name(package)
        self._event(inv, "watchtower-warden", "step", f"Supplying Temporal from {package}: this Node has none",
                    phase="execution")  # fmt: skip
        result = sandbox.install_polyfill(self.s, ws, caps.node_version, package)
        version = E.installed_version(ws, name) if result.code == 0 else None
        if version is None:
            env.attempts.append(f"Could not install {package}: {re.sub(r'\s+', ' ', result.out)[-200:]}")
            return
        E.write_preload(ws, name)
        if self._canary_passes(inv, canary, env) and E.POLYFILL_GLOBAL not in env.missing_globals:
            env.provided = [f"{E.POLYFILL_GLOBAL} from {name} {version}"]
            note = (
                f"Environment: this Node ({env.node}) has no Temporal, so TimeWraith supplied it from {name} "
                f"{version}, installed outside the repository. Results about code that uses Temporal depend on it."
            )
            inv.notes.append(note)
            self._event(inv, "watchtower-warden", "note", note, phase="execution", data={"provided": env.provided})
            return
        (ws / sandbox.PRELOAD).unlink(missing_ok=True)  # it did not work: run as before, with the global missing
        env.attempts.append(f"{name} {version} was installed but Temporal did not become available; not used")
        self._canary_passes(inv, canary, env)

    def _run_health(self, inv: Investigation) -> None:
        """Say plainly when a finished run had problems. A case can complete with no error and still have tested little:
        experiments that could not run, or an agent service that refused requests. Findings from what did run may be
        incomplete, and a case with no bug is not clean when most of its experiments never ran."""
        exps = inv.test_plan.experiments if inv.test_plan else []
        tried = [e for e in exps if e.status in {"swept", "adapter_invalid", "not_run"}]
        ran = [e for e in tried if e.status == "swept"]
        problems: list[str] = []
        by_cause = {"adapter": 0, "environment": 0, "throttled": 0}
        for e in tried:
            if e.status != "swept":
                by_cause[e.failure_kind or "adapter"] += 1
        inv.run_summary = RunSummary(
            experiments=len(tried),
            ran=len(ran),
            repairs_rejected=sum(1 for d in inv.decisions if d.step == "repair_adapter" and d.decision == "rejected"),
            environment_check=inv.environment.status if inv.environment else "skipped",
            **by_cause,
        )
        env = inv.environment
        if env is not None and env.status == "failed":
            problems.append(f"No generated test could run in this repository: {env.reason}. No experiment was run.")
        elif tried and len(ran) < len(tried):
            causes = ", ".join(f"{n} {k}" for k, n in by_cause.items() if n)
            problems.append(
                f"{len(tried) - len(ran)} of {len(tried)} experiments could not run ({causes}). "
                f"{self._unrun_reasons(tried)}"
            )
        refused = sum(
            1
            for d in inv.decisions
            if d.step == "repair_adapter"
            and d.decision == "not_run"
            and any("agent was unavailable" in c for c in d.checks)
        )
        if refused:
            problems.append(
                f"The agent service refused {refused} repair request(s), usually because it is throttled; "
                "run the case again later."
            )
        if problems and not any(n.startswith(ATTENTION_PREFIX) for n in inv.notes):
            inv.notes.append(
                ATTENTION_PREFIX + " ".join(problems).strip() + " Results from what did run may be incomplete."
            )
            self._event(inv, "watchtower-warden", "note", inv.notes[-1], phase="verification", data={"attention": True})
        if not inv.bugs and tried and len(ran) / len(tried) < self.s.min_experiments_ran:
            inv.status = "inconclusive"

    def _unit_problems(self, inv: Investigation, ex: Experiment) -> list[str]:
        """An adapter has to run the code it says it tests. One that passes its baseline by testing some other function
        would put its findings under the wrong candidate."""
        fm = inv.feature_map
        cand = next((c for c in fm.candidates if c.id == ex.candidate_id), None) if fm else None
        if cand is None or ex.id == E.CANARY_ID or not ex.adapter_path or not ex.adapter_code:
            return []
        return E.unit_problem(self._ws(inv), ex.adapter_path, ex.adapter_code, cand.unit.path)

    def _repair_skipped(self, inv: Investigation, ex: Experiment, why: str) -> None:
        """A repair that could not start is on the record: otherwise the experiment just ends up invalid."""
        if E.is_throttled(why):
            ex.failure_kind = "throttled"
        self._decide(inv, agent="pumpkin-mechanic", step="repair_adapter", subject=ex.id, claim=ex.claim or "",
                     evidence=[], dropped=0, checks=[f"Repair not started: {why}"], decision="not_run",
                     rule="The baseline check decides on the adapter as it stands", phase="execution")  # fmt: skip

    def _preflight(self, inv: Investigation, need_s: float, what: str) -> bool:
        """Start a step only if the time left covers it. Otherwise the case wraps up: it says once what was not
        started, and the caller skips the step instead of failing the case halfway through."""
        left = self._remaining(inv)
        if left >= need_s:
            return True
        note = f"Wrap-up: {what} not started; {max(0, int(left // 60))} min of the time budget left, it needs up to " \
               f"{int(need_s // 60)} min"  # fmt: skip
        if note not in inv.notes:
            inv.notes.append(note)
            self._event(inv, "watchtower-warden", "note", note, data={"wrap_up": True})
        return False

    def _stage(self, inv: Investigation, stage: str, text: str) -> None:
        inv.stage = stage  # type: ignore[assignment]
        inv.phase = STAGE_PHASE[stage]
        self._event(inv, "watchtower-warden", "stage", text, data={"stage": stage, "phase": inv.phase})
        self.store.save(inv)

    def _raise_status(self, inv: Investigation, status: EvidenceStatus) -> None:
        """The ladder rank never decreases (frontend rule)."""
        if inv.status not in LADDER or LADDER.index(status) > LADDER.index(inv.status):
            inv.status = status

    def _event(
        self,
        inv: Investigation,
        actor: Actor,
        kind: EventKind,
        text: str,
        *,
        phase: Phase | None = None,
        version: str | None = None,
        clock: ServerClockReading | None = None,
        evidence: dict[str, str] | None = None,
        check: dict[str, str] | None = None,
        data: dict[str, object] | None = None,
    ) -> None:
        with self._lock:
            seq = self.store.next_seq(inv.id)
            created = datetime.fromisoformat(inv.created_at.replace("Z", "+00:00"))
            offset = int((datetime.now(UTC) - created).total_seconds() * 1000)
            prev = self.store.events(inv.id, after=seq - 2)
            if prev:
                offset = max(offset, prev[-1].tOffsetMs + 1)
            ev = ReplayEvent(
                id=f"e{seq + 1:03d}",
                seq=seq,
                tOffsetMs=offset,
                actor=actor,
                kind=kind,
                phase=phase or STAGE_PHASE.get(inv.stage, "repository"),
                text=text,
                status=inv.status,
                versionId=version or (inv.versions[0].id if inv.versions else "pending"),
                serverClock=clock or "not controlled",
                evidence=evidence,
                check=check,
                data=data,
            )
            self.store.add_event(inv.id, ev)

    def _agent(
        self, inv: Investigation, rt: A.AgentRuntime, agent: str, step: str, prompt: str, schema: type[A.T]
    ) -> A.T:
        if inv.budget.agent_calls >= self.s.max_agent_calls:
            raise A.AgentUnavailable("Agent call budget reached")
        inv.budget.agent_calls += 1
        waits = list(self.s.throttle_waits_s)
        while True:
            try:
                return rt.call(agent, step, prompt, schema)
            except A.AgentQuotaReached as e:
                self._quota_note(inv, str(e))
                raise
            except A.AgentUnavailable as e:
                if not waits or not E.is_throttled(str(e)):
                    raise
                self._wait(inv, waits.pop(0), f"{agent} {step}")

    def _wait(self, inv: Investigation, seconds: int, what: str) -> None:
        """The agent service said it is busy: wait, then ask again. A throttle is not a failed attempt, and the wait
        stays in view of the case page, which shows it as the latest activity."""
        self._event(
            inv, "watchtower-warden", "note", f"The agent service is busy; waiting {seconds}s before {what} tries again"
        )
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if inv.id in self._cancel:
                raise Stop("cancelled", "Cancelled by the user")
            time.sleep(min(1.0, max(0.0, end - time.monotonic())))

    def _quota_note(self, inv: Investigation, message: str = A.QUOTA_MESSAGE) -> None:
        """Say once, plainly, that the agents stopped because the Kiro account is out of usage."""
        if message not in inv.notes:
            inv.notes.append(message)
            self._event(inv, "watchtower-warden", "note", message)

    def _runtime(self, inv: Investigation) -> A.AgentRuntime:
        return A.make_runtime(
            self.s,
            lambda agent, step, outcome, detail: self.store.audit(inv.id, now_iso(), agent, step, outcome, detail),
        )

    # ---------- decision records and evidence ----------

    def _decide(
        self,
        inv: Investigation,
        *,
        agent: Actor,
        step: str,
        subject: str,
        claim: str,
        evidence: list[Evidence],
        dropped: int,
        checks: list[str],
        decision: str,
        rule: str,
        phase: Phase | None = None,
    ) -> DecisionRecord:
        rec = DecisionRecord(
            id=f"dec_{len(inv.decisions) + 1:03d}",
            at=now_iso(),
            phase=phase or STAGE_PHASE.get(inv.stage, "repository"),
            agent=agent,
            step=step,
            runtime=inv.runtime,
            subject=subject,
            claim=claim,
            evidence=evidence,
            dropped_evidence=dropped,
            checks=checks,
            decision=decision,  # type: ignore[arg-type]
            rule=rule,
        )
        inv.decisions.append(rec)
        verb = {"accepted": "accepted", "rejected": "rejected", "not_run": "not run"}[decision]
        self._event(inv, agent, "decision", f"{step}: {verb}. {rule}", phase=rec.phase, data=rec.model_dump())
        return rec

    def _evidence(
        self,
        inv: Investigation,
        items: list[Evidence],
        *,
        signals: set[str] | None = None,
        points: set[str] | None = None,
        issues: set[int] | None = None,
    ) -> tuple[list[Evidence], int]:
        """Keep only evidence that resolves against real data; return (kept, dropped count)."""
        ws = self._ws(inv)
        kept: list[Evidence] = []
        for e in items:
            ok = False
            if e.kind == "signal":
                ok = signals is not None and e.ref in signals
            elif e.kind == "invariant":
                ok = e.ref in S.INVARIANTS
            elif e.kind == "point":
                ok = points is not None and e.ref in points
            elif e.kind == "issue":
                ok = issues is not None and e.ref.lstrip("#").isdigit() and int(e.ref.lstrip("#")) in issues
            elif e.kind == "source":
                ok = _source_ok(ws, e.ref)
            elif e.kind in {"test", "doc"}:
                m = _SRC_REF.match(e.ref.strip())
                path = m.group("p").replace("\\", "/").lstrip("/") if m else ""
                right_kind = is_test_file(path) if e.kind == "test" else intent.is_doc_file(path)
                ok = right_kind and _source_ok(ws, e.ref) and not ("/__tw__/" in f"/{path}" or path.startswith(".tw/"))
            if ok:
                kept.append(e)
        return kept, len(items) - len(kept)

    # ---------- phase one: repository, discovery, design ----------

    def _phase_one(self, inv: Investigation) -> None:
        t0 = time.monotonic()
        rt = self._runtime(inv)
        req, tgt = inv.request, inv.target
        self._stage(inv, "cloning", f"Cloning {tgt.owner}/{tgt.repo} at {tgt.ref}")
        tgt.revision = resolve_ref(tgt, self.s.clone_timeout_s)
        ws = self._ws(inv)
        if ws.exists():
            shutil.rmtree(ws)
        clone(tgt, ws, self.s.clone_timeout_s, self.s.max_workspace_mb, self.s.max_files)
        inv.versions = [
            Version(
                id=f"rev-{tgt.revision[:12]}", label=f"{tgt.owner}/{tgt.repo} @ {tgt.revision[:12]}", role="under-test"
            )
        ]
        self._event(
            inv, "wraith-director", "plan", f"Case opened on {tgt.owner}/{tgt.repo} @ {tgt.revision[:12]} ({req.mode})"
        )

        self._stage(inv, "analyzing", "Reading manifests, lockfiles and test setup")
        inv.capabilities = caps = analyze(ws)
        self._event(
            inv,
            "wraith-director",
            "capability",
            "Capability report ready",
            data={"items": [i.model_dump() for i in caps.items]},
        )
        js_unsupported = any(i.id == "language.js_ts" and i.status == "unsupported" for i in caps.items)
        if caps.test_runner != "pytest" and js_unsupported:
            python = any(i.id == "language.python" for i in caps.items)
            inv.notes.append(
                "Python detected; no pytest files found"
                if python
                else "Repository language is not supported in this version; no experiments planned"
            )
            self._finish(inv)
            return

        hints = [t for t in re.split(r"\W+", req.area or "") if t]
        if req.mode != "open-hunt" and req.issue_url:
            num = parse_issue_url(req.issue_url, tgt.owner, tgt.repo)
            try:
                issue = github.get_issue(tgt.owner, tgt.repo, num, self.s.github_token)
            except OSError as e:
                raise Stop("issue_fetch_failed", "Could not read the issue from GitHub") from e
            if req.mode == "known-issue":
                hints += [t for t in re.split(r"\W+", issue["title"]) if len(t) > 3]
            else:
                self._event(inv, "two-faced-jack", "note", "Blind hunt: the issue is sealed until the reveal")
            (self.s.artifacts / inv.id).mkdir(parents=True, exist_ok=True)
            (self.s.artifacts / inv.id / "issue.txt").write_text(
                f"#{issue['number']} {issue['title']}\n\n{issue['body']}", encoding="utf-8"
            )

        # 2 Discovery
        if caps.test_runner == "pytest":
            self._stage(inv, "discovering", "Bat is reading Python source for temporal behavior")
            try:
                python_crew.plan_case(self, inv, rt)
            except A.AgentUnavailable as exc:
                inv.notes.append(str(exc))
            if not inv.test_plan or not inv.test_plan.experiments:
                inv.status = "inconclusive"
                inv.notes.append("No source-based Python experiment was proposed")
                self._finish(inv)
                return
        else:
            self._stage(inv, "discovering", "Searching the source for time-sensitive code")
            fm = build_feature_map(ws, self.s.max_parse_bytes, hints)
            inv.feature_map = fm
            self._event(
                inv,
                "bat-scout",
                "explore",
                f"{len(fm.signals)} time signals in {len({s.path for s in fm.signals})} files; "
                f"{len(fm.candidates)} candidates (not proven bugs); "
                f"{fm.skipped.get('test_files', 0)} test files recognised and left out as targets",
                data={"top": [{"id": c.id, "title": c.title, "score": c.score} for c in fm.candidates[:10]]},
            )
            self._check(inv, t0)
            self._review(inv, rt)

            # 3 Experiment design
            self._stage(inv, "designing", "Designing controlled-clock experiments")
            inv.test_plan = plan = build_test_plan(fm.candidates, caps, self.s.max_experiment_candidates)
            for ex in plan.experiments:
                self._check(inv, t0)
                if ex.executability != "not_controllable":
                    self._design(inv, rt, ex, feedback=None)
            designed = [e for e in plan.experiments if e.status == "designed"]
            self._event(
                inv,
                "pumpkin-mechanic",
                "plan",
                f"{len(designed)} of {len(plan.experiments)} experiments designed; "
                f"{sum(e.point_count for e in designed)} clock points planned (planned, not run)",
                data={"designed": len(designed)},
            )
        if req.auto:
            self._phase_two(inv, t0)
        else:
            inv.stage = "awaiting-plan-approval"
            self._event(
                inv,
                "watchtower-warden",
                "approval",
                "Waiting for the user to approve the plan",
                data={"approval": "plan", "pending": True},
            )

    def _review(self, inv: Investigation, rt: A.AgentRuntime) -> None:
        fm = inv.feature_map
        assert fm
        top = fm.candidates[: self.s.max_review_candidates]
        sig = {s.id: s for s in fm.signals}
        payload = [
            {
                "candidate_id": c.id,
                "unit": c.unit.name,
                "path": c.unit.path,
                "categories": c.bug_categories,
                "score": c.score,
                "signals": [
                    {"id": i, "kind": sig[i].kind, "line": sig[i].line, "excerpt": sig[i].excerpt}
                    for i in c.signal_ids[:8]
                ],
            }
            for c in top
        ]
        ws = self._ws(inv)
        paths = source_inventory(ws, self.s.max_parse_bytes)
        focus = A._data("case focus", inv.request.area or "")
        if inv.request.mode == "known-issue":
            focus += A._data("reported behavior", (self.s.artifacts / inv.id / "issue.txt").read_text("utf8")[:5000])
        prompt = (
            A.prompt_review(payload) + "\nSelect inspect_paths from the source inventory to investigate "
            "calendar behavior the scanner may have missed. You may select files even when candidates is empty. "
            f"The candidates shown are the top {len(top)} of {len(fm.candidates)} by a keyword score, which is only a "
            "hint: prefer the code whose behaviour matters most to callers, and use inspect_paths to reach what the "
            f"score ranked lower. {fm.skipped.get('test_files', 0)} test files were recognised and left out; they are "
            "evidence of intended behaviour, never the code under test."
            + A._data("source inventory", "\n".join(paths))
            + focus
        )
        try:
            out = self._agent(inv, rt, "bat-scout", "review_candidates", prompt, A.ReviewOut)
        except A.AgentUnavailable as e:
            for cand in top:
                if cand.score >= 3:
                    cand.selected, cand.rationale = True, "Agent review not run; selected by deterministic score"
            self._decide(
                inv,
                agent="bat-scout",
                step="review_candidates",
                subject="feature-map",
                claim="Agent review not run",
                evidence=[],
                dropped=0,
                checks=[str(e)],
                decision="not_run",
                rule="Deterministic fallback: candidates with score ≥ 3 are kept",
            )
            return
        known: dict[str, Candidate] = {x.id: x for x in top}
        for item in out.items:
            c = known.get(item.candidate_id)
            if c is None:
                self._decide(
                    inv,
                    agent="bat-scout",
                    step="review_candidates",
                    subject=item.candidate_id[:40],
                    claim=item.claim,
                    evidence=[],
                    dropped=len(item.evidence),
                    checks=["candidate id not in the feature map"],
                    decision="rejected",
                    rule="Claims about unknown candidates are ignored",
                )
                continue
            kept, dropped = self._evidence(inv, item.evidence, signals=set(c.signal_ids))
            checks = [f"{len(kept)} evidence item(s) resolved, {dropped} removed", f"confidence {item.confidence}"]
            if item.keep and not any(e.kind == "signal" for e in kept):
                self._decide(
                    inv,
                    agent="bat-scout",
                    step="review_candidates",
                    subject=c.id,
                    claim=item.claim,
                    evidence=kept,
                    dropped=dropped,
                    checks=checks,
                    decision="rejected",
                    rule="A kept candidate must cite at least one of its own signals",
                )
                continue
            c.selected = item.keep
            c.rationale = item.claim
            self._decide(
                inv,
                agent="bat-scout",
                step="review_candidates",
                subject=c.id,
                claim=item.claim,
                evidence=kept,
                dropped=dropped,
                checks=checks,
                decision="accepted",
                rule="Kept for an experiment" if item.keep else "Dropped by Bat Scout",
            )

        selected = [p for p in dict.fromkeys(out.inspect_paths) if p in paths]
        if selected:
            self._inspect_js_sources(inv, rt, selected, focus)

    def _inspect_js_sources(self, inv: Investigation, rt: A.AgentRuntime, paths: list[str], context: str) -> None:
        fm = inv.feature_map
        assert fm
        sources = {p: (self._ws(inv) / p).read_text("utf8", errors="replace").splitlines() for p in paths}
        excerpts = {p: "\n".join(lines)[:10000].splitlines() for p, lines in sources.items()}
        prompt = (
            "For each new calendar or timekeeping hypothesis, cite the file, line, and exact code from "
            "the supplied numbered passages. Explain the expected behavior. Return an empty list if none. "
            "Order leads by priority for testing.\n"
            + context
            + "\n".join(A._data(p, A.numbered("\n".join(lines))) for p, lines in excerpts.items())
        )
        try:
            result = self._agent(inv, rt, "bat-scout", "inspect_js_sources", prompt, A.SourceLeads)
        except A.AgentUnavailable as exc:
            self._event(inv, "bat-scout", "note", f"Source inspection stopped: {exc}")
            return
        prioritized: list[Candidate] = []
        for lead in result.items:
            lines = sources.get(lead.path, [])
            quote = lead.quote.strip()
            visible = excerpts.get(lead.path, [])
            if (
                lead.line > len(visible)
                or not quote
                or quote not in visible[lead.line - 1]
                or not lead.hypothesis.strip()
                or not lead.expectation.strip()
            ):
                self._decide(
                    inv,
                    agent="bat-scout",
                    step="inspect_js_sources",
                    subject=lead.path,
                    claim=lead.hypothesis,
                    evidence=[],
                    dropped=1,
                    checks=[],
                    decision="rejected",
                    rule="Unresolved source lead",
                )
                continue
            claim = f"{lead.hypothesis.strip()} Expected behavior: {lead.expectation.strip()}"
            candidate = source_candidate(lead.path, lines, lead.line, claim, lead.category)
            if any(c.id == candidate.id for c in prioritized):
                continue
            match = next((c for c in fm.candidates if c.id == candidate.id), None)
            if match:
                candidate = match
                candidate.selected, candidate.rationale = True, claim
                fm.candidates.remove(candidate)
            prioritized.append(candidate)
            self._decide(
                inv,
                agent="bat-scout",
                step="inspect_js_sources",
                subject=candidate.id,
                claim=claim,
                evidence=[Evidence(kind="source", ref=f"{lead.path}:{lead.line}", why=quote)],
                dropped=0,
                checks=["Quote matched the inspected source line"],
                decision="accepted",
                rule="Selected by Bat for experiment design",
            )
        fm.candidates[:0] = prioritized

    def _design(
        self, inv: Investigation, rt: A.AgentRuntime, ex: Experiment, feedback: str | None, focus: str | None = None
    ) -> None:
        caps, fm = inv.capabilities, inv.feature_map
        assert caps and fm and caps.test_runner
        ws = self._ws(inv)
        c = next(x for x in fm.candidates if x.id == ex.candidate_id)
        src = ws / c.unit.path
        source = src.read_text(encoding="utf-8", errors="ignore")
        ext = ".ts" if src.suffix in {".ts", ".tsx", ".mts", ".cts"} else ".js"
        folder = Path(c.unit.path).parent / "__tw__"
        adapter_rel = (folder / f"{ex.id}.adapter{ext}").as_posix()
        harness_rel = (folder / f"{src.stem}.{ex.id}.tw.test{ext}").as_posix()
        issue = None
        if inv.request.mode == "known-issue":
            issue = (self.s.artifacts / inv.id / "issue.txt").read_text(encoding="utf-8")
        tracked = git(ws, ["ls-files", "-z"]).split("\0")
        name = _expectation_subject(c)
        snippets = intent.find(ws, tracked, name, c.unit.path, "UTC")
        expectations = {
            f"{sn.path}:{sn.start}-{sn.end}": sn for sn in snippets if re.search(rf"\b{re.escape(name)}\b", sn.text)
        }
        try:
            out = self._agent(
                inv,
                rt,
                "pumpkin-mechanic",
                "design_experiment",
                A.prompt_design(
                    unit=c.unit.name,
                    path=c.unit.path,
                    source=source,
                    runner=caps.test_runner,
                    adapter_path=adapter_rel,
                    import_path=f"../{src.stem}",
                    catalog=S.catalog_text() + _window_hint(inv),
                    claim=c.rationale,
                    issue=issue,
                    expectations="\n\n".join(sn.render() for sn in expectations.values()),
                    feedback=feedback,
                    focus=focus,
                ),
                A.AdapterOut,
            )
        except A.AgentUnavailable as e:
            ex.status, ex.executability_reason = "not_designed", f"Experiment not designed: {e}"
            self._decide(
                inv,
                agent="pumpkin-mechanic",
                step="design_experiment",
                subject=ex.id,
                claim="Experiment not designed",
                evidence=[],
                dropped=0,
                checks=[str(e)],
                decision="not_run",
                rule="No adapter, no experiment: the stub never writes one",
                phase="design",
            )
            return
        kept, dropped = self._evidence(inv, out.evidence)
        checks = [f"{len(kept)} evidence item(s) resolved, {dropped} removed"]
        invs, inv_checks = _derive_invariants(out.invariants, out.fields, out.adapter_code)
        checks += inv_checks
        for rule in invs:
            if rule.expectation_ref and rule.expectation_ref not in expectations:
                checks.append(f"Dropped unrecognized expectation citation for {rule.id}")
                rule.expectation_ref = None
            if rule.id == "expiry_deadline" and rule.expired_at_deadline is not None and not rule.expectation_ref:
                rule.expired_at_deadline = None
                checks.append("Expiry at the exact deadline left unspecified: no verified expectation citation")
        invs = [rule for rule in invs if rule.id != "calendar_contract" or rule.expectation_ref]
        anchors = []
        for a in out.anchors:
            ms = S.parse_instant(a)
            if ms is None:
                checks.append(f"dropped anchor {a[:40]!r}: not an ISO instant with offset in 2000-2100")
            elif inv.sweep_window and not inv.sweep_window.contains(ms):
                checks.append(f"Dropped anchor {a!r} outside the case window")
            else:
                anchors.append(ms)
        if not re.search(r"\brun\b", out.adapter_code):
            self._decide(
                inv,
                agent="pumpkin-mechanic",
                step="design_experiment",
                subject=ex.id,
                claim=out.claim,
                evidence=kept,
                dropped=dropped,
                checks=[*checks, "adapter does not define run()"],
                decision="rejected",
                rule="An adapter must export run(ctx)",
                phase="design",
            )
            ex.status = "adapter_invalid"
            return
        # A TypeScript adapter is agent-written test glue: keep the repository's strict typecheck (ts-jest, tsc in
        # an install script, the static_checks gate) from rejecting it over missing type annotations.
        adapter_code = out.adapter_code
        if ext == ".ts" and not any("@ts-nocheck" in ln for ln in adapter_code.splitlines()[:3]):
            adapter_code = "// @ts-nocheck\n" + adapter_code
        (ws / folder).mkdir(parents=True, exist_ok=True)
        (ws / adapter_rel).write_text(adapter_code, encoding="utf-8")
        (ws / harness_rel).write_text(S.harness_code(ex.id, caps.test_runner), encoding="utf-8")
        points = S.build_points(anchors, inv.sweep_window)
        if "expiry_trace" in out.fields and inv.sweep_window:
            points = {z: [t for t in times if t + 1001 < inv.sweep_window.end_ms] for z, times in points.items()}
        if "clock_jumps" in out.fields and inv.sweep_window:
            points = {z: [t for t in times if S.clock_jump_fits(inv.sweep_window, t)] for z, times in points.items()}
        if set(out.fields) <= {"after_cancel", "timeout_trace", "interval_trace", "expiry_trace", "clock_jumps"}:
            # Replay elapsed-time scenarios at representative dates in each zone.
            baselines = S.baseline_points(inv.sweep_window)
            for zone, times in points.items():
                selected = {times[0], times[len(times) // 2], times[-1]}
                selected.update(set(times).intersection([*anchors, *baselines.get(zone, [])]))
                points[zone] = sorted(selected)
        tw = ws / ".tw"
        tw.mkdir(exist_ok=True)
        (tw / f"points-{ex.id}.json").write_text(json.dumps(points), encoding="utf-8")
        (tw / f"baseline-{ex.id}.json").write_text(json.dumps(S.baseline_points(inv.sweep_window)), encoding="utf-8")
        ex.status, ex.claim, ex.fields, ex.invariants = "designed", out.claim, out.fields, invs
        ex.anchors = [S.iso(a) for a in anchors]
        ex.zones, ex.point_count = list(points), sum(len(v) for v in points.values())
        ex.adapter_path, ex.harness_path, ex.adapter_code = adapter_rel, harness_rel, adapter_code
        self._decide(
            inv,
            agent="pumpkin-mechanic",
            step="design_experiment",
            subject=ex.id,
            claim=out.claim,
            evidence=kept,
            dropped=dropped,
            checks=[
                *checks,
                f"invariants: {', '.join([*S.ALWAYS, *(i.id for i in invs)])}",
                f"{ex.point_count} clock points chosen by the harness",
            ],
            decision="accepted",
            phase="design",
            rule="Adapter accepted; invariants come from the fixed catalog and the harness picks the clock points",
        )

    # ---------- phase two: execution, verification, fix ----------

    def _sweep(
        self, inv: Investigation, exps: list[Experiment], zones: list[str], set_name: str = "points"
    ) -> dict[str, tuple[S.Outputs, list[str]]]:
        caps = inv.capabilities
        assert caps
        ws = self._ws(inv)
        configs = {e.harness_path: e.runner_config for e in exps if e.harness_path and e.runner_config}
        logs = sandbox.sweep(
            self.s,
            ws,
            caps,
            [e.harness_path or "" for e in exps],
            zones,
            set_name,
            **({"runner_configs": configs} if configs else {}),
        )
        result: dict[str, tuple[S.Outputs, list[str]]] = {}
        for e in exps:
            outputs: S.Outputs = {}
            errors: list[str] = []
            for z in zones:
                f = ws / ".tw" / "out" / f"{e.id}__{z.replace('/', '_')}.json"
                try:
                    outputs[z] = json.loads(f.read_text(encoding="utf-8"))
                except OSError, ValueError:
                    diagnostic = logs.get(f"{z}:{e.harness_path}", logs.get(z, ""))
                    diagnostic = re.sub(r"\x1b\[[0-9;]*m", "", diagnostic)
                    errors.append(f"{z}: no harness output. {diagnostic[:2000]}".strip())
            result[e.id] = (outputs, errors)
        return result

    def _run_python(self, inv: Investigation, rt: A.AgentRuntime, plan: TestPlan, t0: float) -> None:
        self._stage(inv, "installing", "Preparing the isolated Python 3.14 pytest worker")
        self._check(inv, t0)
        image = sandbox.prepare_pytest(self.s.install_timeout_s)
        if image.code:
            raise Stop("sandbox_unavailable", f"Could not prepare the pytest worker: {image.out[-500:]}")
        self._stage(inv, "experimenting", "Running repository pytest assertions at the planned clocks")
        for ex in plan.experiments:
            sweep = SweepResult(experiment_id=ex.id, points_run=0, zones=[])
            inv.sweeps.append(sweep)
            assert ex.harness_path
            for zone in ex.zones:
                for instant in ex.anchors:
                    self._check(inv, t0)
                    result = python_adapter.run(self.s, self._ws(inv), ex.harness_path, instant, zone)
                    sweep.pytest_results.append(result)
                    if result.outcome in {"failed", "passed"}:
                        sweep.points_run += 1
                        if zone not in sweep.zones:
                            sweep.zones.append(zone)
                    if result.outcome == "failed":
                        self._raise_status(inv, "observed-anomaly")
                    if result.outcome in {"blocked", "skipped"}:
                        sweep.errors.append(f"{zone} {instant}: {result.outcome}")
                    self._event(
                        inv,
                        "spider-weaver",
                        "step",
                        f"{ex.harness_path}: {result.outcome} at {instant} in {zone}",
                        data={"experiment_id": ex.id, "outcome": result.outcome},
                    )
                    self.store.save(inv)
            ex.status = "swept" if sweep.points_run else "not_run"
        results = [r for sweep in inv.sweeps for r in sweep.pytest_results]
        completed = sum(r.outcome in {"passed", "failed"} for r in results)
        failed = sum(r.outcome == "failed" for r in results)
        if not failed and completed < len(results):
            inv.status = "inconclusive"
        inv.notes.append(
            f"Python pytest executed {completed} of {len(results)} clock conditions. "
            f"{failed} had failing tests. Python failures require independent review."
        )
        self._reveal(inv, rt)
        self._finish(inv)

    def _phase_two(self, inv: Investigation, t0: float | None = None) -> None:
        t0 = t0 or time.monotonic()
        rt = self._runtime(inv)
        caps, plan = inv.capabilities, inv.test_plan
        assert caps and plan
        designed = [e for e in plan.experiments if e.status == "designed"]
        python_plan = caps.test_runner == "pytest" and any(e.adapter == "python_crew" for e in plan.experiments)
        if not designed and not python_plan:
            inv.notes.append("No experiments were designed, so nothing ran (Kiro agent runtime required)")
            self._finish(inv)
            return
        ok, why = sandbox.docker_available()
        if not ok:
            raise Stop("sandbox_unavailable", f"Execution not run: {why}")
        if caps.test_runner == "pytest":
            if python_plan:
                try:
                    python_crew.execute(self, inv, rt, t0)
                    if inv.bugs:
                        self._stage(inv, "fixing", "Doctor Stitch is preparing Python fixes")
                    for index, bug in enumerate(inv.bugs):
                        if index >= self.s.max_bugs_to_fix:
                            bug.fix = Fix(state="skipped", label="Fix budget reached")
                            continue
                        ex = next(e for e in plan.experiments if e.id == bug.experiment_id)
                        try:
                            python_fix.fix(self, inv, rt, bug, ex, t0)
                        except Stop as exc:
                            if exc.code != "budget_time":
                                raise
                            for pending in inv.bugs[index:]:
                                pending.fix.state, pending.fix.label = "skipped", "Fix time budget reached"
                            break
                        except (A.AgentUnavailable, OSError, ValueError, IngestError) as exc:
                            bug.fix.state, bug.fix.label = "no-safe-fix", f"Python fix incomplete: {exc}"
                        self.store.save(inv)
                except A.AgentUnavailable as exc:
                    inv.notes.append(str(exc))
                if inv.status == "planned":
                    inv.status = "inconclusive"
                self._reveal(inv, rt)
                self._finish(inv)
            else:
                self._run_python(inv, rt, plan, t0)
            return
        if not caps.package_manager:
            inv.notes.append("Execution not run: no lockfile, so the install is not reproducible")
            self._finish(inv)
            return
        # 4 Controlled execution
        self._stage(inv, "installing", "Installing dependencies in an isolated container")
        self._install(inv, rt, t0)
        self._check(inv, t0)
        self._stage(
            inv, "experimenting", "Checking the test environment, then the adapters, then sweeping clock points"
        )
        if not self._environment(inv, rt, designed, t0):
            self._run_health(inv)
            self._finish(inv)
            return
        self._validate(inv, rt, designed, t0)
        valid = [e for e in designed if e.status == "designed"]
        if not valid:
            inv.status = "inconclusive"
            why = self._unrun_reasons(designed)
            inv.notes.append(f"Inconclusive: no experiment ran cleanly at baseline, so no sweep was run. {why}")
            self._run_health(inv)
            self._finish(inv)
            return
        baseline_keys: set[VKey] = set()
        self._stage(inv, "verifying", "Sweeping, then repeating violations from clean containers")
        self._sweep_and_verify(inv, rt, valid, baseline_keys)
        # The planner reads the coverage ledger and sends the Crew in new directions until it finds none.
        self._plan_rounds(inv, rt, valid, baseline_keys, t0)
        inv.coverage = self._ledger(inv)
        self.store.save(inv)

        # Follow-on: Fix
        if inv.bugs:
            self._fix_bugs(inv, rt, inv.bugs[: self.s.max_bugs_to_fix], valid, baseline_keys, t0)
            for bug in inv.bugs[self.s.max_bugs_to_fix :]:
                bug.fix.state, bug.fix.label = "skipped", "Fix not attempted: fix budget reached"
        elif inv.intended:
            n = len(inv.intended)
            text = f"No bugs reproduced. {n} finding(s) are behaviour the repository documents as intended"
            inv.notes.append(text)
            self._event(inv, "raven-archivist", "note", text, phase="verification")
        elif not any(r.violations for r in inv.sweeps):
            self._report_no_anomaly(inv)
        self._run_health(inv)
        self._reveal(inv, rt)
        self._finish(inv)

    def _fix_bugs(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        bugs: list[Bug],
        valid: list[Experiment],
        baseline_keys: set[VKey],
        t0: float,
    ) -> None:
        """Doctor Stitch works on each bug in turn. Running out of time keeps the case: the bugs and their regression
        tests stand, and the ones not reached say so."""
        caps = inv.capabilities
        assert caps
        ws = self._ws(inv)
        self._stage(inv, "fixing", "Doctor Stitch is preparing fixes; every fix must pass eight gates")
        base_suite = sandbox.run_suite(self.s, ws, caps)
        base_static = sandbox.static_checks(self.s, ws, caps)
        try:
            for bug in bugs:
                self._check(inv, t0)
                self._fix(inv, rt, bug, valid, base_suite, base_static, baseline_keys, t0)
                self.store.save(inv)
        except Stop as e:
            if e.code != "budget_time":
                raise
            self._clean_tree(ws)
            for b in inv.bugs:
                if b.fix.state in {"not-started", "in-progress"}:
                    b.fix.state = "no-safe-fix" if b.fix.attempts else "skipped"
                    b.fix.label = "Fix not finished: time budget reached"
            inv.notes.append("The time budget ran out during the fix step; the reproduced bugs are kept")
            self._event(inv, "watchtower-warden", "note", "Time budget reached during the fix step", phase="fix")

    def _sweep_and_verify(
        self, inv: Investigation, rt: A.AgentRuntime, exps: list[Experiment], baseline_keys: set[VKey]
    ) -> None:
        """Sweep the experiments in every zone, record violations, and review representatives of each failure kind.
        `baseline_keys` collects every violation seen, for the no_new_anomalies gate."""
        valid = exps
        full = self._sweep(inv, valid, S.SWEEP_ZONES)
        if getattr(rt, "supports_sessions", False):
            t0 = self._started.get(inv.id, time.monotonic())
            for e in valid:
                _, errors = full[e.id]
                if not errors:
                    continue
                if self._workshop(inv, rt, e, errors[:4], t0):
                    self._check(inv, t0)
                    full[e.id] = self._sweep(inv, [e], S.SWEEP_ZONES)[e.id]
        new: list[SweepResult] = []
        for e in valid:
            outputs, errors = full[e.id]
            res = SweepResult(
                experiment_id=e.id,
                points_run=sum(len(v) for v in outputs.values()),
                zones=list(outputs),
                violations=S.check(outputs, e.invariants),
                errors=errors,
            )
            e.status = "swept"
            inv.sweeps.append(res)
            new.append(res)
            baseline_keys |= _keys(e.id, res.violations)
            self._event(
                inv,
                "spider-weaver",
                "step",
                f"{e.id}: {res.points_run} clock points in {len(res.zones)} zones, "
                f"{len(res.violations)} invariant violation(s)",
                data={"experiment_id": e.id, "violations": len(res.violations)},
            )
            for v in res.violations[:3]:
                self._raise_status(inv, "observed-anomaly")
                self._event(
                    inv,
                    "spider-weaver",
                    "observe",
                    f"{v.invariant} violated at {v.local} ({v.zone})",
                    clock=_reading(v.zone, v.instant, e.id),
                    evidence={"label": v.detail},
                )
        self.store.save(inv)
        # 5 Independent bug verification, for the violations of this round
        need = (self.s.verify_session_s if getattr(rt, "supports_sessions", False) else 120) + 180
        queues = []
        for ex, res in zip(valid, new, strict=True):
            groups: dict[tuple[str, str], Violation] = {}
            for violation in res.violations:
                groups.setdefault((violation.invariant, violation.failure_kind), violation)
            res.pending_review = len(groups)
            queues.append((ex, res, list(groups.values())))
        self.store.save(inv)
        # Review one group from each experiment before starting its next group.
        for index in range(max((len(group) for _, _, group in queues), default=0)):
            for ex, res, group in queues:
                if index >= len(group):
                    continue
                reserve_calls = 2 if inv.bugs else 0
                reserve_seconds = self.s.fix_session_s + 600 if inv.bugs else 0
                if inv.budget.agent_calls + reserve_calls >= self.s.max_agent_calls or not self._preflight(
                    inv, need + reserve_seconds, "verification of the remaining failure groups"
                ):
                    return
                bug = self._verify(inv, rt, ex, group[index])
                if bug:
                    inv.bugs.append(bug)
                res.pending_review = len(group) - index - 1
                self.store.save(inv)

    # ---------- the planner loop: Wraith Director and the coverage ledger ----------

    def _ledger(self, inv: Investigation) -> list[CoverageRow]:
        """What was tested for each reviewed candidate and what came of it. Computed by code, never by an agent."""
        fm, plan = inv.feature_map, inv.test_plan
        if not fm:
            return []
        exps = plan.experiments if plan else []
        sweeps = {r.experiment_id: r for r in inv.sweeps}
        rows: list[CoverageRow] = []
        for c in fm.candidates[: self.s.max_review_candidates]:
            mine = [e for e in exps if e.candidate_id == c.id]
            edges, outcomes = [], []
            incomplete = False
            for e in mine:
                res = sweeps.get(e.id)
                if res and (res.errors or res.points_run == 0 or res.points_run < e.point_count):
                    incomplete = True
                    outcomes.append(f"Partial coverage: {res.points_run} of {e.point_count} clock points recorded")
                if res and res.pending_review:
                    outcomes.append(f"Awaiting verification: {res.pending_review} failure group(s)")
                for v in res.violations if res else []:
                    edges.append(f"{v.invariant} @ {v.zone} ({_edge_kind(v)})")
                outcomes += [f"bug: {b.title}" for b in inv.bugs if b.experiment_id == e.id]
                outcomes += [f"intended: {f.title}" for f in inv.intended if f.experiment_id == e.id]
                judged = [d for d in inv.decisions if d.step in {"judge_violation", "repeat"} and d.subject == e.id]
                if judged and not any(b.experiment_id == e.id for b in inv.bugs):
                    outcomes.append(judged[-1].rule[:120])
            statuses = {e.status for e in mine}
            status: Literal["not_selected", "not_designed", "adapter_invalid", "partial", "clean", "violations"]
            if not mine:
                status = "not_selected"
            elif edges:
                status = "violations"
            elif incomplete:
                status = "partial"
            elif "swept" in statuses:
                status = "clean"
            elif "adapter_invalid" in statuses:
                status = "adapter_invalid"
            else:
                status = "not_designed"
            rows.append(
                CoverageRow(
                    candidate_id=c.id,
                    unit=c.unit.name,
                    path=f"{c.unit.path}:{c.unit.start_line}",
                    status=status,
                    experiments=[e.id for e in mine],
                    rules=sorted({i.id for e in mine for i in e.invariants}),
                    edges=edges[:8],
                    outcome="; ".join(dict.fromkeys(outcomes))[:400],
                )
            )
        return rows

    def _plan_rounds(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        valid: list[Experiment],
        baseline_keys: set[VKey],
        t0: float,
        first_round: int = 1,
    ) -> None:
        """Wraith Director reads the ledger and proposes new directions; code designs, checks, sweeps and verifies
        them, and the loop goes on until he finds no new direction, or the rounds or the time budget run out."""
        fm, plan = inv.feature_map, inv.test_plan
        if not fm or not plan:
            return
        known = {c.id: c for c in fm.candidates[: self.s.max_review_candidates]}
        for rnd in range(first_round, self.s.max_plan_rounds + 1):
            self._check(inv, t0)
            # Leave room for one more design, sweep and verification, and for the fix step if there are bugs.
            reserve = 600 + self.s.verify_session_s + (self.s.fix_session_s + 600 if inv.bugs else 0)
            if inv.budget.agent_calls + 3 > self.s.max_agent_calls or not self._preflight(
                inv, reserve, f"planning round {rnd}"
            ):
                return
            inv.coverage = self._ledger(inv)
            findings = {
                "bugs": [{"title": b.title, "rule": b.invariant, "at": f"{b.clock.time_zone}@{b.clock.instant}"}
                         for b in inv.bugs],
                "intended": [f.title for f in inv.intended],
                "tested_inputs_and_checks": [
                    {"candidate_id": e.candidate_id, "claim": e.claim, "rules": [i.id for i in e.invariants]}
                    for e in plan.experiments if e.status == "swept"
                ],
                "previous_intents": [{"candidate_id": i.candidate_id, "focus": i.focus, "status": i.status}
                                     for i in inv.intents],
            }  # fmt: skip
            cands = [{"candidate_id": c.id, "unit": c.unit.name, "path": c.unit.path, "categories": c.bug_categories}
                     for c in known.values()]  # fmt: skip
            prompt = A.prompt_plan(
                round_no=rnd,
                max_intents=self.s.max_intents_per_round,
                ledger=json.dumps([r.model_dump() for r in inv.coverage], indent=1)[:12000],
                candidates=json.dumps(cands, indent=1)[:6000],
                findings=json.dumps(findings, indent=1)[:10000],
                catalog=S.catalog_text() + _window_hint(inv),
            )
            try:
                out = self._agent(inv, rt, "wraith-director", "plan_round", prompt, A.PlanOut)
            except A.AgentUnavailable as e:
                self._decide(inv, agent="wraith-director", step="plan_round", subject=f"round {rnd}",
                             claim="Planning not run", evidence=[], dropped=0, checks=[str(e)], decision="not_run",
                             rule="No planner: the Crew stops after the first round", phase="design")  # fmt: skip
                return
            seen = {(i.candidate_id, " ".join(i.focus.lower().split())) for i in inv.intents}
            accepted: list[Intent] = []
            for item in out.intents:
                key = (item.candidate_id, " ".join(item.focus.lower().split()))
                why = (
                    "unknown candidate" if item.candidate_id not in known
                    else "already tried" if key in seen
                    else "round is full" if len(accepted) >= self.s.max_intents_per_round
                    else ""
                )  # fmt: skip
                intent = Intent(
                    id=f"int_{hashlib.sha256(f'{key}{rnd}'.encode()).hexdigest()[:8]}",
                    round=rnd,
                    candidate_id=item.candidate_id,
                    focus=item.focus,
                    rationale=item.rationale,
                    status="rejected" if why else "queued",
                    reason=why,
                )
                inv.intents.append(intent)
                seen.add(key)
                if not why:
                    accepted.append(intent)
            self._decide(
                inv,
                agent="wraith-director",
                step="plan_round",
                subject=f"round {rnd}",
                claim=(out.done_reason or "; ".join(i.focus for i in accepted))[:400],
                evidence=[],
                dropped=len(out.intents) - len(accepted),
                checks=[f"{len(accepted)} of {len(out.intents)} intents accepted",
                        *(f"{i.candidate_id}: {i.reason}" for i in inv.intents if i.round == rnd and i.reason)],
                decision="accepted",
                rule="New directions are queued" if accepted else "No new direction: the hunt ends",
                phase="design",
            )  # fmt: skip
            self.store.save(inv)
            if not accepted:
                return
            new: list[Experiment] = []
            for intent in accepted:
                base = next((e for e in plan.experiments if e.candidate_id == intent.candidate_id), None)
                cand = known[intent.candidate_id]
                ex = Experiment(
                    id=f"exp_{hashlib.sha256(intent.id.encode()).hexdigest()[:10]}",
                    candidate_id=cand.id,
                    categories=cand.bug_categories or ["other_temporal"],
                    executability=base.executability if base and base.executability != "not_controllable"
                    else "ready",
                )  # fmt: skip
                plan.experiments.append(ex)
                self._design(inv, rt, ex, feedback=None, focus=intent.focus)
                intent.experiment_id = ex.id
                if ex.status == "designed":
                    intent.status = "designed"
                    new.append(ex)
                else:
                    intent.status, intent.reason = "rejected", f"experiment {ex.status}"
            self._event(inv, "wraith-director", "dispatch",
                        f"Round {rnd}: {len(new)} new experiment(s) from the planner", phase="execution",
                        data={"intents": [i.id for i in accepted]})  # fmt: skip
            if not new:
                continue
            self._validate(inv, rt, new, t0)
            ok = [e for e in new if e.status == "designed"]
            for intent in accepted:
                if intent.experiment_id in {e.id for e in ok}:
                    intent.status = "swept"
                elif intent.status == "designed":
                    intent.status, intent.reason = "rejected", "adapter failed the baseline check"
            if ok:
                self._sweep_and_verify(inv, rt, ok, baseline_keys)
                valid.extend(ok)
            self.store.save(inv)

    # ---------- retest: the regression test on another revision ----------

    def retest(self, inv_id: str, bug_id: str, ref: str) -> Investigation:
        """Rerun a bug's regression test on another revision (a newer commit, a branch, or a pull request such as
        `pull/453`), keeping the pinned dependencies, then put the workspace back on the pinned commit."""
        inv = self._get(inv_id)
        if inv.stage not in {"completed", "failed"} or inv_id in self._working:
            raise Stop("busy", "Retest a case only after it has finished")
        bug = next((b for b in inv.bugs if b.id == bug_id), None)
        if bug is None:
            raise Stop("not_found", "Bug not found")
        caps = inv.capabilities
        ws = self._ws(inv)
        experiments = inv.test_plan.experiments if inv.test_plan else []
        ex = next((e for e in experiments if e.id == bug.experiment_id), None)
        python_ex = ex if ex and ex.adapter == "python_crew" else None
        if not caps or not ws.is_dir() or (not python_ex and not (ws / bug.regression_test_path).is_file()):
            raise Stop("workspace_missing", "The case's workspace or regression test is no longer there")
        ok, why = sandbox.docker_available()
        if not ok:
            raise Stop("sandbox_unavailable", f"Retest not run: {why}")
        m = re.fullmatch(r"(?:refs/)?pull/(\d{1,7})(?:/head)?|#?(\d{1,7})", ref.strip())
        fetch_ref = f"refs/pull/{m.group(1) or m.group(2)}/head" if m else validate_ref(ref)
        with self._lock:
            self._working.add(inv_id)
        try:
            git(ws, ["fetch", "-q", "--depth", "1", "--no-tags", "origin", fetch_ref], timeout=self.s.clone_timeout_s)
            rev = git(ws, ["rev-parse", "FETCH_HEAD"]).strip()
            changed = git(ws, ["diff", "--name-only", "HEAD", "FETCH_HEAD"]).split()
            git(ws, ["checkout", "-q", "FETCH_HEAD", "--", "."])
            if python_ex and python_ex.adapter_path:
                runs = []
                for _ in range(self.s.repeat_runs):
                    result = python_adapter.run(
                        self.s,
                        ws,
                        python_ex.adapter_path,
                        bug.clock.instant,
                        bug.clock.time_zone,
                        code=bug.regression_test,
                        environment=inv.python_environment,
                    )
                    outcome_name = python_crew.behavioral_outcome(result)
                    runs.append(sandbox.TestOutcome(outcome_name, result.detail, set(), result.passed + result.failed))
            else:
                runs = [
                    sandbox.run_test_file(
                        self.s, ws, caps, bug.regression_test_path, [bug.clock], **_runner_options(ex)
                    )[0]
                    for _ in range(self.s.repeat_runs)
                ]
        finally:
            try:
                git(ws, ["reset", "-q", "--hard", "HEAD"])  # back to the pinned commit; untracked files stay
            finally:
                with self._lock:
                    self._working.discard(inv_id)
        outcomes = [r.outcome for r in runs]
        deps = [p for p in changed if PROTECTED.search(p) and not p.startswith((".github/",))]
        if all(o == "passed" for o in outcomes):
            outcome: Literal["still_reproducible", "fixed", "cannot_confirm"] = "fixed"
            detail = f"The regression test passed {len(runs)}/{len(runs)} at {bug.clock.time_zone} {bug.clock.instant}"
        elif all(o == "assertion_failed" for o in outcomes):
            outcome, detail = "still_reproducible", (runs[0].failure or "The regression test still fails")[:300]
        else:
            outcome = "cannot_confirm"
            detail = f"Mixed or erroring runs ({', '.join(outcomes)}): {(runs[0].failure or '')[:200]}"
        if deps:
            detail += f". Note: {', '.join(deps[:3])} changed; the run used the pinned install"
        bug.retests.append(Retest(at=now_iso(), ref=fetch_ref, revision=rev, outcome=outcome, detail=detail,
                                  runs=outcomes))  # fmt: skip
        self._event(inv, "raven-archivist", "verify", f"Retest of {bug.id} on {fetch_ref} ({rev[:12]}): "
                    f"{outcome.replace('_', ' ')}", phase="fix", data={"bug_id": bug.id, "ref": fetch_ref})  # fmt: skip
        with self._lock:
            self.store.save(inv)
        return inv

    def _install(self, inv: Investigation, rt: A.AgentRuntime, t0: float) -> None:
        """Install dependencies and heal a failed install. TimeWraith's own files are moved out of the workspace
        first, so the repository's install scripts never see them. On failure, code retries with a fixed action
        matched to the log; when nothing matches, Pumpkin Mechanic picks one from the same list, citing a log line.
        """
        caps, plan = inv.capabilities, inv.test_plan
        assert caps and plan and caps.package_manager
        pm, ws = caps.package_manager, self._ws(inv)
        opts = installfix.InstallOptions(node=caps.node_version)
        tried: list[str] = []
        folders = [".tw", *sorted({Path(e.adapter_path).parent.as_posix() for e in plan.experiments if e.adapter_path})]
        with _aside(ws, folders):
            for attempt in range(self.s.install_retries + 1):
                r = sandbox.install(self.s, ws, caps, opts)
                if r.code == 0:
                    caps.node_version = opts.node  # later sandbox runs use the Node version that installed
                    if tried:
                        text = f"Dependencies installed after {len(tried)} repair(s): {'; '.join(tried)}"
                        inv.notes.append(text)
                        self._event(inv, "pumpkin-mechanic", "note", text, data={"tried": tried, "node": opts.node})
                    return
                log = r.out
                if r.timed_out or attempt == self.s.install_retries:
                    break
                self._check(inv, t0)
                if getattr(rt, "supports_sessions", False):
                    break  # Send the original failure to the mechanic's shell.
                pick = self._install_action(inv, opts, log)
                if pick is None:
                    break
                action, line, source = pick
                new = installfix.apply(opts, action, pm)
                assert new is not None
                opts = new
                label = installfix.LABELS[action] + (f" (Node {opts.node})" if action == "newer_node" else "")
                tried.append(label)
                self._event(
                    inv,
                    "pumpkin-mechanic",
                    "step",
                    f"Install failed; retry {attempt + 1} with {label}, chosen by {source}",
                    evidence={"label": line},
                    data={"action": action, "log_line": line, "chosen_by": source},
                )
            # Any failure the quick fixes did not heal goes to the install mechanic, who may try again in new rounds,
            # each one told what the earlier rounds did.
            earlier: list[str] = []
            said = ""
            for round_no in range(1, self.s.install_rounds + 1):
                healed, round_said = self._install_session(inv, rt, opts, [*tried, *earlier], log, ws, t0)
                if healed:
                    return
                if not round_said:
                    break  # no agent, no budget or no result: another round would not differ
                earlier.append(f"install mechanic, round {round_no}: {round_said}")
                said = "; ".join(earlier)
        key = installfix.excerpt(log)
        self._event(inv, "watchtower-warden", "note", "Dependency install failed", data={"log": key, "tried": tried})
        why = "timed out" if r.timed_out else "failed"
        repairs = f" after trying {'; '.join(tried)}" if tried else ""
        repairs += f" and the install mechanic's own attempt ({said})" if said else ""
        last = "; ".join(key.splitlines()[-3:])[:600]
        raise Stop("install_failed", f"Dependency install {why} in the sandbox{repairs}. Last errors: {last}")

    def _install_session(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        opts: installfix.InstallOptions,
        tried: list[str],
        log: str,
        ws: Path,
        t0: float,
    ) -> tuple[bool, str]:
        """(installed, what happened). The install mechanic gets tools to run commands in the install sandbox and
        works until the repository's test runner starts. Code runs the check on submit; changes to the files git
        tracks are undone afterwards, so the code under test stays the repository's own."""
        caps = inv.capabilities
        assert caps and caps.package_manager and caps.test_runner
        runner = caps.test_runner
        if inv.budget.agent_calls >= self.s.max_agent_calls:
            return False, ""
        self._check(inv, t0)
        # Installing comes before everything else, so it is not held back by the wrap-up rule: it gets the session
        # time, or what is left of the case's budget if that is shorter (but never less than five minutes).
        session_s = int(max(300, min(self.s.install_session_s, self._remaining(inv))))
        # Each sandbox command is a fresh container, so the package manager shims are made in every one.
        prefix = (
            "mkdir -p /tmp/bin; export PATH=/tmp/bin:$PATH; "
            "corepack enable --install-directory /tmp/bin >/dev/null 2>&1; "
        )

        def run(node: str, command: str, timeout: int) -> installsession.CommandResult:
            r = sandbox.run(self.s, ws, node, prefix + command, network=True, timeout=timeout)
            return installsession.CommandResult(r.code, installfix.clean(r.out), r.timed_out)

        def check(node: str) -> tuple[bool, str]:
            r = sandbox.run(
                self.s, ws, node, f"test -f node_modules/{runner}/package.json && node_modules/.bin/{runner} --version",
                network=False, timeout=120,
            )  # fmt: skip
            if r.code == 0:
                return True, f"{runner} {r.out.strip().splitlines()[-1] if r.out.strip() else ''} starts on Node {node}"
            return False, (
                f"the test runner `{runner}` is not installed or does not start on Node {node}: "
                + (installfix.excerpt(r.out, 4) or "node_modules has no " + runner)
            )

        session = installsession.open_session(
            ws=ws,
            tracked=_tracked(ws),
            extra_readable=frozenset(),
            node=opts.node,
            on_event=lambda text, data: self._event(
                inv, "pumpkin-mechanic", "tool", text, phase="execution", data=data
            ),
            deadline=time.monotonic() + session_s,
            max_calls=self.s.max_install_calls,
            max_commands=self.s.max_install_commands,
            command_timeout_s=self.s.install_timeout_s,
            run=run,
            check=check,
        )
        prompt = A.prompt_install_session(
            package_manager=caps.package_manager, node=opts.node, runner=runner, tried=tried,
            log=installfix.clean(log)[-5000:], tool_calls=self.s.max_install_calls,
            commands=self.s.max_install_commands,
        )  # fmt: skip
        inv.budget.agent_calls += 1
        self._event(inv, "pumpkin-mechanic", "dispatch", "The install mechanic is repairing the install",
                    phase="execution", data={"tried": tried})  # fmt: skip
        self.sessions.add(session)
        try:
            rt.run_session("install-mechanic", "install_session", prompt, session, session_s + 120)
        except A.AgentUnavailable as e:
            if isinstance(e, A.AgentQuotaReached):
                self._quota_note(inv, str(e))
            return False, ""
        finally:
            self.sessions.close(session)
            changed = _tracked_changes(ws)
            if changed:
                git(ws, ["checkout", "--", "."])
                self._event(inv, "watchtower-warden", "note",
                            f"Undid changes to {len(changed)} tracked file(s) made while repairing the install: "
                            f"{', '.join(changed[:6])}", data={"files": changed})  # fmt: skip
        use = f"{session.calls} tool calls, {len(session.log)} commands"
        if session.submitted is None:
            self._decide(inv, agent="pumpkin-mechanic", step="install_session", subject="install",
                         claim="Install repair did not finish", evidence=[], dropped=0, checks=[use],
                         decision="not_run", rule="The install mechanic did not submit; the install stays failed",
                         phase="execution")  # fmt: skip
            return False, f"no result after {use}"
        summary, ok, detail = session.submitted
        self._decide(inv, agent="pumpkin-mechanic", step="install_session", subject="install", claim=summary,
                     evidence=[], dropped=0, checks=[use, detail],
                     decision="accepted" if ok else "rejected",
                     rule="The repository's test runner starts after the repair (checked by code)"
                     if ok else "Code's check failed: the test runner does not start", phase="execution")  # fmt: skip
        if not ok:
            return False, f"{summary} The check still fails: {detail}"[:500]
        caps.node_version = session.node
        text = f"Dependencies installed by the install mechanic: {summary}"
        inv.notes.append(text)
        self._event(inv, "pumpkin-mechanic", "note", text,
                    data={"commands": [c for _, c, _ in session.log], "node": session.node})  # fmt: skip
        return True, summary

    def _install_action(
        self, inv: Investigation, opts: installfix.InstallOptions, log: str
    ) -> tuple[installfix.Action, str, str] | None:
        """(action, log line, who chose it) for a failure code knows by heart, else None. Quick, free first aid."""
        caps = inv.capabilities
        assert caps and caps.package_manager
        pm = caps.package_manager
        for action, line in installfix.matches(log):
            if installfix.apply(opts, action, pm) is not None:
                return action, line, "code (known failure in the log)"
        return None  # anything else goes to the install mechanic, who decides what to try (_install_session)

    def _validate(self, inv: Investigation, rt: A.AgentRuntime, exps: list[Experiment], t0: float) -> None:
        """An adapter must run cleanly at ordinary instants; otherwise violations could be adapter mistakes."""
        checked: set[str] = set()
        rounds = max(1, self.s.adapter_repair_rounds)
        for attempt in range(1, rounds + 2):  # the last pass only decides: keep, drop the broken rules, or reject
            pending = [e for e in exps if e.status == "designed" and e.id not in checked]
            if not pending:
                return
            self._check(inv, t0)
            results = self._sweep(inv, pending, S.BASELINE_ZONES, "baseline")
            for e in pending:
                outputs, errors = results[e.id]
                other, rules = self._baseline_issues(outputs, errors, e)
                other = [*self._unit_problems(inv, e), *other]
                supported = [i for i in e.invariants if i.id in rules and i.expectation_ref]
                if supported and not other:
                    # Preserve the original adapter so repair cannot erase the observed behavior.
                    backed = {i.id for i in supported}
                    unsupported = rules.keys() - backed
                    e.invariants = [i for i in e.invariants if i.id not in unsupported]
                    checked.add(e.id)
                    citations = []
                    for i in supported:
                        ref = i.expectation_ref
                        assert ref
                        kind: Literal["test", "doc"] = "test" if is_test_file(ref.rsplit(":", 1)[0]) else "doc"
                        citations.append(Evidence(kind=kind, ref=ref, why=i.reason))
                    self._decide(
                        inv,
                        agent="pumpkin-mechanic",
                        step="baseline_check",
                        subject=e.id,
                        claim=e.claim or "",
                        evidence=citations,
                        dropped=0,
                        checks=[
                            *(f"{i.id}: {rules[i.id]} ({i.expectation_ref})" for i in supported),
                            *(f"Dropped uncited failing rule: {name}" for name in sorted(unsupported)),
                        ],
                        decision="accepted",
                        rule="Ordinary-date failure has a cited repository expectation; "
                        "keep it for the sweep and independent verification",
                        phase="execution",
                    )
                    continue
                problems = other + [_rule_problem(i, d) for i, d in rules.items()]
                if not problems:
                    checked.add(e.id)
                    self._decide(
                        inv,
                        agent="pumpkin-mechanic",
                        step="baseline_check",
                        subject=e.id,
                        claim=e.claim or "",
                        evidence=[],
                        dropped=0,
                        checks=["baseline clean", f"rules hold at ordinary instants: {_rule_ids(e)}"],
                        decision="accepted",
                        rule="Adapter ran cleanly at ordinary baseline instants",
                        phase="execution",
                    )
                elif attempt <= rounds:
                    problems = [*E.hints_for(e.adapter_code or "", inv.environment), *problems]
                    if earlier := self._repair_notes.pop(e.id, None):
                        problems = [*problems, f"Your previous repair was rejected: {earlier}"]
                    if getattr(rt, "supports_sessions", False):
                        self._workshop(inv, rt, e, problems, t0)
                    else:
                        self._design(inv, rt, e, feedback="\n".join(problems))
                elif not other:
                    # The adapter runs, but some rules break at ordinary instants: their fields do not mean what
                    # the rules say. Drop those rules and keep the experiment for the rules that hold.
                    e.invariants = [i for i in e.invariants if i.id not in rules]
                    checked.add(e.id)
                    self._decide(
                        inv,
                        agent="pumpkin-mechanic",
                        step="baseline_check",
                        subject=e.id,
                        claim=e.claim or "",
                        evidence=[],
                        dropped=0,
                        checks=[*problems, f"rules kept: {_rule_ids(e)}"],
                        decision="accepted",
                        rule="A rule that breaks at ordinary instants is dropped: the adapter's field does not mean "
                        "what the rule says, so a violation would not show a time bug",
                        phase="execution",
                    )
                else:
                    reason = "; ".join(problems)
                    if earlier := self._repair_notes.pop(e.id, None):
                        reason += f" | last repair rejected: {earlier}"
                    e.status, e.executability_reason = "adapter_invalid", reason[:500]
                    if e.failure_kind != "throttled":
                        e.failure_kind = E.classify(reason, inv.environment)  # type: ignore[assignment]
                    self._decide(
                        inv,
                        agent="pumpkin-mechanic",
                        step="baseline_check",
                        subject=e.id,
                        claim=e.claim or "",
                        evidence=[],
                        dropped=0,
                        checks=problems,
                        decision="rejected",
                        rule="An adapter that fails at ordinary instants cannot separate code defects from "
                        "adapter mistakes",
                        phase="execution",
                    )

    @staticmethod
    def _baseline_issues(outputs: S.Outputs, errors: list[str], e: Experiment) -> tuple[list[str], dict[str, str]]:
        """(problems running the adapter, rules broken at ordinary instants: id -> detail)."""
        other = S.baseline_problems(outputs, e.fields) + errors[:2]
        rules = S.baseline_violations(outputs, e.invariants) if not other else {}
        return other, rules

    # ---------- agentic adapter repair: Pumpkin Mechanic with tools ----------

    def _repair_workspace(
        self,
        ws: Path,
        node: str,
        runner: str | None = None,
    ) -> tuple[Callable[[str, int], str], Callable[[str, str], str], Callable[[bool], None]]:
        scratch = ws.parent / f"repair-{uuid.uuid4().hex}"
        fixture_dir = Path(".tw") / f"fixtures-{uuid.uuid4().hex}"

        def run_repair(command: str, left: int) -> str:
            scratch.mkdir(exist_ok=True)
            # Copy only once. The agent can freely edit this copy; host-side Git and
            # subsequent verification continue to use the pinned checkout.
            setup = (
                "if [ ! -e /repair/.ready ]; then "
                "mkdir -p /repair/repo && "
                "tar -C /work --exclude=./.git --exclude=./node_modules -cf - . "
                "| tar -C /repair/repo -xf -; "
                "ln -s /work/node_modules /repair/repo/node_modules && touch /repair/.ready || exit 1; fi; "
                "cd /repair/repo || exit 1\n"
            )
            result = sandbox.run(
                self.s,
                ws,
                node,
                setup + command,
                network=False,
                readonly=True,
                repair_workspace=scratch,
                scratch=sandbox.runner_caches(runner, ws),
                timeout=min(left, self.s.test_timeout_s),
            )
            return f"{'Timed out' if result.timed_out else f'Exit code {result.code}'}\n{result.out}"

        def save_fixture(name: str, content: str) -> str:
            destination = fixture_dir / name
            (ws / fixture_dir).mkdir(exist_ok=True)
            (ws / destination).write_text(content, encoding="utf8")
            return destination.as_posix()

        def cleanup(keep: bool) -> None:
            _force_rmtree(scratch)
            if not keep:
                _force_rmtree(ws / fixture_dir)

        return run_repair, save_fixture, cleanup

    def _attach_repair_tools(
        self,
        session: fixsession.FixSession | verifysession.VerifySession,
        caps: CapabilityReport,
        ex: Experiment,
    ) -> Callable[[bool], None]:
        run, fixture, cleanup = self._repair_workspace(session.ws, caps.node_version, caps.test_runner)
        previous = ex.runner_config
        config_path = f".tw/runner-{uuid.uuid4().hex}.mjs"
        config_file = session.ws / config_path

        def configure(args: dict[str, Any]) -> str:
            code = args.get("code")
            if not isinstance(code, str) or len(code) > designsession.MAX_ADAPTER_CHARS:
                raise fixsession.ToolError("Give a Vitest configuration as an ES module")
            if code.strip():
                config_file.write_text(code, encoding="utf8")
            ex.runner_config = config_path if code.strip() else None
            if isinstance(session, fixsession.FixSession):
                session.runner_config = ex.runner_config
            return "Runner configuration updated. Rerun the failing test."

        def command(args: dict[str, Any]) -> str:
            return designsession.repair_shell_command(run, args.get("command"), session.deadline)

        def save(args: dict[str, Any]) -> str:
            return designsession.repair_fixture(fixture, args.get("name"), args.get("content"))

        session.tools = [*session.tools, *designsession.REPAIR_SHELL_TOOLS]
        session.repair_tools.update(run_command=command, save_fixture=save)
        if caps.test_runner == "vitest":
            session.tools.append(designsession.VITEST_CONFIG_TOOL)
            session.repair_tools["write_runner_config"] = configure

        def finish(keep: bool) -> None:
            cleanup(keep)
            if not keep:
                ex.runner_config = previous
            if ex.runner_config != config_path:
                config_file.unlink(missing_ok=True)

        return finish

    def _workshop(self, inv: Investigation, rt: A.AgentRuntime, ex: Experiment, problems: list[str], t0: float) -> bool:
        """Pumpkin repairs an adapter that failed its baseline check: he reads the code, runs the adapter at points
        he picks, rewrites it and rechecks. Code reruns the baseline check on submit; problems go back to him."""
        caps, fm = inv.capabilities, inv.feature_map
        assert caps and caps.test_runner and fm and ex.adapter_path
        ws = self._ws(inv)
        cand = next(c for c in fm.candidates if c.id == ex.candidate_id)
        ts = Path(ex.adapter_path).suffix == ".ts"
        probe_rel = f"{S.PROBE_TEST}{'.ts' if ts else '.js'}"
        runner = caps.test_runner
        if inv.budget.agent_calls >= self.s.max_agent_calls:
            self._repair_skipped(inv, ex, f"the limit of {self.s.max_agent_calls} agent calls is used up")
            return False
        self._check(inv, t0)
        if not self._preflight(inv, self.s.design_session_s + 120, f"adapter repair for {ex.id}"):
            return False

        def write(code: str) -> None:
            if ts and not any("@ts-nocheck" in ln for ln in code.splitlines()[:3]):
                code = "// @ts-nocheck\n" + code
            (ws / (ex.adapter_path or "")).write_text(code, encoding="utf-8")
            ex.adapter_code = code

        run_repair, save_fixture, cleanup = self._repair_workspace(ws, caps.node_version, caps.test_runner)
        original_config = ex.runner_config
        original_adapter = (ws / ex.adapter_path).read_bytes()
        original_code = ex.adapter_code
        config_path = f".tw/runner-{uuid.uuid4().hex}.mjs"

        def configure_runner(code: str) -> None:
            if code.strip():
                (ws / config_path).write_text(code, encoding="utf-8")
                ex.runner_config = config_path
            else:
                ex.runner_config = None

        def run_once(zone: str, ms: int) -> sandbox.ProbeResult:
            if inv.sweep_window and not inv.sweep_window.contains(ms):
                return sandbox.ProbeResult("error", ["Probe date is outside the case window"])
            if inv.sweep_window and "clock_jumps" in ex.fields and not S.clock_jump_fits(inv.sweep_window, ms):
                return sandbox.ProbeResult("error", ["Clock shift would leave the case window"])
            (ws / probe_rel).parent.mkdir(parents=True, exist_ok=True)
            (ws / probe_rel).write_text(S.probe_code(runner, designsession.run_body(ex.adapter_path or "")), "utf-8")
            return sandbox.probe(self.s, ws, caps, probe_rel, zone, ms, **_runner_options(ex))

        def baseline(fields: list[OutputField]) -> list[str]:
            invs, _ = _derive_invariants(ex.invariants, fields, ex.adapter_code or "")
            outputs, errors = self._sweep(inv, [ex], S.BASELINE_ZONES, "baseline")[ex.id]
            other, rules = self._baseline_issues(
                outputs, errors, ex.model_copy(update={"fields": fields, "invariants": invs})
            )
            return [*self._unit_problems(inv, ex), *other] + [
                _rule_problem(i, d)
                for i, d in rules.items()
                if not any(rule.id == i and rule.expectation_ref for rule in invs)
            ]

        def blocked_check(reason: str) -> str | None:
            """The referee for report_blocked: the adapter as it stands must fail for a reason this environment
            explains, and a missing global must be one the code under test really uses."""
            now = baseline(list(ex.fields))
            if not now:
                return "the baseline is clean now, so there is nothing blocking it. Submit the adapter."
            try:
                unit_text: str | None = (ws / cand.unit.path).read_text(encoding="utf-8", errors="ignore")
            except OSError:
                unit_text = None
            text = " ".join(now)
            if E.explains_by_environment(text, inv.environment, unit_text):
                return None
            return f"the adapter's own failure is one it can still fix: {text[:300]}"

        experiments = inv.test_plan.experiments if inv.test_plan else []
        reusable_configs = {
            other.runner_config
            for other in experiments
            if other.id != ex.id
            and other.runner_config
            and re.fullmatch(r"\.tw/runner-[a-f0-9]{32}\.mjs", other.runner_config)
            and (ws / other.runner_config).is_file()
        }

        session = designsession.open_session(
            ws=ws,
            tracked=frozenset(ln for ln in git(ws, ["ls-files", "-z"]).split("\0") if ln),
            extra_readable=frozenset({p for p in (ex.adapter_path, ex.harness_path) if p} | reusable_configs),
            adapter_path=ex.adapter_path,
            on_event=lambda text, data: self._event(
                inv, "pumpkin-mechanic", "tool", text, phase="execution", data={"experiment_id": ex.id, **data}
            ),
            deadline=time.monotonic() + self.s.design_session_s,
            max_calls=self.s.max_design_calls,
            max_runs=self.s.max_adapter_runs,
            max_checks=self.s.max_baseline_checks,
            write=write,
            run_once=run_once,
            baseline=baseline,
            configure_runner=configure_runner if runner == "vitest" else None,
            repair_command=run_repair,
            save_fixture=save_fixture,
            blocked_check=blocked_check,
        )
        prompt = A.prompt_design_session(
            unit=cand.unit.name,
            path=cand.unit.path,
            start_line=cand.unit.start_line,
            adapter_path=ex.adapter_path,
            adapter=ex.adapter_code or "",
            fields=list(ex.fields),
            rules=[i.id for i in ex.invariants],
            problems=problems,
            catalog=S.catalog_text() + _window_hint(inv),
            tool_calls=self.s.max_design_calls,
            environment=E.facts_text(inv.environment),
        )
        prompt += (
            "\nUse run_command to diagnose the failure and try changes in the writable checkout copy. "
            "Carry working changes into the experiment with write_adapter, save_fixture, or "
            "write_runner_config where available. Check the baseline before submitting."
        )
        if runner == "vitest":
            prompt += (
                "\nInspect the repository's Vitest files if the harness fails to load or collect. "
                "Use write_runner_config to try a configuration for this experiment, then check_baseline."
            )
            if reusable_configs:
                prompt += (
                    "\nThese configurations passed a workshop baseline in this checkout. Read a compatible one, "
                    "use write_runner_config to adapt it to this harness if needed, then check_baseline. "
                    "On collection errors, try this before rewriting the adapter.\n"
                    + A._data("Existing runner configurations", "\n".join(sorted(reusable_configs)))
                )
        inv.budget.agent_calls += 1
        self._event(inv, "pumpkin-mechanic", "dispatch", f"Pumpkin is repairing the adapter for {cand.title}",
                    phase="execution", data={"experiment_id": ex.id, "problems": problems[:4]})  # fmt: skip
        self.sessions.add(session)
        waits = list(self.s.throttle_waits_s)
        try:
            while True:
                try:
                    rt.run_session("pumpkin-mechanic", "repair_adapter", prompt, session, self.s.design_session_s + 120)
                    break
                except A.AgentQuotaReached:
                    raise
                except A.AgentUnavailable as busy:
                    if not waits or not E.is_throttled(str(busy)) or self._remaining(inv) < self.s.design_session_s:
                        raise
                    self._wait(inv, waits.pop(0), f"the repair of {ex.id}")
        except A.AgentUnavailable as e:
            if isinstance(e, A.AgentQuotaReached):
                self._quota_note(inv, str(e))
            self._repair_skipped(inv, ex, f"the agent was unavailable: {e}")
            return False
        finally:
            self.sessions.close(session)
            (ws / probe_rel).unlink(missing_ok=True)
            if session.submitted is None or session.rejected_reason:
                ex.runner_config = original_config
                ex.adapter_code = original_code
                (ws / (ex.adapter_path or "")).write_bytes(original_adapter)
            cleanup(session.submitted is not None and not session.rejected_reason)
            if ex.runner_config != config_path:
                (ws / config_path).unlink(missing_ok=True)
        use = f"{session.calls} tool calls, {session.runs} runs, {session.rewrites} rewrites"
        if session.blocked is not None:
            # The agent says the cause is outside the adapter and code agreed (see blocked_check). The experiment is
            # recorded as not run, with the agent's reason, and is not repaired again: nothing it can write will run.
            ex.status, ex.failure_kind = "not_run", "environment"
            ex.executability_reason = f"Blocked by the environment: {session.blocked}"[:500]
            self._repair_notes.pop(ex.id, None)
            self._decide(inv, agent="pumpkin-mechanic", step="repair_adapter", subject=ex.id, claim=ex.claim or "",
                         evidence=[], dropped=0, checks=[use, f"Blocked: {session.blocked}"], decision="not_run",
                         rule="Pumpkin reported the experiment blocked by the environment, and the failure he sees "
                         "is one this environment explains", phase="execution")  # fmt: skip
            return False
        if session.submitted is None:
            self._decide(inv, agent="pumpkin-mechanic", step="repair_adapter", subject=ex.id, claim=ex.claim or "",
                         evidence=[], dropped=0, checks=[use], decision="not_run",
                         rule="Pumpkin did not submit; the baseline check decides on the adapter as it stands",
                         phase="execution")  # fmt: skip
            return False
        if session.rejected_reason:
            self._repair_notes[ex.id] = session.rejected_reason
            self._decide(inv, agent="pumpkin-mechanic", step="repair_adapter", subject=ex.id, claim=ex.claim or "",
                         evidence=[], dropped=0, checks=[use, session.rejected_reason], decision="rejected",
                         rule="The repaired adapter still fails the baseline check; the earlier adapter was kept",
                         phase="execution")  # fmt: skip
            return False
        self._repair_notes.pop(ex.id, None)
        fields, claim = session.submitted
        invs, notes = _derive_invariants(ex.invariants, fields, ex.adapter_code or "")
        ex.fields, ex.invariants, ex.claim = fields, invs, claim
        self._decide(
            inv,
            agent="pumpkin-mechanic",
            step="repair_adapter",
            subject=ex.id,
            claim=claim,
            evidence=[],
            dropped=0,
            checks=[use, *notes, *([session.rejected_reason] if session.rejected_reason else [])],
            decision="rejected" if session.rejected_reason else "accepted",
            rule="The repaired adapter still fails the baseline check"
            if session.rejected_reason
            else "Repaired adapter passes the baseline check: it runs, returns its fields, and its rules hold at "
            "ordinary instants",
            phase="execution",
        )
        return True

    def _verify(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        ex: Experiment,
        v: Violation,
        *,
        verification_feedback: str = "",
    ) -> Bug | None:
        caps, fm = inv.capabilities, inv.feature_map
        assert caps and fm and caps.test_runner and ex.adapter_path
        ws = self._ws(inv)
        cand = next(c for c in fm.candidates if c.id == ex.candidate_id)
        zones = [v.zone] + (["UTC"] if v.invariant == "instant_zone_independent" and v.zone != "UTC" else [])
        key = (v.invariant, v.zone, v.instant, v.failure_kind)
        hits = 0
        last_outputs: S.Outputs = {}
        for _ in range(self.s.repeat_runs):
            last_outputs, _err = self._sweep(inv, [ex], zones)[ex.id]
            repeats = S.check(last_outputs, ex.invariants)
            if any((x.invariant, x.zone, x.instant, x.failure_kind) == key for x in repeats):
                hits += 1
        clock = _reading(v.zone, v.instant, cand.unit.name)
        if hits < self.s.repeat_runs:
            self._event(
                inv,
                "raven-archivist",
                "repeat",
                f"{v.invariant} on {cand.title} repeated {hits}/{self.s.repeat_runs}; not reported",
                clock=clock,
            )
            self._decide(
                inv,
                agent="raven-archivist",
                step="repeat",
                subject=ex.id,
                claim=v.detail,
                evidence=[],
                dropped=0,
                checks=[f"{hits}/{self.s.repeat_runs} clean repeats"],
                decision="rejected",
                rule="A violation counts only if it repeats in every clean run",
            )
            return None
        self._event(
            inv, "raven-archivist", "repeat", f"{v.invariant} repeated {hits}/{hits} from clean containers", clock=clock
        )
        ctx_rows = [r for z in zones for r in last_outputs.get(z, []) if int(r["t"]) in set(v.context_ms)]
        statement, exceptions = S.INVARIANTS[v.invariant][1], S.INVARIANTS[v.invariant][2]
        point_ref = f"{v.zone}@{v.instant}"
        tracked = [ln for ln in git(ws, ["ls-files", "-z"]).split("\0") if ln]
        at_ms = S.parse_instant(v.instant)
        near = S.situation(v.zone, at_ms) if at_ms is not None else None
        snippets = intent.find(ws, tracked, _expectation_subject(cand), cand.unit.path, v.zone, near)
        self._event(
            inv,
            "raven-archivist",
            "explore",
            f"Read {len(snippets)} passage(s) of the repository's own tests and docs about time behaviour",
            data={"passages": [f"{s.path}:{s.start}-{s.end}" for s in snippets]},
        )
        cited = next((i for i in ex.invariants if i.id == v.invariant and i.expectation_ref), None)
        passages = [s.render() for s in snippets]
        if cited:
            passages.insert(0, f"Check the claimed expectation at {cited.expectation_ref}: {cited.reason}")
        intent_text = "\n\n".join(passages)
        if getattr(rt, "supports_sessions", False):
            return self._verify_with_tools(
                inv, rt, ex, cand, v, ctx_rows, intent_text, hits, clock, verification_feedback=verification_feedback
            )
        try:
            j = self._agent(
                inv,
                rt,
                "raven-archivist",
                "judge_violation",
                A.prompt_judge(
                    invariant=v.invariant,
                    statement=statement,
                    exceptions=exceptions,
                    violation=json.dumps(v.model_dump(), indent=1),
                    outputs=json.dumps(ctx_rows, indent=1)[:6000],
                    adapter=ex.adapter_code or "",
                    path=cand.unit.path,
                    source=(ws / cand.unit.path).read_text(encoding="utf-8", errors="ignore"),
                    intent=intent_text,
                ),
                A.JudgeOut,
            )
        except A.AgentUnavailable as e:
            self._decide(
                inv,
                agent="raven-archivist",
                step="judge_violation",
                subject=ex.id,
                claim=v.detail,
                evidence=[],
                dropped=0,
                checks=[str(e)],
                decision="not_run",
                rule="Repeated violation left as an observed anomaly until Raven rules on it",
            )
            return None
        kept, dropped = self._evidence(inv, j.evidence, points={point_ref})
        checks = [f"verdict {j.verdict}", f"{len(kept)} evidence item(s) resolved, {dropped} removed"]
        if j.verdict == "intended_behavior":
            self._intended(inv, ex, cand, v, j, kept, dropped, checks)
            return None
        if j.verdict != "defect":
            self._decide(
                inv,
                agent="raven-archivist",
                step="judge_violation",
                subject=ex.id,
                claim=j.claim,
                evidence=kept,
                dropped=dropped,
                checks=checks,
                decision="rejected",
                rule=f"Not reported: Raven ruled {j.verdict.replace('_', ' ')}",
            )
            return None
        if not ({"invariant", "point"} <= {e.kind for e in kept}):
            self._decide(
                inv,
                agent="raven-archivist",
                step="judge_violation",
                subject=ex.id,
                claim=j.claim,
                evidence=kept,
                dropped=dropped,
                checks=checks,
                decision="rejected",
                rule="A defect verdict must cite the broken invariant and the failing point",
            )
            return None
        title = j.title or f"{cand.unit.name}: {v.invariant.replace('_', ' ')}"
        bid = _next_bug_id(inv, ex)
        reg_rel = (Path(ex.adapter_path).parent / f"{bid}.regression.test{Path(ex.adapter_path).suffix}").as_posix()
        target = f"{inv.target.owner}/{inv.target.repo}@{(inv.target.revision or '')[:12]}"
        code = S.regression_code(exp_id=ex.id, runner=caps.test_runner, v=v, title=title, target=target)
        (ws / reg_rel).write_text(code, encoding="utf-8")
        cc = ClockConfig(instant=v.instant, time_zone=v.zone, label=f"{v.invariant} at {v.local}")
        first = sandbox.run_test_file(self.s, ws, caps, reg_rel, [cc], **_runner_options(ex))[0]
        if first.outcome != "assertion_failed":
            (ws / reg_rel).unlink(missing_ok=True)
            self._decide(
                inv,
                agent="raven-archivist",
                step="judge_violation",
                subject=ex.id,
                claim=j.claim,
                evidence=kept,
                dropped=dropped,
                checks=[*checks, f"regression test {first.outcome}"],
                decision="rejected",
                rule="The generated regression test must fail with an assertion",
            )
            return None
        self._raise_status(inv, "reproduced")
        bug = Bug(
            id=bid,
            candidate_id=cand.id,
            experiment_id=ex.id,
            title=title,
            category=INVARIANT_CATEGORY.get(v.invariant, cand.bug_categories[0]),
            invariant=v.invariant,
            status="reproduced",
            clock=cc,
            violation=v,
            failure=v.detail,
            evidence=kept,
            regression_test_path=reg_rel,
            regression_test=code,
        )
        self._decide(
            inv,
            agent="raven-archivist",
            step="judge_violation",
            subject=bid,
            claim=j.claim,
            evidence=kept,
            dropped=dropped,
            checks=[*checks, f"{hits}/{hits} clean repeats", "regression test fails"],
            decision="accepted",
            rule="Reproduced: 3/3 clean repeats, a failing generated regression test, and a defect verdict "
            "with resolvable evidence",
        )
        self._event(
            inv,
            "raven-archivist",
            "verify",
            f"Reproduced: {title}",
            clock=clock,
            evidence={"label": j.claim, "observed": v.detail},
            check={"versionId": inv.versions[0].id, "result": "fails"},
        )
        inv.versions[0].result, inv.versions[0].role = "fails", "affected"
        self._match_issue(inv, rt, bug, cand.unit.name)
        return bug

    # ---------- agentic verification: Raven Archivist with tools ----------

    def _verify_with_tools(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        ex: Experiment,
        cand: Candidate,
        v: Violation,
        ctx_rows: list[dict[str, object]],
        intent_text: str,
        hits: int,
        clock: ServerClockReading,
        verification_feedback: str = "",
    ) -> Bug | None:
        """Raven investigates the repeated violation herself: she reads the code, probes it through its own API at
        clock points she picks, runs the repository's tests and searches issues, then submits a verdict. Code checks
        the verdict (_check_verdict) and sends a rejection back to her in the same session."""
        caps, tgt = inv.capabilities, inv.target
        assert caps and caps.test_runner and ex.adapter_path
        ws = self._ws(inv)
        runner = caps.test_runner
        ext = ".ts" if Path(cand.unit.path).suffix in {".ts", ".tsx", ".mts", ".cts"} else ".js"
        probe_rel = f"{S.PROBE_TEST}{ext}"
        bid = _next_bug_id(inv, ex)
        folder = Path(ex.adapter_path).parent
        reg_rel = (folder / f"{bid}.regression.test{ext}").as_posix()
        prefix = "../" * len(folder.parts)
        target = f"{tgt.owner}/{tgt.repo}@{(tgt.revision or '')[:12]}"
        hidden = None
        if inv.request.mode == "blind-hunt" and inv.request.issue_url and not inv.revealed:
            hidden = parse_issue_url(inv.request.issue_url, tgt.owner, tgt.repo)
        state: dict[str, object] = {}

        def probe(code: str, zone: str, ms: int) -> sandbox.ProbeResult:
            if inv.sweep_window and not inv.sweep_window.contains(ms):
                return sandbox.ProbeResult("error", ["Probe date is outside the case window"])
            if inv.sweep_window and v.invariant == "elapsed_clock_jump" and not S.clock_jump_fits(inv.sweep_window, ms):
                return sandbox.ProbeResult("error", ["Clock shift would leave the case window"])
            (ws / probe_rel).parent.mkdir(parents=True, exist_ok=True)
            (ws / probe_rel).write_text(S.probe_code(runner, code), encoding="utf-8")
            return sandbox.probe(self.s, ws, caps, probe_rel, zone, ms, **_runner_options(ex))

        def run_test(path: str) -> str:
            as_written = ClockConfig(instant=v.instant, time_zone="UTC", label="repository test, as written")
            r = sandbox.run_test_file(self.s, ws, caps, path, [as_written], **_runner_options(ex))[0]
            return f"{r.outcome.upper()}" + (f"\n{r.failure[:2000]}" if r.failure else "")

        def find_issues(terms: list[str]) -> list[dict[str, object]]:
            return github.search_issues(tgt.owner, tgt.repo, terms, self.s.github_token, exclude=hidden)

        def check(vd: verifysession.Verdict) -> tuple[str | None, list[str]]:
            return self._check_verdict(inv, cand, v, vd, probe, reg_rel, prefix, target, state, ex)

        session = verifysession.open_session(
            ws=ws,
            tracked=frozenset(ln for ln in git(ws, ["ls-files", "-z"]).split("\0") if ln),
            extra_readable=frozenset({ex.adapter_path}),
            unit=cand.unit.name,
            on_event=lambda text, data: self._event(
                inv, "raven-archivist", "tool", text, phase="verification", data={"experiment_id": ex.id, **data}
            ),
            deadline=time.monotonic() + self.s.verify_session_s,
            max_calls=self.s.max_verify_calls,
            max_probes=self.s.max_probes,
            max_tests=self.s.max_verify_tests,
            max_searches=self.s.max_issue_searches,
            probe=probe,
            run_test=run_test,
            is_test=is_test_file,
            find_issues=find_issues,
            check_verdict=check,
        )
        statement, exceptions = S.INVARIANTS[v.invariant][1], S.INVARIANTS[v.invariant][2]
        prompt = A.prompt_verify_session(
            invariant=v.invariant,
            statement=statement,
            exceptions=exceptions,
            violation=json.dumps(v.model_dump(), indent=1),
            outputs=json.dumps(ctx_rows, indent=1)[:6000],
            adapter_path=ex.adapter_path,
            adapter=ex.adapter_code or "",
            unit=cand.unit.name,
            path=cand.unit.path,
            start_line=cand.unit.start_line,
            intent=intent_text,
            tool_calls=self.s.max_verify_calls,
            probes=self.s.max_probes,
        )

        def record(
            claim: str,
            checks: list[str],
            decision: str,
            rule: str,
            evidence: list[Evidence] | None = None,
            dropped: int = 0,
            subject: str = ex.id,
        ) -> None:
            self._decide(
                inv,
                agent="raven-archivist",
                step="judge_violation",
                subject=subject,
                claim=claim,
                evidence=evidence or [],
                dropped=dropped,
                checks=checks,
                decision=decision,
                rule=rule,
            )

        if inv.budget.agent_calls >= self.s.max_agent_calls:
            record(v.detail, ["agent call budget reached"], "not_run", "Repeated violation left as an observed anomaly")
            return None
        if not self._preflight(inv, self.s.verify_session_s + 180, f"verification of {ex.id}"):
            record(v.detail, ["time budget"], "not_run", "Wrap-up: repeated violation left as an observed anomaly")
            return None
        inv.budget.agent_calls += 1
        self._event(inv, "raven-archivist", "dispatch", f"Raven is investigating {cand.title} with tools",
                    phase="verification", clock=clock)  # fmt: skip
        cleanup_repair = self._attach_repair_tools(session, caps, ex)
        self.sessions.add(session)
        try:
            prompt += _window_hint(inv) + _REPAIR_PROMPT
            if v.invariant == "calendar_contract":
                contract = next((i for i in ex.invariants if i.id == "calendar_contract"), None)
                if contract and contract.expectation_ref:
                    prompt += A._data("Candidate contract citation", contract.expectation_ref)
                prompt += (
                    "\nCheck whether the cited contract covers the exact argument shapes. "
                    "Use the actual and expected values to identify the case. Write an independent "
                    "public API check and a passing control before submitting a defect."
                )
            if verification_feedback:
                prompt += A._data("Regression repair feedback", verification_feedback)

            rt.run_session("raven-archivist", "verify_violation", prompt, session, self.s.verify_session_s + 120)
        except A.AgentUnavailable as e:
            if isinstance(e, A.AgentQuotaReached):
                self._quota_note(inv, str(e))
            record(v.detail, [str(e)], "not_run", "Repeated violation left as an observed anomaly until Raven rules")
            return None
        finally:
            self.sessions.close(session)
            verdict = session.verdict
            cleanup_repair(bool(verdict and verdict.verdict == "defect" and not session.rejected_reason))
            (ws / probe_rel).unlink(missing_ok=True)
        tool_use = f"{session.calls} tool calls, {session.probes} probes, {session.tests} test runs"
        vd = session.verdict
        if vd is None:
            record(v.detail, [tool_use], "not_run", "Raven did not submit a verdict; left as an observed anomaly")
            (ws / reg_rel).unlink(missing_ok=True)
            return None
        kept, dropped = self._evidence(inv, vd.evidence, points=self._points(v, vd))
        checks = [f"verdict {vd.verdict}", tool_use, *session.checks]
        if session.rejected_reason:
            (ws / reg_rel).unlink(missing_ok=True)
            record(vd.claim, checks, "rejected", f"Not reported: {session.rejected_reason}", kept, dropped)
            return None
        if vd.verdict == "intended_behavior":
            j = A.JudgeOut(verdict=vd.verdict, claim=vd.claim, title=vd.title, evidence=vd.evidence)
            self._intended(inv, ex, cand, v, j, kept, dropped, checks)
            return None
        if vd.verdict != "defect":
            rule = f"Not reported: Raven ruled {vd.verdict.replace('_', ' ')}"
            if vd.verdict == "adapter_error":
                rule += "; her reproduction through the code's API passes at the violation point"
            record(vd.claim, checks, "rejected", rule, kept, dropped)
            return None
        rep = vd.reproduction
        assert rep is not None and rep.control is not None
        if (
            v.invariant in ("calendar_contract", "instant_zone_independent")
            and rep.failing.zone != rep.control.zone
            and E.local_time_by_design((ws / cand.unit.path).read_text(encoding="utf-8", errors="ignore"))
        ):
            (ws / reg_rel).unlink(missing_ok=True)
            record(
                vd.claim,
                checks,
                "rejected",
                "Not reported: the code reads the process-local calendar, so a result that only differs by "
                "process zone is local-time behaviour by design, not a defect",
                kept,
                dropped,
            )
            return None
        title = vd.title or f"{cand.unit.name}: {v.invariant.replace('_', ' ')}"
        fail_ms = verifysession.point_ms(rep.failing)
        cc = ClockConfig(instant=S.iso(fail_ms), time_zone=rep.failing.zone, label=f"{title[:60]} at {S.iso(fail_ms)}")
        self._raise_status(inv, "reproduced")
        bug = Bug(
            id=bid,
            candidate_id=cand.id,
            experiment_id=ex.id,
            title=title,
            category=INVARIANT_CATEGORY.get(v.invariant, cand.bug_categories[0]),
            invariant=v.invariant,
            status="reproduced",
            clock=cc,
            violation=v,
            failure=str(state.get("failure", v.detail))[:1500],
            evidence=kept,
            regression_test_path=reg_rel,
            regression_test=str(state["test"]),
            reproduction={
                "code": rep.code,
                "failing": f"{rep.failing.zone}@{rep.failing.instant}",
                "control": f"{rep.control.zone}@{rep.control.instant}",
                **({"control_code": str(state["control_code"])} if "control_code" in state else {}),
                "user_check": vd.user_check.code if vd.user_check else "",
                "user_failing": f"{vd.user_check.failing.zone}@{vd.user_check.failing.instant}"
                if vd.user_check
                else "",
            },  # fmt: skip
        )
        record(vd.claim, checks, "accepted", "Reproduced through the code's own API: the check failed 3/3 at the "
               "failing point and passed at the control point, and the regression test fails with an assertion "
               f"({hits}/{hits} clean repeats of the sweep violation)", kept, dropped, subject=bid)  # fmt: skip
        self._event(
            inv,
            "raven-archivist",
            "verify",
            f"Reproduced: {title}",
            clock=clock,
            evidence={"label": vd.claim, "observed": v.detail},
            check={"versionId": inv.versions[0].id, "result": "fails"},
        )
        inv.versions[0].result, inv.versions[0].role = "fails", "affected"
        self._issue_from_session(inv, rt, bug, cand.unit.name, vd, session)
        return bug

    @staticmethod
    def _points(v: Violation, vd: verifysession.Verdict) -> set[str]:
        pts = {f"{v.zone}@{v.instant}"}
        if vd.reproduction:
            pts.add(f"{vd.reproduction.failing.zone}@{vd.reproduction.failing.instant}")
        return pts

    def _check_verdict(
        self,
        inv: Investigation,
        cand: Candidate,
        v: Violation,
        vd: verifysession.Verdict,
        probe: Callable[[str, str, int], sandbox.ProbeResult],
        reg_rel: str,
        prefix: str,
        target: str,
        state: dict[str, object],
        ex: Experiment | None = None,
    ) -> tuple[str | None, list[str]]:
        """What code requires before Raven's verdict counts. Returns (reason to reject, or None; checks)."""
        caps = inv.capabilities
        assert caps and caps.test_runner
        ws = self._ws(inv)
        kept, _dropped = self._evidence(inv, vd.evidence, points=self._points(v, vd))
        kinds = {e.kind for e in kept}
        rep = vd.reproduction
        if vd.verdict == "intended_behavior":
            if not kinds & {"test", "doc"}:
                return "intended behaviour must cite a repository test or doc line that exists (path:line)", []
            return None, []
        if vd.verdict == "allowed_exception":
            if "invariant" not in kinds:
                return "an allowed exception must cite the invariant whose exception applies", []
            return None, []
        if rep is None or not verifysession.loads_repository_code(rep.code):
            what = "a defect" if vd.verdict == "defect" else "an adapter error"
            return f"{what} needs a reproduction that loads the repository's code with load()", []
        if vd.verdict == "adapter_error":
            # The code must be right when called correctly, at the very point the sweep flagged.
            ms = S.parse_instant(v.instant) or 0
            r = probe(rep.code, v.zone, ms)
            checks = [f"reproduction at the violation point {v.zone}@{v.instant}: {r.status}"]
            if r.status != "passed":
                return (
                    f"an adapter error needs a reproduction whose checks pass at the violation point "
                    f"({v.zone}@{v.instant}); it gave {r.status}: {' | '.join(r.out[-3:])[:300]}",
                    checks,
                )
            return None, checks
        # defect
        if rep.control is None:
            return "a defect needs a control point where the same check passes", []
        if "source" not in kinds:
            return "a defect must cite the responsible source lines (kind source, ref path:line) that exist", []
        fail_ms, ctrl_ms = verifysession.point_ms(rep.failing), verifysession.point_ms(rep.control)
        v_ms = S.parse_instant(v.instant) or 0
        if rep.failing.zone != v.zone and abs(fail_ms - v_ms) > 36 * 3_600_000:
            return (
                f"the failing point must be about this violation: in its zone ({v.zone}) or within 36 hours of "
                f"{v.instant}",
                [],
            )
        runs = [probe(rep.code, rep.failing.zone, fail_ms) for _ in range(self.s.repeat_runs)]
        control_code = rep.code
        if v.invariant == "retry_cancelled":
            # Change only the intervention. The same repository scheduling function must deliver one
            # callback when the cancellation is omitted, even for bugs present at every wall date.
            control_code, substitutions = re.subn(
                r"\bcheck\(\s*await\s+cancelledRetry\(\s*schedule\s*\)\s*===\s*0\s*,",
                "check(await retryCalls(schedule, false) === 1,",
                rep.code,
            )
            if substitutions != 1:
                return "Use the retry cancellation check from the probe instructions with the repository API", []
        if v.invariant in S.TIMER_DELIVERY:
            expected = json.dumps(S.TIMER_DELIVERY[v.invariant][1], separators=(",", ":"))
            # Use the same public scheduling function for the control. Confirm that it can deliver
            # a callback independently of the failing assertion about exact times or duplicates.
            if not re.search(r"\bconst\s+trace\s*=\s*await\s+timerTrace\(\s*schedule\s*\)\s*;", rep.code):
                return "Capture const trace = await timerTrace(schedule); from the repository API", []
            assertion = re.compile(
                r"""\bcheck\(\s*JSON\.stringify\(\s*trace\s*\)\s*===\s*(["'])"""
                + re.escape(expected)
                + r"""\1\s*,\s*(["'])[^
]*?\2\s*\)\s*;?\s*\Z"""
            )
            control_code, count = assertion.subn("check(trace.length > 0, 'observed callback delivery');", rep.code)
            if count != 1:
                return f"End with check(JSON.stringify(trace) === '{expected}', 'callback timing')", []
        if v.invariant == "expiry_deadline":
            index = S.EXPIRY_STEPS.index(v.failure_kind)
            if v.expected not in {"true", "false"} or "await expiryTrace(" not in rep.code:
                return "Capture const trace = await expiryTrace(create, isExpired) using the repository API", []
            assertion = re.compile(
                rf"""\bcheck\(\s*trace\[{index}\]\s*===\s*{v.expected}\s*,\s*(["'])[^
]*?\1\s*\)\s*;?\s*\Z"""
            )
            # The neighbouring checkpoint gives a passing control even when an equality bug occurs on every date.
            other, expected = (0, "false") if v.expected == "true" else (2, "true")
            control_code, count = assertion.subn(f"check(trace[{other}] === {expected}, 'expiry control');", rep.code)
            if count != 1:
                return f"End with check(trace[{index}] === {v.expected}, 'expiry boundary')", []
        if v.invariant == "elapsed_clock_jump":
            direction = v.failure_kind
            if direction not in {"forward", "backward"}:
                return "Unknown direction for the wall-clock shift", []
            shift_call = re.compile(rf"""\bawait\s+clockJumpTrace\(\s*schedule\s*,\s*(["']){direction}\1\s*\)""")
            control_code, count = shift_call.subn("await clockJumpTrace(schedule, 'none')", rep.code)
            if count != 1 or ctrl_ms != fail_ms or rep.control.zone != rep.failing.zone:
                return f"Use clockJumpTrace(schedule, '{direction}') with matching reproduction/control points", []
        control = probe(control_code, rep.control.zone, ctrl_ms)
        checks = [
            f"reproduction at {rep.failing.zone}@{S.iso(fail_ms)}: {', '.join(r.status for r in runs)}",
            f"control at {rep.control.zone}@{S.iso(ctrl_ms)}: {control.status}",
        ]
        if any(r.status != "check_failed" for r in runs):
            bad = next(r for r in runs if r.status != "check_failed")
            return (
                f"the reproduction's check must fail at the failing point in every rerun; one run gave "
                f"{bad.status}: {' | '.join(bad.out[-3:])[:300]}",
                checks,
            )
        if control.status != "passed":
            return (
                f"the same check must pass at the control point; it gave {control.status}: "
                f"{' | '.join(control.out[-3:])[:300]}",
                checks,
            )
        # The user-level check: the same symptom through the API the package's users call. The fix must make it
        # pass too, so a patch to an internal helper that leaves users broken cannot pass the `fixed` gate.
        uc = vd.user_check
        if uc is None or not verifysession.loads_repository_code(uc.code):
            return (
                "a defect needs `user_check`: the same symptom through the API the package's users call (as in "
                "its README), loading repository code with load()",
                checks,
            )
        if uc.failing.zone != rep.failing.zone:
            return f"the user check must fail in the same zone as the reproduction ({rep.failing.zone})", checks
        uc_ms = verifysession.point_ms(uc.failing)
        user_runs = [probe(uc.code, uc.failing.zone, uc_ms) for _ in range(self.s.repeat_runs)]
        checks.append(f"user check at {uc.failing.zone}@{S.iso(uc_ms)}: {', '.join(r.status for r in user_runs)}")
        if any(r.status != "check_failed" for r in user_runs):
            bad = next(r for r in user_runs if r.status != "check_failed")
            return (
                f"the user check must fail in every rerun; one run gave {bad.status}: {' | '.join(bad.out[-3:])[:300]}",
                checks,
            )
        title = vd.title or f"{cand.unit.name}: {v.invariant.replace('_', ' ')}"
        cases = [(title, rep.code, fail_ms), (f"{title[:70]} (through the public API)", uc.code, uc_ms)]
        if control_code != rep.code:
            if rep.control.zone != rep.failing.zone:
                return "Use the same zone for the timer control", []
            label = "uncancelled control" if v.invariant == "retry_cancelled" else "delivery control"
            if v.invariant == "expiry_deadline":
                label = "expiry control"
            elif v.invariant == "elapsed_clock_jump":
                label = "unshifted clock control"
            cases.append((f"{title[:70]} ({label})", control_code, ctrl_ms))
        code = S.reproduction_test_code(
            runner=caps.test_runner,
            cases=cases,
            zone=rep.failing.zone,
            target=target,
            prefix=prefix,
        )
        (ws / reg_rel).parent.mkdir(parents=True, exist_ok=True)
        (ws / reg_rel).write_text(code, encoding="utf-8")
        cc = ClockConfig(instant=S.iso(fail_ms), time_zone=rep.failing.zone, label="reproduction")
        first = sandbox.run_test_file(self.s, ws, caps, reg_rel, [cc], **_runner_options(ex))[0]
        checks.append(f"regression test from the reproduction: {first.outcome}")
        if first.outcome != "assertion_failed":
            (ws / reg_rel).unlink(missing_ok=True)
            return (
                f"the regression test made from the reproduction must fail with an assertion; it gave "
                f"{first.outcome}: {(first.failure or '')[:300]}",
                checks,
            )
        state["test"], state["failure"] = code, runs[0].out[-1] if runs[0].out else v.detail
        if control_code != rep.code:
            state["control_code"] = control_code
        return None, checks

    def _issue_from_session(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        bug: Bug,
        unit: str,
        vd: verifysession.Verdict,
        session: verifysession.VerifySession,
    ) -> None:
        """Raven searched issues herself. Her match counts only if it is one of her search results and names the
        code under test. If she never searched, the ordinary issue search runs."""
        if session.searches == 0:
            self._match_issue(inv, rt, bug, unit)
            return
        hit = session.issues_seen.get(vd.issue_number) if vd.issue_number is not None else None
        rule = "Treated as a new finding"
        if vd.issue_number is not None and hit is None:
            rule = "An issue match must be one of Raven's search results"
        elif hit is not None and not verifysession.names_unit(hit, unit):
            hit, rule = None, f"A matched issue must name the code under test (`{unit}`)"
        elif hit is not None:
            rule = "Known issue"
        self._decide(
            inv,
            agent="raven-archivist",
            step="match_issue",
            subject=bug.id,
            claim=vd.claim,
            evidence=[],
            dropped=0,
            checks=[f"{len(session.issues_seen)} issues and pull requests seen in {session.searches} search(es)"],
            decision="rejected" if rule.startswith(("An issue", "A matched")) else "accepted",
            rule=rule,
        )
        if hit is None:
            bug.issue_match_label = "No matching public issue found"
            return
        bug.issue_match = {"number": str(hit["number"]), "title": str(hit["title"]), "url": str(hit["url"])}
        kind = "pull request" if hit.get("kind") == "pull request" else "issue"
        bug.issue_match_label = f"Known {kind}: #{hit['number']}"
        bug.status = "known-issue-match"
        self._raise_status(inv, "known-issue-match")
        self._event(inv, "raven-archivist", "compare", f"Matches public {kind} #{hit['number']}: {hit['title']}",
                    data={"issue": bug.issue_match})  # fmt: skip

    def _match_issue(self, inv: Investigation, rt: A.AgentRuntime, bug: Bug, unit: str) -> None:
        tgt = inv.target
        hidden = None
        if inv.request.mode == "blind-hunt" and inv.request.issue_url and not inv.revealed:
            hidden = parse_issue_url(inv.request.issue_url, tgt.owner, tgt.repo)
        word = {
            "expiry_boundary": "expire",
            "midnight_rollover": "midnight",
            "dst_transition": "DST",
            "timezone_conversion": "timezone",
        }.get(bug.category, "date")
        issues: list[dict[str, object]] = []
        try:
            for terms in ([unit, word], [unit]):  # the category word is a guess; a report may not use it
                issues = github.search_issues(tgt.owner, tgt.repo, terms, self.s.github_token, exclude=hidden)
                if issues:
                    break
        except OSError:
            bug.issue_match_label = "Issue search unavailable"
            return
        if not issues:
            return
        try:
            m = self._agent(
                inv,
                rt,
                "raven-archivist",
                "match_issue",
                A.prompt_issue_match(bug=f"{bug.title}\n{bug.failure}", issues=issues),
                A.IssueMatchOut,
            )
        except A.AgentUnavailable:
            bug.issue_match_label = "Possible related issues found; match not judged"
            return
        hit = next((i for i in issues if i["number"] == m.issue_number), None)
        rule = "Known issue" if hit else "Treated as a new finding"
        if m.issue_number and not hit:
            rule = "An issue match must be one of the search results"
        elif hit and unit.lower() not in f"{hit['title']}\n{hit['body']}".lower():
            hit, rule = None, f"A matched issue must name the code under test (`{unit}`)"
        self._decide(
            inv,
            agent="raven-archivist",
            step="match_issue",
            subject=bug.id,
            claim=m.reason,
            evidence=[],
            dropped=0,
            checks=[f"{len(issues)} issues and pull requests searched"],
            decision="accepted" if hit or m.issue_number is None else "rejected",
            rule=rule,
        )
        if hit:
            bug.issue_match = {"number": str(hit["number"]), "title": str(hit["title"]), "url": str(hit["url"])}
            bug.issue_match_label = f"Known issue: #{hit['number']}"
            bug.status = "known-issue-match"
            self._raise_status(inv, "known-issue-match")
            self._event(
                inv,
                "raven-archivist",
                "compare",
                f"Matches public issue #{hit['number']}: {m.reason}",
                data={"issue": bug.issue_match},
            )

    def _intended(
        self,
        inv: Investigation,
        ex: Experiment,
        cand: Candidate,
        v: Violation,
        j: A.JudgeOut,
        kept: list[Evidence],
        dropped: int,
        checks: list[str],
    ) -> None:
        """Raven says the repository means it. Code confirms: a cited repository test that passes on the original
        revision, or a cited doc line. Confirmed: an IntendedFinding (no bug, no fix). Not confirmed: not reported,
        and the decision record says why."""
        caps = inv.capabilities
        assert caps
        ws = self._ws(inv)
        tests = sorted({_SRC_REF.match(e.ref.strip()).group("p") for e in kept if e.kind == "test"})  # type: ignore[union-attr]
        docs = [e for e in kept if e.kind == "doc"]
        clock = ClockConfig(instant=v.instant, time_zone="UTC", label="repository test, as written")
        passing: list[str] = []
        for t in tests[:3]:
            r = sandbox.run_test_file(self.s, ws, caps, t, [clock])[0]
            checks.append(f"{t}: {r.outcome} on the original")
            if r.outcome == "passed":
                passing.append(t)
        confirmed = bool(passing) or (bool(docs) and not tests)
        if not confirmed:
            self._decide(
                inv,
                agent="raven-archivist",
                step="judge_violation",
                subject=ex.id,
                claim=j.claim,
                evidence=kept,
                dropped=dropped,
                checks=checks,
                decision="rejected",
                rule="Intended behaviour needs a cited repository test that passes on the original, or a cited doc "
                "line; not reported",
                phase="verification",
            )
            return
        fid = f"int_{ex.id[4:]}_{len(inv.intended) + 1}"
        title = j.title or f"{cand.unit.name}: intended {v.invariant.replace('_', ' ')}"
        inv.intended.append(
            IntendedFinding(
                id=fid,
                candidate_id=cand.id,
                experiment_id=ex.id,
                title=title,
                invariant=v.invariant,
                violation=v,
                explanation=j.claim,
                evidence=kept,
                confirmed_tests=passing,
            )
        )
        where = ", ".join(passing) if passing else ", ".join(e.ref for e in docs[:2])
        self._decide(
            inv,
            agent="raven-archivist",
            step="judge_violation",
            subject=fid,
            claim=j.claim,
            evidence=kept,
            dropped=dropped,
            checks=checks,
            decision="accepted",
            rule=f"Intended behaviour, documented by the repository ({where}); not a bug, no fix attempted",
            phase="verification",
        )
        self._event(
            inv,
            "raven-archivist",
            "verify",
            f"Intended behaviour, not a bug: {title}",
            phase="verification",
            evidence={"label": j.claim, "observed": v.detail},
            data={"intended_id": fid, "documented_by": where},
        )

    def _fix(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        bug: Bug,
        exps: list[Experiment],
        base_suite: sandbox.TestOutcome,
        base_static: dict[str, int],
        baseline_keys: set[VKey],
        t0: float,
    ) -> None:
        """Doctor Stitch works on the bug with tools (fixsession.py); code gates decide on a clean tree.

        Each attempt starts from the pinned commit. The agent reads, searches, edits and runs the regression test
        through the backend's tools until he submits. His `git diff` is then applied to a clean tree and the 8 gates
        run. A failed gate goes back to him as feedback for the next attempt, up to max_fix_attempts.
        """
        fm, caps = inv.feature_map, inv.capabilities
        assert fm and caps
        ws = self._ws(inv)
        cand = next(c for c in fm.candidates if c.id == bug.candidate_id)
        ex = next(e for e in exps if e.id == bug.experiment_id)
        bug.fix = Fix(state="in-progress", label="Fix in progress")
        self.store.save(inv)  # the board shows which bug and attempt the Crew is on
        finding = (
            f"{bug.title}\nRule {bug.invariant}: {S.INVARIANTS[bug.invariant][1]}\n"
            f"Violation: {bug.violation.detail} at {bug.violation.local} ({bug.violation.zone})\n"
            f"Code under test: {cand.unit.name} in {cand.unit.path}:{cand.unit.start_line}"
        )
        feedback: str | None = None
        previous_diff: str | None = None
        reviewed_regression = False
        for attempt in range(1, self.s.max_fix_attempts + 1):
            self._check(inv, t0)
            # A fix attempt is a session plus the 8 gates (several sweeps and the full suite).
            if not self._preflight(inv, self.s.fix_session_s + 600, f"fix attempt {attempt} for {bug.id}"):
                bug.fix.state = "no-safe-fix" if bug.fix.attempts else "skipped"
                bug.fix.label = "Fix not finished: time budget reached"
                return
            self._clean_tree(ws)
            if inv.budget.agent_calls >= self.s.max_agent_calls:
                bug.fix.state, bug.fix.label = "no-safe-fix", "No fix attempted: agent call budget reached"
                return
            inv.budget.agent_calls += 1
            self.store.save(inv)
            self._event(
                inv,
                "doctor-stitch",
                "fix",
                f"Attempt {attempt} of {self.s.max_fix_attempts} started on {bug.title}",
                phase="fix",
                data={"bug_id": bug.id, "attempt": attempt, "calls": 0, "max_calls": self.s.max_tool_calls},
            )
            session = self.sessions.open(
                settings=self.s,
                ws=ws,
                caps=caps,
                bug=bug,
                attempt=attempt,
                extra_readable={p for p in (bug.regression_test_path, ex.adapter_path) if p},
                on_event=lambda text, data: self._event(inv, "doctor-stitch", "tool", text, phase="fix", data=data),
                zone_check=lambda: self._zone_check(inv, bug, ex),
            )
            session.runner_config = ex.runner_config
            cleanup_repair = self._attach_repair_tools(session, caps, ex)

            def request_review(args: dict[str, Any], active: fixsession.FixSession = session) -> str:
                reason = str(args.get("reason", "")).strip()
                if not reason:
                    raise fixsession.ToolError("Explain which part of the regression needs independent review")
                active.regression_review = reason[:1500]
                return "Raven will review the regression on the original checkout after this session."

            session.tools.append(
                {
                    "name": "request_regression_review",
                    "description": "Ask Raven to inspect or rewrite a broken regression test independently.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {"reason": {"type": "string"}},
                        "required": ["reason"],
                    },
                }
            )
            session.repair_tools["request_regression_review"] = request_review
            try:
                rt.run_session(
                    "doctor-stitch",
                    "write_fix",
                    A.prompt_fix_session(
                        bug=finding,
                        start_at=f"{cand.unit.path}:{cand.unit.start_line}",
                        test_path=bug.regression_test_path,
                        test_code=bug.regression_test,
                        failure=bug.failure,
                        adapter_path=ex.adapter_path or "",
                        attempt=attempt,
                        max_attempts=self.s.max_fix_attempts,
                        tool_calls=self.s.max_tool_calls,
                        previous_diff=previous_diff,
                        feedback=feedback,
                    )
                    + _REPAIR_PROMPT,
                    session,
                    self.s.fix_session_s + 120,
                )
            except A.AgentUnavailable as e:
                if isinstance(e, A.AgentQuotaReached):
                    self._quota_note(inv, str(e))
                bug.fix.state, bug.fix.label = "no-safe-fix", f"No fix attempted: {e}"
                return
            finally:
                self.sessions.close(session)
                cleanup_repair(session.submission is not None)
            sub = session.submission
            diff = git(ws, ["diff"]) if sub else ""
            self._clean_tree(ws)
            if session.regression_review and not reviewed_regression:
                reviewed_regression = True
                cleanup_repair(False)
                self._event(
                    inv,
                    "doctor-stitch",
                    "fix",
                    "Doctor Stitch asked Raven to revalidate the regression on the original revision",
                    phase="fix",
                    data={"bug_id": bug.id, "reason": session.regression_review},
                )
                report = bug.violation.model_copy()
                replacement = self._verify(inv, rt, ex, report, verification_feedback=session.regression_review)
                if replacement:
                    bug.regression_test_path = replacement.regression_test_path
                    bug.regression_test = replacement.regression_test
                    bug.reproduction = replacement.reproduction
                    bug.clock = replacement.clock
                    bug.failure = replacement.failure
                    feedback = "Raven produced and verified a replacement regression. Use it for the next attempt."
                    self.store.save(inv)
                else:
                    feedback = "Raven could not validate a replacement regression. Check the original diagnostics."
                continue
            if not sub or not diff.strip():
                cleanup_repair(False)
                why = "did not submit a change" if not sub else "submitted no change"
                feedback = (
                    f"You {why} within the tool budget. Find the cause, change it, run the regression test, "
                    "then submit."
                )
                previous_diff = diff
                bug.fix.attempts.append(
                    FixAttempt(
                        attempt=attempt,
                        summary=f"No patch: Doctor Stitch {why}",
                        diff="",
                        tool_calls=session.calls,
                        test_runs=session.tests,
                    )
                )
                self._event(
                    inv,
                    "doctor-stitch",
                    "fix",
                    f"Attempt {attempt}: no patch ({why})",
                    phase="fix",
                    data={"bug_id": bug.id},
                )
                continue
            kept, dropped = self._evidence(inv, sub.evidence)
            if not any(e.kind == "source" for e in kept):
                cleanup_repair(False)
                feedback = "root_cause must cite the responsible source lines as path:line evidence that exists"
                previous_diff = diff
                bug.fix.attempts.append(
                    FixAttempt(
                        attempt=attempt,
                        summary=sub.summary,
                        root_cause=sub.root_cause,
                        diff=diff,
                        tool_calls=session.calls,
                        test_runs=session.tests,
                    )
                )
                self._decide(
                    inv,
                    agent="doctor-stitch",
                    step="write_fix",
                    subject=bug.id,
                    claim=sub.root_cause,
                    evidence=kept,
                    dropped=dropped,
                    checks=["no resolvable source evidence"],
                    decision="rejected",
                    rule="A patch without a resolvable root cause is not tested",
                    phase="fix",
                )
                continue
            try:
                gates = self._gates(inv, rt, bug, diff, exps, base_suite, base_static, baseline_keys)
            except BaseException:
                cleanup_repair(False)
                raise
            self._clean_tree(ws)  # the workspace returns to the original revision either way
            fa = FixAttempt(
                attempt=attempt,
                summary=sub.summary,
                root_cause=sub.root_cause,
                diff=diff,
                gates=gates,
                accepted_by_gates=len(gates) == 8 and all(g.passed for g in gates),
                tool_calls=session.calls,
                test_runs=session.tests,
            )
            bug.fix.attempts.append(fa)
            for g in gates:
                self._event(
                    inv,
                    "watchtower-warden",
                    "gate",
                    f"Gate {g.gate}: {'passed' if g.passed else 'failed'}",
                    phase="fix",
                    data={"bug_id": bug.id, "attempt": attempt, **g.model_dump()},
                )
            failed = [g for g in gates if not g.passed]
            if not fa.accepted_by_gates:
                cleanup_repair(False)
            self._decide(
                inv,
                agent="doctor-stitch",
                step="write_fix",
                subject=bug.id,
                claim=sub.root_cause,
                evidence=kept,
                dropped=dropped,
                checks=[f"{g.gate}: {g.detail}" for g in gates],
                decision="accepted" if fa.accepted_by_gates else "rejected",
                rule="All eight gates passed"
                if fa.accepted_by_gates
                else f"Rejected at gate {failed[0].gate}"
                if failed
                else "Gates incomplete",
                phase="fix",
            )
            if fa.accepted_by_gates:
                self._save_patch(inv, bug, ex, diff)
                bug.fix.state, bug.fix.label = "verified", "Suggested fix · verified"
                bug.status = "fixed-version-verified"
                self._raise_status(inv, "fixed-version-verified")
                vid = f"patched-{bug.id}"
                inv.versions.append(
                    Version(
                        id=vid,
                        label=f"{inv.versions[0].label} + fix for {bug.id}",
                        role="patched",
                        result="passes",
                        includes_suggested_fix=True,
                    )
                )
                self._event(
                    inv,
                    "doctor-stitch",
                    "fix",
                    f"Suggested fix · verified: {sub.summary}",
                    phase="fix",
                    version=vid,
                    check={"versionId": vid, "result": "passes"},
                    data={"bug_id": bug.id},
                )
                return
            feedback = "\n".join(f"{g.gate}: {g.detail}" for g in failed)
            previous_diff = diff
            self._event(
                inv,
                "doctor-stitch",
                "fix",
                f"Attempt {attempt} rejected by the gates",
                phase="fix",
                data={"bug_id": bug.id},
            )
        bug.fix.state, bug.fix.label = "no-safe-fix", "No safe fix found"

    def _zone_check(self, inv: Investigation, bug: Bug, ex: Experiment) -> str:
        """For Doctor Stitch's check_all_zones tool: the bug's experiment in every sweep zone, as the `fixed` gate
        runs it, on his working copy. Only guidance: the gate runs it again on a clean tree."""
        outputs, errors = self._sweep(inv, [ex], S.SWEEP_ZONES)[ex.id]
        if errors or set(outputs) != set(S.SWEEP_ZONES) or sum(map(len, outputs.values())) != ex.point_count:
            return "ERROR: incomplete sweep. " + (errors[0][:400] if errors else "")
        broken = [
            v
            for v in S.check(outputs, ex.invariants)
            if v.invariant == bug.invariant
            and (not bug.violation.failure_kind or v.failure_kind == bug.violation.failure_kind)
        ]
        if not broken:
            return f"PASSED: targeted failure cleared in all {len(outputs)} zones"
        zones = sorted({v.zone for v in broken})
        lines = [f"{v.zone} at {v.local}: {v.detail}" for v in broken[:8]]
        return f"FAILED in {len(zones)} of {len(outputs)} zones: {', '.join(zones)}\n" + "\n".join(lines)

    @staticmethod
    def _clean_tree(ws: Path) -> None:
        """Tracked files back to the pinned commit. Untracked files (installed modules, TimeWraith's adapters,
        harnesses and regression tests) stay: the agent's tools cannot create or edit them."""
        git(ws, ["checkout", "--", "."])

    def _gates(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        bug: Bug,
        diff_text: str,
        exps: list[Experiment],
        base_suite: sandbox.TestOutcome,
        base_static: dict[str, int],
        baseline_keys: set[VKey],
    ) -> list[GateResult]:
        """The 8 gates on a clean tree with only `diff_text` applied. The caller cleans the tree afterwards."""
        caps = inv.capabilities
        assert caps
        ex = next((item for item in exps if item.id == bug.experiment_id), None)
        ws = self._ws(inv)
        n = self.s.repeat_runs
        if ex and ex.runner_config:
            originals = [
                sandbox.run_test_file(self.s, ws, caps, bug.regression_test_path, [bug.clock], **_runner_options(ex))[0]
                for _ in range(n)
            ]
            if any(r.outcome != "assertion_failed" for r in originals):
                return [GateResult(gate="test_first", passed=False, detail="Regression did not fail on original code")]
        gates = [
            GateResult(
                gate="test_first",
                passed=True,
                detail=f"Repeated {n}/{n} and the generated regression test failed on the original",
            )
        ]

        # diff_limits: what git says the patch changes, checked before anything runs
        self._clean_tree(ws)
        problems: list[str] = []
        paths: list[str] = []
        added = removed = 0
        try:
            numstat = git(ws, ["apply", "--numstat", "-"], stdin=diff_text)
        except IngestError as e:
            numstat = ""
            problems.append(f"patch does not apply to the original: {e}")
        for ln in numstat.splitlines():
            a, r, p = (ln.split("\t", 2) + ["", "", ""])[:3]
            paths.append(p)
            added += int(a) if a.isdigit() else 0
            removed += int(r) if r.isdigit() else 0
        for p in paths:
            if ".." in p.split("/") or p.startswith("/"):
                problems.append(f"path outside the repository: {p}")
            elif PROTECTED.search(p) or is_test_file(p) or p.startswith(".git/"):
                problems.append(f"protected file: {p}")
        changed = added + removed
        if len(paths) > self.s.max_patch_files:
            problems.append(f"{len(paths)} files changed (limit {self.s.max_patch_files})")
        if changed > self.s.max_patch_lines:
            problems.append(f"{changed} changed lines (limit {self.s.max_patch_lines})")
        if not problems and changed == 0:
            problems.append("patch changes nothing")
        gates.append(
            GateResult(
                gate="diff_limits",
                passed=not problems,
                detail="; ".join(problems) or f"{len(paths)} file(s), +{added} −{removed} lines",
            )
        )
        if problems:
            return gates
        git(ws, ["apply", "--whitespace=nowarn", "-"], stdin=diff_text)

        # fixed: regression test passes n times, and the full 13-zone sweep shows the invariant holds
        res = [
            sandbox.run_test_file(self.s, ws, caps, bug.regression_test_path, [bug.clock], **_runner_options(ex))[0]
            for _ in range(n)
        ]
        reg_ok = all(r.outcome == "passed" for r in res)
        full = self._sweep(inv, exps, S.SWEEP_ZONES) if reg_ok else {}
        after: dict[str, list[Violation]] = {e.id: S.check(full[e.id][0], e.invariants) for e in exps if e.id in full}
        still = [
            v
            for v in after.get(bug.experiment_id, [])
            if v.invariant == bug.invariant
            and (not bug.violation.failure_kind or v.failure_kind == bug.violation.failure_kind)
        ]
        complete = reg_ok and all(
            not full[e.id][1]
            and set(full[e.id][0]) == set(S.SWEEP_ZONES)
            and sum(map(len, full[e.id][0].values())) == e.point_count
            for e in exps
        )
        ok = complete and not still
        detail = (
            f"Regression test: {', '.join(r.outcome for r in res)}"
            if not reg_ok
            else "Incomplete sweep after the patch"
            if not complete
            else f"Failure still reproduced in {', '.join(v.zone for v in still[:4])}"
            if still
            else f"Regression test passed {n}/{n}; targeted failure cleared in all {len(S.SWEEP_ZONES)} zones"
        )
        gates.append(GateResult(gate="fixed", passed=ok, detail=detail))
        if not ok:
            return gates

        # mutation_check: undo only the source change; the test must fail again
        self._clean_tree(ws)
        m = sandbox.run_test_file(self.s, ws, caps, bug.regression_test_path, [bug.clock], **_runner_options(ex))[0]
        git(ws, ["apply", "--whitespace=nowarn", "-"], stdin=diff_text)
        gates.append(
            GateResult(
                gate="mutation_check",
                passed=m.outcome == "assertion_failed",
                detail=f"Without the fix the regression test is {m.outcome}",
            )
        )
        if m.outcome != "assertion_failed":
            return gates

        # no_regressions: the full suite has no new failures
        suite = sandbox.run_suite(self.s, ws, caps)
        new = sorted(suite.failed_names - base_suite.failed_names)
        suite_ran = suite.total > 0 or base_suite.total == 0
        detail = (
            f"New failures: {', '.join(new[:5])}"
            if new
            else "Suite could not run after the patch"
            if not suite_ran
            else f"{suite.total} tests, no new failures"
        )
        gates.append(GateResult(gate="no_regressions", passed=suite_ran and not new, detail=detail))
        if new or not suite_ran:
            return gates

        # no_new_anomalies: no experiment shows a violation it did not show before
        after_keys: set[VKey] = set()
        for eid, vs in after.items():
            after_keys |= _keys(eid, vs)
        worse = sorted(after_keys - baseline_keys)
        detail = (
            ("New violations: " + "; ".join(f"{k[1]} {k[2]}" for k in worse[:4]))
            if worse
            else (f"{len(exps)} experiments swept again, no new violations")
        )
        gates.append(GateResult(gate="no_new_anomalies", passed=not worse, detail=detail))
        if worse:
            return gates

        # static_checks: the repo's own typecheck and lint, compared with before
        after_static = sandbox.static_checks(self.s, ws, caps)
        broke = [k for k, code in after_static.items() if base_static.get(k) == 0 and code != 0]
        detail = (
            f"Now failing: {', '.join(broke)}"
            if broke
            else ", ".join(f"{k}: {'pass' if v == 0 else 'failing before and after'}" for k, v in after_static.items())
            or "No typecheck or lint configured"
        )
        gates.append(GateResult(gate="static_checks", passed=not broke, detail=detail))
        if broke:
            return gates

        # independent_review: Raven sees the diff, not Doctor Stitch's reasoning
        try:
            rv = self._agent(
                inv,
                rt,
                "raven-archivist",
                "review_fix",
                A.prompt_review_fix(bug=f"{bug.title}\n{bug.failure}", diff=diff_text, test_code=bug.regression_test),
                A.ReviewFixOut,
            )
            gates.append(GateResult(gate="independent_review", passed=rv.approve, detail=rv.reason))
        except A.AgentUnavailable as e:
            gates.append(GateResult(gate="independent_review", passed=False, detail=f"Review not run: {e}"))
        return gates

    def _save_patch(self, inv: Investigation, bug: Bug, ex: Experiment, diff: str) -> None:
        """Source change plus the adapter and the regression test as new files."""
        d = self.s.artifacts / inv.id
        d.mkdir(parents=True, exist_ok=True)
        new_files = [(bug.regression_test_path, bug.contribution_test or bug.regression_test)]
        if ex.adapter == "js_sweep":
            new_files.insert(0, (ex.adapter_path or "", ex.adapter_code or ""))
        extra = "".join(
            "".join(difflib.unified_diff([], text.splitlines(True), "/dev/null", f"b/{path}"))
            for path, text in new_files
            if path
        )
        (d / f"{bug.id}.patch").write_text(diff + extra, encoding="utf-8")

    def _reveal(self, inv: Investigation, rt: A.AgentRuntime) -> None:
        if inv.request.mode != "blind-hunt":
            return
        issue = (self.s.artifacts / inv.id / "issue.txt").read_text(encoding="utf-8")
        inv.revealed = True
        findings = "\n".join(f"- {b.title} ({b.invariant}, {b.clock.time_zone})" for b in inv.bugs) or "(no findings)"
        try:
            r = self._agent(
                inv, rt, "raven-archivist", "reveal", A.prompt_reveal(findings=findings, issue=issue), A.RevealOut
            )
            outcome: str = r.outcome
            text = f"Reveal: {r.outcome}. {r.reason}"
        except A.AgentUnavailable:
            outcome, text = "not-judged", "Reveal: the sealed issue is shown; comparison needs the agent runtime"
        self._event(
            inv,
            "two-faced-jack",
            "reveal",
            text,
            phase="verification",
            data={"issue_url": inv.request.issue_url, "outcome": outcome},
        )

    def _finish(self, inv: Investigation) -> None:
        inv.stage = "completed"
        inv.replay_label = "Recorded investigation replay"
        self._event(inv, "wraith-director", "stage", "Case filed", data={"stage": "completed"})


def _runner_options(experiment: Experiment | None) -> dict[str, str]:
    return {"runner_config": experiment.runner_config} if experiment and experiment.runner_config else {}


def _edge_kind(v: Violation) -> str:
    """The clock situation of a violation: a DST change near it, a month end, or something else."""
    ms = S.parse_instant(v.instant)
    near = S.situation(v.zone, ms) if ms is not None else None
    if near:
        return near
    day = v.local[8:10]
    return "month end" if day in {"01", "28", "29", "30", "31"} else "other"


def _pr_text(
    bug: Bug,
    attempt: FixAttempt,
    rules: contribute.Rules,
    src_paths: list[str],
    files: list[str],
    test_path: str,
    checks: list[CheckResult],
) -> tuple[str, str, bool]:
    """The pull request title and description, written the way the repository asks: its title style, its pull request
    template when it has one (otherwise a plain description), and the disclosure. The last value says the patch was
    left out because GitHub caps the text."""
    rs = rules.summary
    title = contribute.conventional_title(bug.title, rs)
    related = [f"#{bug.issue_match['number']}"] if bug.issue_match else []
    source_ref = next((e.ref for e in bug.evidence if e.kind == "source"), None)

    def describe(level: int, with_diff: bool) -> str:
        return contribute.describe(
            level=level, summary=attempt.summary, root_cause=attempt.root_cause, diff=attempt.diff,
            sources=src_paths, zone=bug.violation.zone, instant=bug.violation.instant,
            local=bug.violation.local, detail=bug.violation.detail, count=bug.violation.count,
            reproduction=bug.contribution_test or (bug.reproduction or {}).get("code", ""), source_ref=source_ref,
            checks=[(c.name, c.command, c.passed or c.preexisting) for c in checks], test_path=test_path,
            related=related, with_diff=with_diff,
        )  # fmt: skip

    changes = [f"`{p}`: {'the fix' if p in src_paths else 'regression test'}" for p in files]
    passed = {c.name: c.passed for c in checks}

    def ran_clean(prefix: str) -> bool:
        return any(c.passed for c in checks if c.name.startswith(prefix))

    eslint, prettier, tsc = ran_clean("ESLint"), ran_clean("Prettier"), ran_clean("TypeScript")
    # A box is ticked by the first key found in its label, so the order matters.
    verified = {
        "bug fix": True,
        "added tests": True,
        "test improvement": True,
        "rebased": True,  # the branch is one commit on the upstream tip
        "tests pass": all(v for k, v in passed.items() if "test" in k.lower()),
        "eslint": eslint,
        "prettier": prettier,
        # The sandbox ran `tsc --noEmit` on the repository's tsconfig: the compile `npm run build` does, minus output.
        "typescript compilation": tsc,
        "typescript errors": tsc,
        "style guidelines": eslint and prettier,
        "coding standards": eslint and prettier,
        "tests": True,  # a box that only asks for tests ("written one or more tests…"); the fix adds one
    }

    def compose(with_diff: bool) -> str:
        if not rules.template:
            return describe(2, with_diff) + contribute.DISCLOSURE
        filled = contribute.fill_template(
            rules.template, description=describe(3, with_diff), changes=changes, related=related, verified=verified
        )
        return filled + contribute.DISCLOSURE

    body = compose(True)
    if len(body) > publish.MAX_BODY - 200:  # GitHub text is capped at MAX_BODY: drop the diff before the rest
        return title, compose(False), True
    return title, body, False


def _eslint_fix(ws: Path, sh: Callable[[str], sandbox.Exec], paths: list[str], src_paths: list[str]) -> None:
    """Let the repository's own ESLint settle style rules that Prettier cannot (a multi-line `if` without braces
    under `curly`). A fixed source file is kept only when ESLint touched a few lines; anything larger would be an
    unrelated rewrite of the maintainers' code, so the file is put back and the check reports the real error."""
    before = {p: (ws / p).read_bytes() for p in src_paths}
    sh(f"node_modules/.bin/eslint --fix --quiet {q_all(paths)} || true")
    for p, old in before.items():
        new = (ws / p).read_bytes()
        if new == old:
            continue
        a, b = old.decode("utf-8", "replace").splitlines(), new.decode("utf-8", "replace").splitlines()
        changed = sum(
            1 for ln in difflib.unified_diff(a, b, n=0, lineterm="") if ln[:1] in "+-" and ln[:3] not in ("+++", "---")
        )
        if changed > _MAX_ESLINT_FIX_LINES:
            (ws / p).write_bytes(old)


_MAX_ESLINT_FIX_LINES = 8


def q_all(paths: list[str]) -> str:
    """File paths quoted for the sandbox's shell."""
    return " ".join(shlex.quote(p) for p in paths)


def _force_rmtree(path: Path) -> None:
    """Remove a folder, including the read-only object files git leaves on Windows."""

    def retry(fn: Callable[..., object], filename: str, error: BaseException) -> None:
        item = Path(filename)
        if not isinstance(error, PermissionError) or item.is_symlink():
            raise error
        item.chmod(item.stat().st_mode | stat.S_IWUSR)
        fn(filename)

    if path.exists():
        shutil.rmtree(path, onexc=retry)


def _expectation_subject(candidate: Candidate) -> str:
    if candidate.unit.name != "(module)":
        return candidate.unit.name
    path = Path(candidate.unit.path)
    return path.parent.name if path.stem == "index" and path.parent.name else path.stem


def _rule_problem(inv_id: str, detail: str) -> str:
    return (
        f"rule {inv_id} breaks at an ordinary instant ({detail}): the field it reads probably does not mean what "
        "the rule says"
    )


def _rule_ids(e: Experiment) -> str:
    return ", ".join([*S.ALWAYS, *(i.id for i in e.invariants)])


def _derive_invariants(
    chosen_list: list[InvariantUse], fields: list[OutputField], adapter_code: str
) -> tuple[list[InvariantUse], list[str]]:
    """The rules an experiment checks: the agent's picks plus every rule its returned fields can feed (so detection
    does not depend on what the agent remembered), minus rules the adapter cannot feed, and minus
    `instant_zone_independent` when the adapter passes ctx.tz into the code. Returns (rules, check notes)."""
    checks: list[str] = []
    chosen = {iu.id for iu in chosen_list}
    implied = [
        InvariantUse.model_validate({"id": i, "reason": f"Added by code: the adapter returns `{need}`"})
        for i in S.ORDER
        if (need := S.INVARIANTS[i][0])
        and i not in S.ALWAYS
        and i != "calendar_contract"
        and i not in chosen
        and need in fields
    ]
    if implied:
        checks.append(f"added by code from the returned fields: {', '.join(i.id for i in implied)}")
    zone_input = S.passes_zone(adapter_code)
    invs: list[InvariantUse] = []
    for iu in [*chosen_list, *implied]:
        if iu.id not in S.INVARIANTS:
            continue
        if iu.id == "calendar_contract" and not iu.expectation_ref:
            checks.append("Skipped the calendar contract: no repository test or documentation citation was resolved")
            continue
        need = S.INVARIANTS[iu.id][0]
        if iu.id in S.ALWAYS or any(x.id == iu.id for x in invs):
            continue
        if need and need not in fields:
            checks.append(f"dropped {iu.id}: adapter does not return `{need}`")
            continue
        if iu.id == "instant_zone_independent" and zone_input:
            checks.append(f"dropped {iu.id}: the adapter passes ctx.tz into the code, so the zone is an input")
            continue
        invs.append(iu)
    return invs, checks


@contextmanager
def _aside(ws: Path, folders: list[str]) -> Iterator[None]:
    """Move TimeWraith's own folders (`__tw__/`, `.tw/`) out of the workspace for the block, then put them back,
    so the repository's install scripts (a `prepare` build, a lint) never see agent-written files."""
    store = ws.parent / "tw-aside"
    shutil.rmtree(store, ignore_errors=True)
    moved: list[tuple[Path, Path]] = []
    try:
        for i, rel in enumerate(folders):
            src = ws / rel
            if src.is_dir():
                dst = store / str(i)
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(src, dst)
                moved.append((src, dst))
        yield
    finally:
        for src, dst in moved:
            if src.exists():
                shutil.rmtree(src, ignore_errors=True)
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(dst, src)
        shutil.rmtree(store, ignore_errors=True)


def _tracked(ws: Path) -> frozenset[str]:
    try:
        return frozenset(ln for ln in git(ws, ["ls-files", "-z"]).split("\0") if ln)
    except IngestError:
        return frozenset()


def _tracked_changes(ws: Path) -> list[str]:
    """Files git tracks that differ from the commit (an install repair must not leave any)."""
    try:
        return [ln[3:] for ln in git(ws, ["status", "--porcelain", "-uno"]).splitlines() if ln.strip()]
    except IngestError:
        return []


def _next_bug_id(inv: Investigation, ex: Experiment) -> str:
    base = f"bug_{ex.id[4:]}"
    taken = {bug.id for bug in inv.bugs}
    candidate = base
    index = 1
    while candidate in taken:
        index += 1
        candidate = f"{base}_{index}"
    return candidate


def _keys(exp_id: str, vs: list[Violation]) -> set[VKey]:
    return {(exp_id, v.invariant, v.zone, v.instant, v.failure_kind) for v in vs}


def _reading(zone: str, instant: str, unit: str) -> ServerClockReading:
    return ServerClockReading(
        tz=zone,
        dateUnderTest=instant[:10],
        label=f"Test process clock set: TZ={zone}, {instant}; unit-level sweep of {unit}",
    )


def _source_ok(ws: Path, ref: str) -> bool:
    m = _SRC_REF.match(ref.strip())
    if not m:
        return False
    p = (ws / m.group("p").replace("\\", "/").lstrip("/")).resolve()
    if ws.resolve() not in p.parents or not p.is_file():
        return False
    try:
        n = len(p.read_text(encoding="utf-8", errors="ignore").splitlines())
    except OSError:
        return False
    a = int(m.group("a"))
    b = int(m.group("b") or a)
    return 1 <= a <= b <= n
