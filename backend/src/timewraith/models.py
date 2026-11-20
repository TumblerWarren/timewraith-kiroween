"""Data contracts. These Pydantic models are the source of truth; `schema_export.py` writes them to backend/schemas/."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

CaseMode = Literal["known-issue", "blind-hunt", "open-hunt"]
Stage = Literal[
    "queued",
    "cloning",
    "analyzing",
    "discovering",
    "designing",
    "awaiting-plan-approval",
    "installing",
    "experimenting",
    "verifying",
    "fixing",
    "completed",
    "failed",
    "cancelled",
]
# The five-step flow shown at the top of the Case Board, plus the fix step that follows verification.
Phase = Literal["repository", "discovery", "design", "execution", "verification", "fix"]
STAGE_PHASE: dict[str, Phase] = {
    "queued": "repository",
    "cloning": "repository",
    "analyzing": "repository",
    "discovering": "discovery",
    "designing": "design",
    "awaiting-plan-approval": "design",
    "installing": "execution",
    "experimenting": "execution",
    "verifying": "verification",
    "fixing": "fix",
    "completed": "verification",
    "failed": "repository",
    "cancelled": "repository",
}
BugCategory = Literal["timezone_conversion", "midnight_rollover", "dst_transition", "expiry_boundary", "other_temporal"]
EvidenceStatus = Literal[
    "planned", "observed-anomaly", "reproduced", "known-issue-match", "fixed-version-verified", "inconclusive"
]
LADDER: list[EvidenceStatus] = [
    "planned",
    "observed-anomaly",
    "reproduced",
    "known-issue-match",
    "fixed-version-verified",
]
Actor = Literal[
    "wraith-director",
    "watchtower-warden",
    "bat-scout",
    "pumpkin-mechanic",
    "spider-weaver",
    "raven-archivist",
    "two-faced-jack",
    "doctor-stitch",
]
# The frontend's ReplayEventKind plus the backend additions (docs/integration-contract.md).
EventKind = Literal[
    "plan",
    "dispatch",
    "explore",
    "clock",
    "step",
    "observe",
    "repeat",
    "verify",
    "note",
    "reveal",
    "fix",
    "compare",
    "stage",
    "capability",
    "approval",
    "gate",
    "decision",
    "tool",
]
InvariantId = Literal[
    "well_formed",
    "deterministic",
    "local_date_matches",
    "instant_zone_independent",
    "flag_monotonic",
    "next_after_now",
    "next_clock_independent",
    "retry_cancelled",
    "timeout_delivery",
    "interval_delivery",
    "expiry_deadline",
    "elapsed_clock_jump",
    "python_assertion",
    "calendar_contract",
]
OutputField = Literal[
    "instant",
    "next",
    "next_early",
    "flag",
    "date",
    "value",
    "after_cancel",
    "timeout_trace",
    "interval_trace",
    "expiry_trace",
    "clock_jumps",
    "calendar_cases",
]


class FlowStep(BaseModel):
    id: Phase
    title: str
    owner: Actor
    owner_name: str
    kind: Literal["kiro-agent", "code"]
    does: str
    decides: str
    follow_on: bool = False


FLOW: list[FlowStep] = [
    FlowStep(
        id="repository",
        title="Repository",
        owner="wraith-director",
        owner_name="Wraith Director",
        kind="code",
        does="Clones the pinned commit with hardened Git and reads its manifests, lockfile and test setup.",
        decides="Code: what the repository can support (capability report).",
    ),
    FlowStep(
        id="discovery",
        title="Time-sensitive code discovery",
        owner="bat-scout",
        owner_name="Bat Scout",
        kind="kiro-agent",
        does="A deterministic scan finds time signals; Bat Scout reviews the top candidates.",
        decides="Bat Scout proposes keep or drop with cited signals; code accepts only claims whose signals exist.",
    ),
    FlowStep(
        id="design",
        title="Autonomous experiment design",
        owner="pumpkin-mechanic",
        owner_name="Pumpkin Mechanic",
        kind="kiro-agent",
        does="Pumpkin Mechanic writes an adapter that calls the code and picks invariants from a fixed catalog.",
        decides="Code checks the adapter at baseline; the harness, not the agent, chooses the clock points.",
    ),
    FlowStep(
        id="execution",
        title="Controlled execution",
        owner="spider-weaver",
        owner_name="Spider Weaver",
        kind="code",
        does="Sweeps every DST transition, month end, leap day and expiry edge in 13 zones in no-network Docker.",
        decides="Code: invariant oracles mark violations. No LLM decides pass or fail.",
    ),
    FlowStep(
        id="verification",
        title="Independent bug verification",
        owner="raven-archivist",
        owner_name="Raven Archivist",
        kind="kiro-agent",
        does="Repeats each violation 3 times from clean containers, then Raven judges defect or allowed exception.",
        decides="A bug needs 3/3 repeats, a failing generated regression test and a defect verdict with evidence. "
        "Behaviour the repository's own passing test or docs describe is reported as intended, not as a bug.",
    ),
    FlowStep(
        id="fix",
        title="Fix",
        owner="doctor-stitch",
        owner_name="Doctor Stitch",
        kind="kiro-agent",
        does="Doctor Stitch reads, searches, edits and runs the failing test through TimeWraith's tools, then submits.",
        decides="Eight code gates on a clean copy and Raven's blind review; then the user accepts. Up to 3 attempts.",
        follow_on=True,
    ),
]


class CreateInvestigation(BaseModel):
    repository_url: str = Field(max_length=300)
    ref: str = Field(max_length=200)
    mode: CaseMode = "open-hunt"
    issue_url: str | None = Field(default=None, max_length=300)
    area: str | None = Field(default=None, max_length=200)
    auto: bool = False  # True skips the plan approval stop


class Target(BaseModel):
    repository_url: str
    owner: str
    repo: str
    ref: str
    revision: str | None = None


class CapabilityItem(BaseModel):
    id: str
    status: Literal["supported", "unsupported", "unknown"]
    reason: str
    files: list[str] = []


class CapabilityReport(BaseModel):
    kind: Literal["Capability report"] = "Capability report"
    items: list[CapabilityItem] = []
    package_manager: Literal["npm", "pnpm", "yarn"] | None = None
    test_runner: Literal["vitest", "jest", "pytest"] | None = None
    node_version: str = "22"
    scripts: dict[str, str] = {}


class Signal(BaseModel):
    id: str
    kind: str
    path: str
    line: int
    confidence: Literal["high", "medium", "low"]
    excerpt: str
    in_test: bool = False


class CodeUnit(BaseModel):
    path: str
    name: str
    start_line: int
    end_line: int
    exported: bool


def keep_first(n: int) -> AfterValidator:
    """A list an agent wrote is cut to its first `n` items instead of being rejected. Text has no length limit:
    an agent that says too much is never turned away for it."""
    return AfterValidator(lambda items: items[:n])


class Evidence(BaseModel):
    """One piece of evidence an agent cites. Code resolves every ref before the claim counts."""

    kind: Literal["signal", "source", "invariant", "point", "issue", "test", "doc"]
    ref: str = Field(
        description="signal id | path:line[-line] (source, test, doc) | invariant id | zone@ISO | issue no.",
    )
    why: str


class DecisionRecord(BaseModel):
    """Why the Crew did something: the agent's claim, its checked evidence, and the code rule that decided."""

    id: str
    at: str
    phase: Phase
    agent: Actor
    step: str
    runtime: str
    subject: str  # candidate, experiment or bug id
    claim: str
    evidence: list[Evidence] = []
    dropped_evidence: int = 0
    checks: list[str] = []
    decision: Literal["accepted", "rejected", "not_run"]
    rule: str


