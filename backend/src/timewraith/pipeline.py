"""The investigation state machine. Agents propose; this code decides every transition.

Stages: cloning → analyzing → discovering → planning → (plan approval) → installing → experimenting → verifying
→ fixing → completed. Every fix must pass all eight gates (user decision 2026-11-11) before it is called verified.
"""

from __future__ import annotations

import difflib
import re
import shutil
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from . import agents as A
from . import github, sandbox
from .analyze import analyze, is_test_file
from .config import Settings
from .discovery import build_feature_map
from .ingest import IngestError, clone, make_target, parse_issue_url, resolve_ref
from .models import (
    LADDER,
    Actor,
    Bug,
    ClockConfig,
    CreateInvestigation,
    EventKind,
    EvidenceStatus,
    Experiment,
    Fix,
    FixAttempt,
    GateResult,
    Investigation,
    ReplayEvent,
    RunResult,
    ServerClockReading,
    Version,
)
from .planning import build_test_plan
from .store import Store

Originals = dict[str, str | None]

PROTECTED = re.compile(
    r"(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|\.github/.*|"
    r"(vitest|jest|vite|babel|eslint|prettier)\.config\.[^/]+|\.eslintrc[^/]*|__tw__/.*)$"
)
RUNNING = {"cloning", "analyzing", "discovering", "planning", "installing", "experimenting", "verifying", "fixing"}


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

    # ---------- public API ----------

    def create(self, req: CreateInvestigation) -> Investigation:
        target = make_target(req.repository_url, req.ref)
        if req.mode != "open-hunt":
            if not req.issue_url:
                raise IngestError("issue_required", "Known issue and Blind hunt need an issue URL")
            parse_issue_url(req.issue_url, target.owner, target.repo)
        inv = Investigation(id=str(uuid.uuid4()), created_at=now_iso(), request=req, target=target)
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
        self._event(
            inv,
            "watchtower-warden",
            "approval",
            f"Fix for {bug.title} {'accepted' if accept else 'rejected'} by the user",
            data={"approval": "fix", "bug_id": bug_id, "accepted": accept},
        )
        self.store.save(inv)
        return inv

    def cancel(self, inv_id: str) -> None:
        self._cancel.add(inv_id)
        inv = self._get(inv_id)
        if inv.stage == "awaiting-plan-approval" or inv.stage == "queued":
            inv.stage = "cancelled"
            self.store.save(inv)

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

    def _start(self, inv_id: str, fn: object) -> None:
        def go() -> None:
            with self._slots:
                inv = self._get(inv_id)
                t0 = time.monotonic()
                try:
                    fn(inv)  # type: ignore[operator]
                except Stop as e:
                    inv.stage, inv.error = ("cancelled", None) if e.code == "cancelled" else ("failed", e.code)
                    inv.notes.append(str(e))
                    self._event(inv, "watchtower-warden", "stage", f"Stopped: {e}", data={"code": e.code})
                except IngestError as e:
                    inv.stage, inv.error = "failed", e.code
                    inv.notes.append(str(e))
                    self._event(inv, "watchtower-warden", "stage", f"Stopped: {e}", data={"code": e.code})
                except Exception as e:  # noqa: BLE001 (record, never crash the server)
                    inv.stage, inv.error = "failed", "internal_error"
                    inv.notes.append(f"Internal error: {type(e).__name__}")
                    self._event(
                        inv, "watchtower-warden", "stage", "Stopped: internal error", data={"code": "internal_error"}
                    )
                finally:
                    inv.budget.active_seconds += time.monotonic() - t0
                    self.store.save(inv)

        threading.Thread(target=go, daemon=True, name=f"inv-{inv_id[:8]}").start()

    def _ws(self, inv: Investigation) -> Path:
        return self.s.workspaces / inv.id / "repo"

    def _check(self, inv: Investigation, t0: float) -> None:
        if inv.id in self._cancel:
            raise Stop("cancelled", "Cancelled by the user")
        if inv.budget.active_seconds + (time.monotonic() - t0) > self.s.investigation_budget_s:
            raise Stop("budget_time", "Time budget of the investigation reached")

    def _stage(self, inv: Investigation, stage: str, text: str) -> None:
        inv.stage = stage  # type: ignore[assignment]
        self._event(inv, "watchtower-warden", "stage", text, data={"stage": stage})
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
            vid = version or (inv.versions[0].id if inv.versions else "pending")
            ev = ReplayEvent(
                id=f"e{seq + 1:03d}",
                seq=seq,
                tOffsetMs=offset,
                actor=actor,
                kind=kind,
                text=text,
                status=inv.status,
                versionId=vid,
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
        return rt.call(agent, step, prompt, schema)

    def _runtime(self, inv: Investigation) -> A.AgentRuntime:
        return A.make_runtime(
            self.s,
            lambda agent, step, outcome, detail: self.store.audit(inv.id, now_iso(), agent, step, outcome, detail),
        )

    # ---------- phase one: clone, analyze, discover, plan ----------

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
            "bat-scout",
            "capability",
            "Capability report ready",
            data={"items": [i.model_dump() for i in caps.items]},
        )
        if any(i.id == "language.js_ts" and i.status == "unsupported" for i in caps.items):
            inv.notes.append("Repository language is not supported in this version; no experiments planned")
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

        self._stage(inv, "discovering", "Searching the source for time-sensitive code")
        fm = build_feature_map(ws, self.s.max_parse_bytes, hints)
        inv.feature_map = fm
        self._event(
            inv,
            "bat-scout",
            "explore",
            f"{len(fm.signals)} time signals in {len({s.path for s in fm.signals})} files; "
            f"{len(fm.candidates)} candidates (not proven bugs)",
            data={"top": [{"id": c.id, "title": c.title, "score": c.score} for c in fm.candidates[:10]]},
        )
        self._check(inv, t0)

        top = fm.candidates[: self.s.max_review_candidates]
        sig = {s.id: s for s in fm.signals}
        try:
            out = self._agent(
                inv,
                rt,
                "bat-scout",
                "review_candidates",
                A.prompt_review(
                    [
                        {
                            "candidate_id": c.id,
                            "unit": c.unit.name,
                            "path": c.unit.path,
                            "categories": c.bug_categories,
                            "score": c.score,
                            "signals": [sig[i].excerpt for i in c.signal_ids[:6]],
                        }
                        for c in top
                    ]
                ),
                A.ReviewOut,
            )
            known = {c.id: c for c in top}
            for item in out.items:
                if item.candidate_id in known and item.keep:  # references to unknown ids are dropped
                    known[item.candidate_id].selected = True
                    known[item.candidate_id].rationale = item.rationale
        except A.AgentUnavailable:
            for c in top:
                if c.score >= 3:
                    c.selected = True
                    c.rationale = "Agent review not run; selected by deterministic score"
        self._stage(inv, "planning", "Designing temporal experiments")
        inv.test_plan = plan = build_test_plan(fm.candidates, caps, self.s.max_experiment_candidates)
        self._event(
            inv,
            "pumpkin-mechanic",
            "plan",
            f"{len(plan.experiments)} experiments planned on "
            f"{len({e.candidate_id for e in plan.experiments})} candidates (planned, not run)",
            data={"ready": sum(e.executability == "ready" for e in plan.experiments)},
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

    # ---------- phase two: install, experiment, verify, fix ----------

    def _phase_two(self, inv: Investigation, t0: float | None = None) -> None:
        t0 = t0 or time.monotonic()
        rt = self._runtime(inv)
        caps, plan, fm = inv.capabilities, inv.test_plan, inv.feature_map
        assert caps and plan and fm
        ok, why = sandbox.docker_available()
        if not ok:
            raise Stop("sandbox_unavailable", f"Execution not run: {why}")
        if not caps.package_manager or not caps.test_runner:
            inv.notes.append("Execution not run: no lockfile or no supported test runner (see capability report)")
            self._finish(inv)
            return
        ws = self._ws(inv)
        self._stage(inv, "installing", "Installing dependencies in an isolated container")
        res = sandbox.install(self.s, ws, caps)
        if res.code != 0:
            raise Stop("install_failed", "Dependency install failed in the sandbox")
        self._check(inv, t0)

        self._stage(inv, "experimenting", "Running controlled-clock experiments")
        cands = {c.id: c for c in fm.candidates}
        kept: dict[str, tuple[Experiment, str]] = {}  # experiment id -> (experiment, test path)
        issue_ctx = None
        if inv.request.mode == "known-issue":
            issue_ctx = (self.s.artifacts / inv.id / "issue.txt").read_text(encoding="utf-8")
        anomalies: list[tuple[Experiment, str, str, int, str]] = []
        for ex in plan.experiments:
            self._check(inv, t0)
            if ex.executability == "not_controllable":
                continue
            c = cands[ex.candidate_id]
            src_path = ws / c.unit.path
            source = src_path.read_text(encoding="utf-8", errors="ignore")
            ext = ".ts" if src_path.suffix in {".ts", ".tsx", ".mts", ".cts"} else ".js"
            test_rel = (Path(c.unit.path).parent / "__tw__" / f"{src_path.stem}.{ex.id}.tw.test{ext}").as_posix()
            try:
                out = self._agent(
                    inv,
                    rt,
                    "pumpkin-mechanic",
                    "write_experiment",
                    A.prompt_experiment(
                        unit=c.unit.name,
                        path=c.unit.path,
                        source=source[:60_000],
                        category=ex.category,
                        clocks=[k.model_dump() for k in ex.clocks],
                        runner=caps.test_runner,
                        test_path=test_rel,
                        issue=issue_ctx,
                    ),
                    A.ExperimentOut,
                )
            except A.AgentUnavailable as e:
                inv.notes.append(f"{ex.id}: experiment not written ({e})")
                continue
            (ws / test_rel).parent.mkdir(parents=True, exist_ok=True)
            (ws / test_rel).write_text(out.test_code, encoding="utf-8")
            self._event(
                inv,
                "pumpkin-mechanic",
                "dispatch",
                f"Experiment on {c.title}: {out.expectation}",
                data={"experiment_id": ex.id},
            )
            results = sandbox.run_test_file(self.s, ws, caps, test_rel, ex.clocks)
            meaningful = False
            for clock, r in zip(ex.clocks, results, strict=True):
                inv.runs.append(
                    RunResult(
                        experiment_id=ex.id,
                        clock=clock,
                        outcome=r.outcome,  # type: ignore[arg-type]
                        failure=r.failure,
                    )
                )
                meaningful = meaningful or r.outcome in {"passed", "assertion_failed"}
                if r.outcome == "assertion_failed":
                    self._raise_status(inv, "observed-anomaly")
                    self._event(
                        inv,
                        "spider-weaver",
                        "observe",
                        f"Anomaly at {clock.label} ({clock.time_zone})",
                        clock=self._clock(clock, c.unit.name),
                        evidence={"label": out.expectation, "observed": (r.failure or "")[:300]},
                    )
                    anomalies.append((ex, test_rel, out.test_code, ex.clocks.index(clock), r.failure or ""))
            if meaningful:
                kept[ex.id] = (ex, test_rel)
            else:
                (ws / test_rel).unlink(missing_ok=True)
                inv.notes.append(f"{ex.id}: experiment could not run (setup or test error); not counted")
        self.store.save(inv)

        self._stage(inv, "verifying", "Repeating anomalies from clean containers")
        seen: set[str] = set()
        for ex, test_rel, code, idx, failure in anomalies:
            if ex.id in seen:
                continue  # first failing clock per experiment
            seen.add(ex.id)
            self._check(inv, t0)
            bug = self._verify(inv, rt, ex, test_rel, code, idx, failure)
            if bug:
                inv.bugs.append(bug)
                self.store.save(inv)
        for eid, (_ex, test_rel) in list(kept.items()):
            if not any(b.experiment_id == eid for b in inv.bugs) and any(
                r.experiment_id == eid and r.outcome == "assertion_failed" for r in inv.runs
            ):
                (ws / test_rel).unlink(missing_ok=True)  # anomaly not confirmed: drop the test so it cannot skew gates
                kept.pop(eid)

        if inv.bugs:
            self._stage(inv, "fixing", "Doctor Stitch is preparing fixes; every fix must pass eight gates")
            base_suite = sandbox.run_suite(self.s, ws, caps)
            base_static = sandbox.static_checks(self.s, ws, caps)
            base_runs: dict[tuple[str, str, str], str] = {
                (r.experiment_id, r.clock.instant, r.clock.time_zone): r.outcome for r in inv.runs
            }
            for bug in inv.bugs[: self.s.max_bugs_to_fix]:
                self._check(inv, t0)
                self._fix(inv, rt, bug, kept, base_suite, base_static, base_runs, t0)
                self.store.save(inv)
            for bug in inv.bugs[self.s.max_bugs_to_fix :]:
                bug.fix.state, bug.fix.label = "skipped", "Fix not attempted: fix budget reached"
        elif not anomalies:
            inv.notes.append("No anomaly observed in tested cases")
            self._event(inv, "raven-archivist", "note", "No anomaly observed in tested cases")
        self._reveal(inv, rt)
        self._finish(inv)

    def _clock(self, c: ClockConfig, unit: str) -> ServerClockReading:
        return ServerClockReading(
            tz=c.time_zone,
            dateUnderTest=c.instant[:10],
            label=f"Test process clock set: TZ={c.time_zone}, {c.instant}; unit-level test of {unit}",
        )

    def _verify(
        self, inv: Investigation, rt: A.AgentRuntime, ex: Experiment, test_rel: str, code: str, idx: int, failure: str
    ) -> Bug | None:
        caps, fm = inv.capabilities, inv.feature_map
        assert caps and fm
        ws = self._ws(inv)
        clock = ex.clocks[idx]
        cand = next(c for c in fm.candidates if c.id == ex.candidate_id)
        outcomes = [sandbox.run_test_file(self.s, ws, caps, test_rel, [clock])[0] for _ in range(self.s.repeat_runs)]
        if not all(o.outcome == "assertion_failed" for o in outcomes):
            self._event(
                inv,
                "raven-archivist",
                "repeat",
                f"Anomaly on {cand.title} did not repeat in every clean run; not reported",
                clock=self._clock(clock, cand.unit.name),
            )
            return None
        source = (ws / cand.unit.path).read_text(encoding="utf-8", errors="ignore")
        try:
            j = self._agent(
                inv,
                rt,
                "raven-archivist",
                "judge_failure",
                A.prompt_judge(
                    test_code=code,
                    failure=failure[:3000],
                    source=source[:60_000],
                    path=cand.unit.path,
                    clock=clock.model_dump(),
                ),
                A.JudgeOut,
            )
        except A.AgentUnavailable:
            self._event(
                inv,
                "raven-archivist",
                "note",
                f"Repeated anomaly on {cand.title} not judged (agent runtime required); left as observed anomaly",
            )
            return None
        if j.verdict != "bug":
            self._event(inv, "raven-archivist", "note", f"Rejected as a test problem: {j.reason}")
            return None
        header = (
            f"// TimeWraith regression test. Run with TZ={clock.time_zone}.\n"
            f"process.env.TW_INSTANT ??= {clock.instant!r};\nprocess.env.TW_TZ ??= {clock.time_zone!r};\n"
        )
        regression = header + code
        (ws / test_rel).write_text(regression, encoding="utf-8")
        self._raise_status(inv, "reproduced")
        bug = Bug(
            id=f"bug_{ex.id[4:]}",
            candidate_id=cand.id,
            experiment_id=ex.id,
            title=j.title or cand.title,
            category=ex.category,
            status="reproduced",
            clock=clock,
            failure=failure[:1500],
            regression_test_path=test_rel,
            regression_test=regression,
        )
        self._event(
            inv,
            "raven-archivist",
            "verify",
            f"Reproduced {self.s.repeat_runs}/{self.s.repeat_runs} from clean containers: {bug.title}",
            clock=self._clock(clock, cand.unit.name),
            evidence={"label": j.reason[:300]},
            check={"versionId": inv.versions[0].id, "result": "fails"},
        )
        inv.versions[0].result = "fails"
        inv.versions[0].role = "affected"
        self._match_issue(inv, rt, bug, cand.unit.name)
        return bug

    def _match_issue(self, inv: Investigation, rt: A.AgentRuntime, bug: Bug, unit: str) -> None:
        tgt = inv.target
        hidden = None
        if inv.request.mode == "blind-hunt" and inv.request.issue_url and not inv.revealed:
            hidden = parse_issue_url(inv.request.issue_url, tgt.owner, tgt.repo)
        words = {
            "expiry_boundary": "expire",
            "midnight_rollover": "midnight",
            "dst_transition": "DST",
            "timezone_conversion": "timezone",
        }.get(bug.category, "date")
        try:
            issues = github.search_issues(tgt.owner, tgt.repo, [unit, words], self.s.github_token, exclude=hidden)
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
                A.prompt_issue_match(bug=f"{bug.title}\n{bug.failure[:800]}", issues=issues),
                A.IssueMatchOut,
            )
        except A.AgentUnavailable:
            bug.issue_match_label = "Possible related issues found; match not judged"
            return
        hit = next((i for i in issues if i["number"] == m.issue_number), None)
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

    def _fix(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        bug: Bug,
        kept: dict[str, tuple[Experiment, str]],
        base_suite: sandbox.TestOutcome,
        base_static: dict[str, int],
        base_runs: dict[tuple[str, str, str], str],
        t0: float,
    ) -> None:
        caps, fm = inv.capabilities, inv.feature_map
        assert caps and fm
        ws = self._ws(inv)
        cand = next(c for c in fm.candidates if c.id == bug.candidate_id)
        bug.fix = Fix(state="in-progress")
        feedback: str | None = None
        for attempt in range(1, self.s.max_fix_attempts + 1):
            self._check(inv, t0)
            files = {cand.unit.path: (ws / cand.unit.path).read_text(encoding="utf-8", errors="ignore")}
            try:
                out = self._agent(
                    inv,
                    rt,
                    "doctor-stitch",
                    "write_fix",
                    A.prompt_fix(
                        bug=f"{bug.title}\nClock: {bug.clock.model_dump()}\nFailure:\n{bug.failure}",
                        files=files,
                        test_path=bug.regression_test_path,
                        test_code=bug.regression_test,
                        feedback=feedback,
                    ),
                    A.FixOut,
                )
            except A.AgentUnavailable as e:
                bug.fix.state, bug.fix.label = "no-safe-fix", f"No fix attempted: {e}"
                return
            gates, diff, applied = self._gates(inv, rt, bug, out, kept, base_suite, base_static, base_runs)
            fa = FixAttempt(
                attempt=attempt,
                summary=out.summary,
                diff=diff,
                gates=gates,
                accepted_by_gates=all(g.passed for g in gates) and len(gates) == 8,
            )
            bug.fix.attempts.append(fa)
            for g in gates:
                self._event(
                    inv,
                    "watchtower-warden",
                    "gate",
                    f"Gate {g.gate}: {'passed' if g.passed else 'failed'}",
                    data={"bug_id": bug.id, "attempt": attempt, **g.model_dump()},
                )
            if fa.accepted_by_gates:
                self._save_patch(inv, bug, diff)
                self._revert(ws, applied)  # the workspace stays on the original revision for the next bug
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
                    f"Suggested fix · verified: {out.summary}",
                    version=vid,
                    check={"versionId": vid, "result": "passes"},
                    data={"bug_id": bug.id},
                )
                return
            self._revert(ws, applied)
            feedback = "\n".join(f"{g.gate}: {g.detail}" for g in gates if not g.passed)
            self._event(
                inv, "doctor-stitch", "fix", f"Attempt {attempt} rejected by the gates", data={"bug_id": bug.id}
            )
        bug.fix.state, bug.fix.label = "no-safe-fix", "No safe fix found"

    def _gates(
        self,
        inv: Investigation,
        rt: A.AgentRuntime,
        bug: Bug,
        out: A.FixOut,
        kept: dict[str, tuple[Experiment, str]],
        base_suite: sandbox.TestOutcome,
        base_static: dict[str, int],
        base_runs: dict[tuple[str, str, str], str],
    ) -> tuple[list[GateResult], str, Originals]:
        caps = inv.capabilities
        assert caps
        ws = self._ws(inv)
        gates = [
            GateResult(
                gate="test_first",
                passed=True,
                detail=f"Failed {self.s.repeat_runs}/{self.s.repeat_runs} on the original revision",
            )
        ]
        # Gate 5 first: reject bad patches before anything runs.
        problems: list[str] = []
        paths: list[str] = []
        for e in out.edits:
            p = e.path.replace("\\", "/").lstrip("/")
            target = (ws / p).resolve()
            if ".." in p.split("/") or ws.resolve() not in target.parents:
                problems.append(f"path outside the repository: {e.path}")
            elif PROTECTED.search(p) or is_test_file(p) or p.startswith(".git/"):
                problems.append(f"protected file: {p}")
            paths.append(p)
        if len(set(paths)) > self.s.max_patch_files:
            problems.append(f"{len(set(paths))} files changed (limit {self.s.max_patch_files})")
        diff_text, changed = "", 0
        if not problems:
            for e, p in zip(out.edits, paths, strict=True):
                old = (ws / p).read_text(encoding="utf-8", errors="ignore") if (ws / p).exists() else ""
                d = list(difflib.unified_diff(old.splitlines(True), e.content.splitlines(True), f"a/{p}", f"b/{p}"))
                changed += sum(1 for ln in d if ln[:1] in "+-" and not ln.startswith(("+++", "---")))
                diff_text += "".join(d)
            if changed > self.s.max_patch_lines:
                problems.append(f"{changed} changed lines (limit {self.s.max_patch_lines})")
            if changed == 0:
                problems.append("patch changes nothing")
        gates.append(
            GateResult(
                gate="diff_limits",
                passed=not problems,
                detail="; ".join(problems) or f"{len(set(paths))} file(s), {changed} line(s)",
            )
        )
        if problems:
            return gates, diff_text, {}

        originals: Originals = {
            p: ((ws / p).read_text(encoding="utf-8", errors="ignore") if (ws / p).exists() else None) for p in paths
        }
        for e, p in zip(out.edits, paths, strict=True):
            (ws / p).parent.mkdir(parents=True, exist_ok=True)
            (ws / p).write_text(e.content, encoding="utf-8")

        # Gate 2: passes 3 times, in the failing zone and one more zone.
        other = "America/New_York" if bug.clock.time_zone != "America/New_York" else "Asia/Kolkata"
        clocks = [bug.clock] * self.s.repeat_runs + [bug.clock.model_copy(update={"time_zone": other})]
        res = [sandbox.run_test_file(self.s, ws, caps, bug.regression_test_path, [c])[0] for c in clocks]
        ok = all(r.outcome == "passed" for r in res)
        gates.append(
            GateResult(
                gate="fixed",
                passed=ok,
                detail="Passed " + ", ".join(f"{c.time_zone}:{r.outcome}" for c, r in zip(clocks, res, strict=True)),
            )
        )
        if not ok:
            return gates, diff_text, originals

        # Gate 8: revert only the source change, keep the test: it must fail again.
        self._revert(ws, originals)
        m = sandbox.run_test_file(self.s, ws, caps, bug.regression_test_path, [bug.clock])[0]
        for e, p in zip(out.edits, paths, strict=True):
            (ws / p).write_text(e.content, encoding="utf-8")
        gates.append(
            GateResult(
                gate="mutation_check",
                passed=m.outcome == "assertion_failed",
                detail=f"Without the fix the test is {m.outcome}",
            )
        )
        if m.outcome != "assertion_failed":
            return gates, diff_text, originals

        # Gate 3: full suite, no new failures.
        after = sandbox.run_suite(self.s, ws, caps)
        new = sorted(after.failed_names - base_suite.failed_names)
        suite_ran = after.total > 0 or base_suite.total == 0
        ok = suite_ran and not new
        if new:
            detail = f"New failures: {', '.join(new[:5])}"
        elif not suite_ran:
            detail = "Suite could not run after the patch"
        else:
            detail = f"{after.total} tests, no new failures"
        gates.append(GateResult(gate="no_regressions", passed=ok, detail=detail))
        if not ok:
            return gates, diff_text, originals

        # Gate 4: every kept experiment, every clock: never worse than before.
        worse: list[str] = []
        for eid, (ex, test_rel) in kept.items():
            results = sandbox.run_test_file(self.s, ws, caps, test_rel, ex.clocks)
            for c, r in zip(ex.clocks, results, strict=True):
                before = base_runs.get((eid, c.instant, c.time_zone))
                if before == "passed" and r.outcome != "passed":
                    worse.append(f"{eid} at {c.label} ({c.time_zone})")
        detail = ("Worse: " + ", ".join(worse[:5])) if worse else f"{len(kept)} experiments rerun, none worse"
        gates.append(GateResult(gate="no_new_anomalies", passed=not worse, detail=detail))
        if worse:
            return gates, diff_text, originals

        # Gate 6: the repo's own typecheck and lint, compared with before.
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
            return gates, diff_text, originals

        # Gate 7: independent review by Raven Archivist (does not see Doctor Stitch's summary).
        try:
            rv = self._agent(
                inv,
                rt,
                "raven-archivist",
                "review_fix",
                A.prompt_review_fix(
                    bug=f"{bug.title}\n{bug.failure[:800]}", diff=diff_text, test_code=bug.regression_test
                ),
                A.ReviewFixOut,
            )
            gates.append(GateResult(gate="independent_review", passed=rv.approve, detail=rv.reason))
        except A.AgentUnavailable as e:
            gates.append(GateResult(gate="independent_review", passed=False, detail=f"Review not run: {e}"))
        return gates, diff_text, originals

    @staticmethod
    def _revert(ws: Path, originals: Originals) -> None:
        for p, old in originals.items():
            if old is None:
                (ws / p).unlink(missing_ok=True)
            else:
                (ws / p).write_text(old, encoding="utf-8")

    def _save_patch(self, inv: Investigation, bug: Bug, diff: str) -> None:
        d = self.s.artifacts / inv.id
        d.mkdir(parents=True, exist_ok=True)
        test = "".join(
            difflib.unified_diff([], bug.regression_test.splitlines(True), "/dev/null", f"b/{bug.regression_test_path}")
        )
        (d / f"{bug.id}.patch").write_text(diff + test, encoding="utf-8")

    def _reveal(self, inv: Investigation, rt: A.AgentRuntime) -> None:
        if inv.request.mode != "blind-hunt":
            return
        issue = (self.s.artifacts / inv.id / "issue.txt").read_text(encoding="utf-8")
        inv.revealed = True
        findings = "\n".join(f"- {b.title} ({b.category}, {b.clock.time_zone})" for b in inv.bugs) or "(no findings)"
        try:
            r = self._agent(
                inv, rt, "raven-archivist", "reveal", A.prompt_reveal(findings=findings, issue=issue), A.RevealOut
            )
            outcome: str = r.outcome
            text = f"Reveal: {r.outcome}. {r.reason}"
        except A.AgentUnavailable:
            outcome, text = "not-judged", "Reveal: the sealed issue is shown; comparison needs the agent runtime"
        self._event(
            inv, "two-faced-jack", "reveal", text, data={"issue_url": inv.request.issue_url, "outcome": outcome}
        )

    def _finish(self, inv: Investigation) -> None:
        inv.stage = "completed"
        inv.replay_label = "Recorded investigation replay"
        self._event(inv, "wraith-director", "stage", "Case filed", data={"stage": "completed"})
