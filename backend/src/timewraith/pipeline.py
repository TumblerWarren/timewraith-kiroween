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
import json
import re
import shutil
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from . import agents as A
from . import github, intent, sandbox
from . import sweep as S
from .analyze import analyze, is_test_file
from .config import Settings
from .discovery import build_feature_map
from .fixsession import SessionRegistry
from .ingest import IngestError, clone, git, make_target, parse_issue_url, resolve_ref
from .models import (
    LADDER,
    STAGE_PHASE,
    Actor,
    Bug,
    BugCategory,
    Candidate,
    ClockConfig,
    CreateInvestigation,
    DecisionRecord,
    EventKind,
    Evidence,
    EvidenceStatus,
    Experiment,
    Fix,
    FixAttempt,
    GateResult,
    IntendedFinding,
    Investigation,
    Phase,
    ReplayEvent,
    ServerClockReading,
    SweepResult,
    Version,
    Violation,
)
from .planning import build_test_plan
from .store import Store

VKey = tuple[str, str, str, str]  # experiment, invariant, zone, instant

PROTECTED = re.compile(
    r"(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[^/]*\.json|\.github/.*|"
    r"(vitest|jest|vite|babel|eslint|prettier)\.config\.[^/]+|\.eslintrc[^/]*|__tw__/.*|\.tw/.*)$"
)
RUNNING = {"cloning", "analyzing", "discovering", "designing", "installing", "experimenting", "verifying", "fixing"}
_SRC_REF = re.compile(r"^(?P<p>[^:]+):(?P<a>\d+)(?:-(?P<b>\d+))?$")
INVARIANT_CATEGORY: dict[str, BugCategory] = {
    "local_date_matches": "midnight_rollover",
    "instant_zone_independent": "timezone_conversion",
    "flag_monotonic": "expiry_boundary",
    "next_after_now": "dst_transition",
}


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
        self.sessions = SessionRegistry()  # live fix sessions, served by POST /internal/fix-tools/*

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
            phase="fix",
            data={"approval": "fix", "bug_id": bug_id, "accepted": accept},
        )
        self.store.save(inv)
        return inv

    def cancel(self, inv_id: str) -> None:
        self._cancel.add(inv_id)
        inv = self._get(inv_id)
        if inv.stage in {"awaiting-plan-approval", "queued"}:
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
        try:
            return rt.call(agent, step, prompt, schema)
        except A.AgentQuotaReached:
            self._quota_note(inv)
            raise

    def _quota_note(self, inv: Investigation) -> None:
        """Say once, plainly, that the agents stopped because the Kiro account is out of usage."""
        if A.QUOTA_MESSAGE not in inv.notes:
            inv.notes.append(A.QUOTA_MESSAGE)
            self._event(inv, "watchtower-warden", "note", A.QUOTA_MESSAGE)

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
            claim=claim[:400],
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

        # 2 Discovery
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
        try:
            out = self._agent(inv, rt, "bat-scout", "review_candidates", A.prompt_review(payload), A.ReviewOut)
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

    def _design(self, inv: Investigation, rt: A.AgentRuntime, ex: Experiment, feedback: str | None) -> None:
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
                    catalog=S.catalog_text(),
                    claim=c.rationale,
                    issue=issue,
                    feedback=feedback,
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
        invs = []
        for iu in out.invariants:
            need = S.INVARIANTS[iu.id][0]
            if iu.id in S.ALWAYS:
                continue
            if need and need not in out.fields:
                checks.append(f"dropped {iu.id}: adapter does not return `{need}`")
                continue
            invs.append(iu)
        anchors = []
        for a in out.anchors:
            ms = S.parse_instant(a)
            if ms is None:
                checks.append(f"dropped anchor {a[:40]!r}: not an ISO instant with offset in 2000-2100")
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
        (ws / folder).mkdir(parents=True, exist_ok=True)
        (ws / adapter_rel).write_text(out.adapter_code, encoding="utf-8")
        (ws / harness_rel).write_text(S.harness_code(ex.id, caps.test_runner), encoding="utf-8")
        points = S.build_points(anchors)
        tw = ws / ".tw"
        tw.mkdir(exist_ok=True)
        (tw / f"points-{ex.id}.json").write_text(json.dumps(points), encoding="utf-8")
        (tw / f"baseline-{ex.id}.json").write_text(json.dumps(S.baseline_points()), encoding="utf-8")
        ex.status, ex.claim, ex.fields, ex.invariants = "designed", out.claim, out.fields, invs
        ex.anchors = [S.iso(a) for a in anchors]
        ex.zones, ex.point_count = list(points), sum(len(v) for v in points.values())
        ex.adapter_path, ex.harness_path, ex.adapter_code = adapter_rel, harness_rel, out.adapter_code
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
        logs = sandbox.sweep(self.s, ws, caps, [e.harness_path or "" for e in exps], zones, set_name)
        result: dict[str, tuple[S.Outputs, list[str]]] = {}
        for e in exps:
            outputs: S.Outputs = {}
            errors: list[str] = []
            for z in zones:
                f = ws / ".tw" / "out" / f"{e.id}__{z.replace('/', '_')}.json"
                try:
                    outputs[z] = json.loads(f.read_text(encoding="utf-8"))
                except OSError, ValueError:
                    errors.append(f"{z}: no harness output. {logs.get(z, '')[-300:]}".strip())
            result[e.id] = (outputs, errors)
        return result

    def _phase_two(self, inv: Investigation, t0: float | None = None) -> None:
        t0 = t0 or time.monotonic()
        rt = self._runtime(inv)
        caps, plan = inv.capabilities, inv.test_plan
        assert caps and plan
        designed = [e for e in plan.experiments if e.status == "designed"]
        if not designed:
            inv.notes.append("No experiments were designed, so nothing ran (Kiro agent runtime required)")
            self._finish(inv)
            return
        ok, why = sandbox.docker_available()
        if not ok:
            raise Stop("sandbox_unavailable", f"Execution not run: {why}")
        if not caps.package_manager:
            inv.notes.append("Execution not run: no lockfile, so the install is not reproducible")
            self._finish(inv)
            return
        ws = self._ws(inv)

        # 4 Controlled execution
        self._stage(inv, "installing", "Installing dependencies in an isolated container")
        if sandbox.install(self.s, ws, caps).code != 0:
            raise Stop("install_failed", "Dependency install failed in the sandbox")
        self._check(inv, t0)
        self._stage(inv, "experimenting", "Checking adapters, then sweeping clock points in 13 time zones")
        self._validate(inv, rt, designed, t0)
        valid = [e for e in designed if e.status == "designed"]
        if not valid:
            inv.notes.append("No adapter ran cleanly at baseline; no sweep was run")
            self._finish(inv)
            return
        full = self._sweep(inv, valid, S.SWEEP_ZONES)
        baseline_keys: set[VKey] = set()
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

        # 5 Independent bug verification
        self._stage(inv, "verifying", "Repeating violations from clean containers")
        for res in inv.sweeps:
            if res.violations:
                self._check(inv, t0)
                ex = next(e for e in valid if e.id == res.experiment_id)
                bug = self._verify(inv, rt, ex, res.violations[0])
                if bug:
                    inv.bugs.append(bug)
                    self.store.save(inv)

        # Follow-on: Fix
        if inv.bugs:
            self._stage(inv, "fixing", "Doctor Stitch is preparing fixes; every fix must pass eight gates")
            base_suite = sandbox.run_suite(self.s, ws, caps)
            base_static = sandbox.static_checks(self.s, ws, caps)
            try:
                for bug in inv.bugs[: self.s.max_bugs_to_fix]:
                    self._check(inv, t0)
                    self._fix(inv, rt, bug, valid, base_suite, base_static, baseline_keys, t0)
                    self.store.save(inv)
            except Stop as e:
                # Running out of time while fixing keeps the case: the bugs and their regression tests stand.
                if e.code != "budget_time":
                    raise
                self._clean_tree(ws)
                for b in inv.bugs:
                    if b.fix.state in {"not-started", "in-progress"}:
                        b.fix.state = "no-safe-fix" if b.fix.attempts else "skipped"
                        b.fix.label = "Fix not finished: time budget reached"
                inv.notes.append("The time budget ran out during the fix step; the reproduced bugs are kept")
                self._event(inv, "watchtower-warden", "note", "Time budget reached during the fix step", phase="fix")
            for bug in inv.bugs[self.s.max_bugs_to_fix :]:
                bug.fix.state, bug.fix.label = "skipped", "Fix not attempted: fix budget reached"
        elif inv.intended:
            n = len(inv.intended)
            text = f"No bugs reproduced. {n} finding(s) are behaviour the repository documents as intended"
            inv.notes.append(text)
            self._event(inv, "raven-archivist", "note", text, phase="verification")
        elif not any(r.violations for r in inv.sweeps):
            inv.notes.append("No anomaly observed in tested cases")
            self._event(inv, "raven-archivist", "note", "No anomaly observed in tested cases", phase="verification")
        self._reveal(inv, rt)
        self._finish(inv)

    def _validate(self, inv: Investigation, rt: A.AgentRuntime, exps: list[Experiment], t0: float) -> None:
        """An adapter must run cleanly at ordinary instants; otherwise violations could be adapter mistakes."""
        checked: set[str] = set()
        for attempt in (1, 2):
            pending = [e for e in exps if e.status == "designed" and e.id not in checked]
            if not pending:
                return
            self._check(inv, t0)
            results = self._sweep(inv, pending, S.BASELINE_ZONES, "baseline")
            for e in pending:
                outputs, errors = results[e.id]
                problems = S.baseline_problems(outputs, e.fields) + errors[:2]
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
                        checks=["baseline clean"],
                        decision="accepted",
                        rule="Adapter ran cleanly at ordinary baseline instants",
                        phase="execution",
                    )
                elif attempt == 1:
                    self._design(inv, rt, e, feedback="\n".join(problems))
                else:
                    e.status, e.executability_reason = "adapter_invalid", "; ".join(problems)[:300]
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

    def _verify(self, inv: Investigation, rt: A.AgentRuntime, ex: Experiment, v: Violation) -> Bug | None:
        caps, fm = inv.capabilities, inv.feature_map
        assert caps and fm and caps.test_runner and ex.adapter_path
        ws = self._ws(inv)
        cand = next(c for c in fm.candidates if c.id == ex.candidate_id)
        zones = [v.zone] + (["UTC"] if v.invariant == "instant_zone_independent" and v.zone != "UTC" else [])
        key = (v.invariant, v.zone, v.instant)
        hits = 0
        last_outputs: S.Outputs = {}
        for _ in range(self.s.repeat_runs):
            last_outputs, _err = self._sweep(inv, [ex], zones)[ex.id]
            if any((x.invariant, x.zone, x.instant) == key for x in S.check(last_outputs, ex.invariants)):
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
        snippets = intent.find(ws, tracked, cand.unit.name, cand.unit.path, v.zone, near)
        self._event(
            inv,
            "raven-archivist",
            "explore",
            f"Read {len(snippets)} passage(s) of the repository's own tests and docs about time behaviour",
            data={"passages": [f"{s.path}:{s.start}-{s.end}" for s in snippets]},
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
                    intent="\n\n".join(s.render() for s in snippets),
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
        bid = f"bug_{ex.id[4:]}"
        reg_rel = (Path(ex.adapter_path).parent / f"{bid}.regression.test{Path(ex.adapter_path).suffix}").as_posix()
        target = f"{inv.target.owner}/{inv.target.repo}@{(inv.target.revision or '')[:12]}"
        code = S.regression_code(exp_id=ex.id, runner=caps.test_runner, v=v, title=title, target=target)
        (ws / reg_rel).write_text(code, encoding="utf-8")
        cc = ClockConfig(instant=v.instant, time_zone=v.zone, label=f"{v.invariant} at {v.local}")
        first = sandbox.run_test_file(self.s, ws, caps, reg_rel, [cc])[0]
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
            evidence={"label": j.claim[:300], "observed": v.detail},
            check={"versionId": inv.versions[0].id, "result": "fails"},
        )
        inv.versions[0].result, inv.versions[0].role = "fails", "affected"
        self._match_issue(inv, rt, bug, cand.unit.name)
        return bug

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
        try:
            issues = github.search_issues(tgt.owner, tgt.repo, [unit, word], self.s.github_token, exclude=hidden)
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
        self._decide(
            inv,
            agent="raven-archivist",
            step="match_issue",
            subject=bug.id,
            claim=m.reason,
            evidence=[],
            dropped=0,
            checks=[f"{len(issues)} issues searched"],
            decision="accepted" if hit or m.issue_number is None else "rejected",
            rule="An issue match must be one of the search results"
            if m.issue_number and not hit
            else ("Known issue" if hit else "Treated as a new finding"),
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
            evidence={"label": j.claim[:300], "observed": v.detail},
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
        for attempt in range(1, self.s.max_fix_attempts + 1):
            self._check(inv, t0)
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
                    ),
                    session,
                    self.s.fix_session_s + 120,
                )
            except A.AgentUnavailable as e:
                if isinstance(e, A.AgentQuotaReached):
                    self._quota_note(inv)
                bug.fix.state, bug.fix.label = "no-safe-fix", f"No fix attempted: {e}"
                return
            finally:
                self.sessions.close(session)
            sub = session.submission
            diff = git(ws, ["diff"]) if sub else ""
            self._clean_tree(ws)
            if not sub or not diff.strip():
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
            gates = self._gates(inv, rt, bug, diff, exps, base_suite, base_static, baseline_keys)
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
        if not outputs:
            return "ERROR: the experiment did not run. " + (errors[0][:400] if errors else "")
        broken = [v for v in S.check(outputs, ex.invariants) if v.invariant == bug.invariant]
        if not broken:
            return f"PASSED: rule {bug.invariant} holds in all {len(outputs)} zones"
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
        ws = self._ws(inv)
        n = self.s.repeat_runs
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
        res = [sandbox.run_test_file(self.s, ws, caps, bug.regression_test_path, [bug.clock])[0] for _ in range(n)]
        reg_ok = all(r.outcome == "passed" for r in res)
        full = self._sweep(inv, exps, S.SWEEP_ZONES) if reg_ok else {}
        after: dict[str, list[Violation]] = {e.id: S.check(full[e.id][0], e.invariants) for e in exps if e.id in full}
        still = [v for v in after.get(bug.experiment_id, []) if v.invariant == bug.invariant]
        ok = reg_ok and not still
        detail = (
            f"Regression test: {', '.join(r.outcome for r in res)}"
            if not reg_ok
            else f"Invariant still violated in {', '.join(v.zone for v in still[:4])}"
            if still
            else f"Regression test passed {n}/{n}; invariant holds in all {len(S.SWEEP_ZONES)} zones"
        )
        gates.append(GateResult(gate="fixed", passed=ok, detail=detail))
        if not ok:
            return gates

        # mutation_check: undo only the source change; the test must fail again
        self._clean_tree(ws)
        m = sandbox.run_test_file(self.s, ws, caps, bug.regression_test_path, [bug.clock])[0]
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
        new_files = [(ex.adapter_path or "", ex.adapter_code or ""), (bug.regression_test_path, bug.regression_test)]
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


def _keys(exp_id: str, vs: list[Violation]) -> set[VKey]:
    return {(exp_id, v.invariant, v.zone, v.instant) for v in vs}


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