class Candidate(BaseModel):
    id: str
    title: str
    unit: CodeUnit
    signal_ids: list[str]
    bug_categories: list[BugCategory]
    score: float
    score_parts: dict[str, float]
    existing_tests: list[str] = []
    status: Literal["candidate"] = "candidate"
    rationale: str | None = None
    selected: bool = False


class FeatureMap(BaseModel):
    kind: Literal["Discovery candidates, not verified bugs"] = "Discovery candidates, not verified bugs"
    note: Literal["These are candidates, not proven bugs."] = "These are candidates, not proven bugs."
    candidates: list[Candidate] = []
    signals: list[Signal] = []
    skipped: dict[str, int] = {}


class ClockConfig(BaseModel):
    instant: str  # ISO 8601 UTC, e.g. 2026-03-08T07:30:00.000Z
    time_zone: str  # IANA
    label: str
    scope: Literal["test_process"] = "test_process"


class InvariantUse(BaseModel):
    expired_at_deadline: bool | None = Field(default=None, description="Explicit cited expiry policy at equality")
    expectation_ref: str | None = Field(default=None, description="Repository test or doc passage supporting this rule")
    id: InvariantId
    reason: str
    max_gap_ms: int | None = Field(default=None, ge=1)


class Experiment(BaseModel):
    id: str
    candidate_id: str
    categories: list[BugCategory]
    adapter: Literal["js_sweep", "python_pytest", "python_crew"] = "js_sweep"
    status: Literal["planned", "designed", "not_designed", "adapter_invalid", "not_run", "swept"] = "planned"
    executability: Literal["ready", "needs_setup", "not_controllable"]
    executability_reason: str | None = None
    claim: str | None = None
    fields: list[OutputField] = []
    invariants: list[InvariantUse] = []
    anchors: list[str] = []
    zones: list[str] = []
    point_count: int = 0
    adapter_path: str | None = None
    harness_path: str | None = None
    adapter_code: str | None = None
    runner_config: str | None = None
    # True when no output field of the adapter feeds a time rule, so only "well formed" and "repeatable" are checked.
    # Such an experiment cannot find a time bug; the run summary says so.
    weak: bool = False
    # Why an experiment that could not run did not: the experiment itself (adapter), the place it runs (environment), or
    # the agent service refusing requests (throttled). Set with status adapter_invalid / not_run.
    failure_kind: Literal["adapter", "environment", "throttled", "timeout"] | None = None


class TestPlan(BaseModel):
    kind: Literal["Planned experiments, not run"] = "Planned experiments, not run"
    experiments: list[Experiment] = []
    capped: bool = False


Evidences = Annotated[list[Evidence], keep_first(6)]


class Violation(BaseModel):
    failure_kind: str = ""
    invariant: InvariantId
    zone: str
    instant: str  # ISO UTC
    local: str  # wall time in `zone`
    detail: str
    count: int = 1
    context_ms: list[int] = []  # instants a regression test needs
    expected: str | None = None


class PytestResult(BaseModel):
    assertion_failure: bool = False
    exercised_source: bool = False
    runtime: str | None = None
    instant: str
    zone: str
    outcome: Literal["passed", "failed", "skipped", "blocked"]
    passed: int = Field(default=0, ge=0)
    failed: int = Field(default=0, ge=0)
    skipped: int = Field(default=0, ge=0)
    detail: str = ""


class SweepResult(BaseModel):
    pytest_results: list[PytestResult] = []
    pending_review: int | None = None  # Older cases did not track review groups.
    experiment_id: str
    points_run: int
    zones: list[str]
    violations: list[Violation] = []
    errors: list[str] = []


class GateResult(BaseModel):
    gate: Literal[
        "test_first",
        "fixed",
        "no_regressions",
        "no_new_anomalies",
        "diff_limits",
        "static_checks",
        "independent_review",
        "mutation_check",
    ]
    passed: bool
    detail: str


class FixAttempt(BaseModel):
    attempt: int
    summary: str
    root_cause: str = ""
    diff: str
    gates: list[GateResult] = []
    accepted_by_gates: bool = False
    tool_calls: int = 0
    test_runs: int = 0


class CheckResult(BaseModel):
    """One of the repository's own checks (its tests, lint, format) run on the contribution in the sandbox."""

    name: str
    command: str
    passed: bool
    preexisting: bool = False  # it fails on the upstream commit too, so the fix did not cause it
    detail: str = ""


class RuleSummary(BaseModel):
    """What the repository asks of contributors, read from its own files on its default branch."""

    default_branch: str = ""
    archived: bool = False
    contributing_url: str | None = None
    template_path: str | None = None
    conventional_commits: bool = False
    dco: bool = False
    cla: bool = False
    ai_policy: list[str] = []  # lines of CONTRIBUTING that mention AI or generated code
    test_dir: str | None = None
    test_pattern: str = ".test.ts"
    scripts: list[str] = []  # the package scripts used as checks


class Contribution(BaseModel):
    """The fix shaped to the repository's rules: rebased, placed, formatted, checked, with its PR text."""

    prepared_at: str
    rules: RuleSummary
    base: str  # the upstream commit the contribution sits on
    rebased: bool  # the upstream moved on since the pinned commit and the fix was carried over
    notes: list[str] = []
    checks: list[CheckResult] = []
    title: str
    body: str
    test_path: str


class FixBranch(BaseModel):
    """A local git branch holding the accepted fix: one commit on the pinned revision, made by code, never pushed."""

    name: str
    path: str  # folder of the clone on this machine
    base: str  # the pinned commit the branch starts from
    commit: str
    files: list[str] = []
    created_at: str
    patch_file: str  # git format-patch file, applied with `git am`
    upstream_url: str  # `origin` of the clone, so the branch can be pushed to your own fork
    contribution: Contribution | None = None  # set by "check against the repository's rules" (contribute.py)


class Publish(BaseModel):
    """What was sent to GitHub for an accepted fix, each step only after the user confirmed it."""

    fork: str  # "you/repo": your fork of the original repository
    branch: str
    commit: str
    pushed_at: str
    pr_url: str | None = None
    pr_number: int | None = None
    pr_opened_at: str | None = None
    source_commit: str | None = None  # the local branch commit this was built from; a newer one means an update is due
    updated_at: str | None = None
    updates: int = 0  # how many follow-up commits were added on top of the first push
    update_note: str | None = None  # set when the branch was updated but the pull request text could not be changed


class Fix(BaseModel):
    state: Literal["not-started", "in-progress", "verified", "no-safe-fix", "skipped"] = "not-started"
    label: str = "Fix not started"
    attempts: list[FixAttempt] = []
    user_decision: Literal["pending", "accepted", "rejected"] = "pending"
    branch: FixBranch | None = None
    publish: Publish | None = None


class Retest(BaseModel):
    """The bug's regression test rerun on another revision of the repository (a newer commit or a fix PR)."""

    at: str
    ref: str
    revision: str
    outcome: Literal["still_reproducible", "fixed", "cannot_confirm"]
    detail: str
    runs: list[str] = []


class Bug(BaseModel):
    id: str
    candidate_id: str
    experiment_id: str
    title: str
    category: BugCategory
    invariant: InvariantId
    status: EvidenceStatus
    clock: ClockConfig
    violation: Violation
    failure: str
    evidence: list[Evidence] = []
    regression_test_path: str
    regression_test: str
    contribution_test: str | None = None  # standalone regression included in the upstream patch
    issue_match: dict[str, str] | None = None
    issue_match_label: str = "No matching public issue found"
    fix: Fix = Fix()
    # Raven's reproduction through the code's own API, when she verified with tools: code, failing and control
    # points (zone and ISO instant). Code reran it before the bug was accepted.
    reproduction: dict[str, str] | None = None
    retests: list[Retest] = []


class IntendedFinding(BaseModel):
    """A repeated violation that the repository itself says is intended: its own passing test asserts the
    behaviour, or its docs describe it. Reported as a finding about the design, never as a bug, never fixed."""

    id: str
    candidate_id: str
    experiment_id: str
    title: str
    invariant: InvariantId
    violation: Violation
    explanation: str
    evidence: list[Evidence] = []
    # Repository tests cited as the source of intent, each confirmed passing on the original revision.
    confirmed_tests: list[str] = []


class Version(BaseModel):
    id: str
    label: str
    role: Literal["affected", "patched", "under-test"]
    source: Literal["user-input"] = "user-input"
    result: Literal["fails", "passes", "not-run", "inconclusive"] = "not-run"
    includes_suggested_fix: bool = False


class ServerClockReading(BaseModel):
    tz: str
    method: Literal["unit-test"] = "unit-test"
    dateUnderTest: str  # noqa: N815 (frontend field name)
    label: str


class ReplayEvent(BaseModel):
    """The frontend's ReplayEvent shape (frontend/src/data/types.ts) plus `phase` and `data`."""

    id: str
    seq: int
    tOffsetMs: int  # noqa: N815
    actor: Actor
    kind: EventKind
    phase: Phase
    text: str
    status: EvidenceStatus
    versionId: str  # noqa: N815
    browserClock: None = None  # noqa: N815 (no browser adapter in the MVP)
    serverClock: Literal["not controlled"] | ServerClockReading = "not controlled"  # noqa: N815
    evidence: dict[str, str] | None = None
    check: dict[str, str] | None = None
    data: dict[str, object] | None = None


class Budget(BaseModel):
    agent_calls: int = 0
    active_seconds: float = 0.0


class CoverageRow(BaseModel):
    """What the Crew tested for one candidate, computed by code from experiments, sweeps and verdicts."""

    candidate_id: str
    unit: str
    path: str
    status: Literal["not_selected", "not_designed", "adapter_invalid", "partial", "clean", "violations"]
    experiments: list[str] = []
    rules: list[str] = []
    edges: list[str] = []  # violations as "rule @ zone (fall-back | spring-forward | month end | other)"
    outcome: str = ""


class Intent(BaseModel):
    """One direction the planner (Wraith Director) sent the Crew in after a round of findings."""

    id: str
    round: int
    candidate_id: str
    focus: str
    rationale: str
    status: Literal["queued", "designed", "swept", "rejected"] = "queued"
    experiment_id: str | None = None
    reason: str = ""


class SweepWindow(BaseModel):
    start_ms: int
    end_ms: int  # Exclusive UTC boundary.

    def contains(self, ms: int) -> bool:
        return self.start_ms <= ms < self.end_ms


class EnvironmentCheck(BaseModel):
    """Can this repository's test runner run a generated test at all? Checked once per case with a canary, before any
    experiment is judged, because the answer is the same for every experiment (pipeline._environment)."""

    status: Literal["ok", "failed", "skipped"] = "skipped"
    runner_config: str | None = (
        None  # the repo-wide runner profile the experiments use, when the repo's own config can't
    )
    how: str = ""  # which step made it work: the repository's own setup, the default profile, or an agent repair
    node: str | None = None
    missing_globals: list[str] = []  # globals this Node does not have (for example Temporal)
    provided: list[str] = []  # globals TimeWraith supplies from a polyfill it installed outside the repository
    polyfills: list[str] = []  # installed packages that supply some of them
    attempts: list[str] = []
    reason: str | None = None  # why it failed, when it did


class RunSummary(BaseModel):
    """How a finished run went, in counts, so runs and repositories can be compared (pipeline._run_health)."""

    experiments: int = 0
    ran: int = 0
    adapter: int = 0
    environment: int = 0
    throttled: int = 0
    timeout: int = 0
    repairs_rejected: int = 0
    environment_check: str = "skipped"


class Investigation(BaseModel):
    python_environment: int | None = Field(default=None, ge=1)
    sweep_window: SweepWindow | None = None
    id: str
    created_at: str
    request: CreateInvestigation
    target: Target
    stage: Stage = "queued"
    phase: Phase = "repository"
    error: str | None = None
    status: EvidenceStatus = "planned"
    runtime: str = "stub"
    runtime_label: str = "Stub runtime, not a Kiro Crew run"
    replay_label: Literal["Live", "Recorded investigation replay"] = "Live"
    capabilities: CapabilityReport | None = None
    feature_map: FeatureMap | None = None
    test_plan: TestPlan | None = None
    versions: list[Version] = []
    bugs: list[Bug] = []
    intended: list[IntendedFinding] = []
    sweeps: list[SweepResult] = []
    decisions: list[DecisionRecord] = []
    budget: Budget = Budget()
    revealed: bool = False
    notes: list[str] = []
    coverage: list[CoverageRow] = []
    intents: list[Intent] = []
    environment: EnvironmentCheck | None = None
    run_summary: RunSummary | None = None


ATTENTION_PREFIX = "Attention: "  # a note with this prefix tells the page the run finished with problems


class InvestigationSummary(BaseModel):
    id: str
    created_at: str
    target: Target
    mode: CaseMode
    stage: Stage
    phase: Phase
    status: EvidenceStatus
    bug_count: int
    fix_verified_count: int = 0
    intended_count: int = 0
    attention: str | None = None  # the notice a finished run left (see pipeline._run_health), without its prefix
    replay_label: str
    runtime_label: str
    error: str | None = None
    # Why it stopped, in words (the last note), when the stage is failed.
    message: str | None = None
