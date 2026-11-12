"""Data contracts. These Pydantic models are the source of truth; `schema_export.py` writes them to backend/schemas/."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

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
    "well_formed", "deterministic", "local_date_matches", "instant_zone_independent", "flag_monotonic", "next_after_now"
]
OutputField = Literal["instant", "next", "flag", "date", "value"]


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
    test_runner: Literal["vitest", "jest"] | None = None
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


class Evidence(BaseModel):
    """One piece of evidence an agent cites. Code resolves every ref before the claim counts."""

    kind: Literal["signal", "source", "invariant", "point", "issue", "test", "doc"]
    ref: str = Field(
        max_length=200,
        description="signal id | path:line[-line] (source, test, doc) | invariant id | zone@ISO | issue no.",
    )
    why: str = Field(max_length=300)


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
    id: InvariantId
    reason: str = Field(max_length=300)
    max_gap_ms: int | None = Field(default=None, ge=1)


class Experiment(BaseModel):
    id: str
    candidate_id: str
    categories: list[BugCategory]
    adapter: Literal["js_sweep"] = "js_sweep"
    status: Literal["planned", "designed", "not_designed", "adapter_invalid", "swept"] = "planned"
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


class TestPlan(BaseModel):
    kind: Literal["Planned experiments, not run"] = "Planned experiments, not run"
    experiments: list[Experiment] = []
    capped: bool = False


class Violation(BaseModel):
    invariant: InvariantId
    zone: str
    instant: str  # ISO UTC
    local: str  # wall time in `zone`
    detail: str
    count: int = 1
    context_ms: list[int] = []  # instants a regression test needs
    expected: str | None = None


class SweepResult(BaseModel):
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


class Fix(BaseModel):
    state: Literal["not-started", "in-progress", "verified", "no-safe-fix", "skipped"] = "not-started"
    label: str = "Fix not started"
    attempts: list[FixAttempt] = []
    user_decision: Literal["pending", "accepted", "rejected"] = "pending"


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
    issue_match: dict[str, str] | None = None
    issue_match_label: str = "No matching public issue found"
    fix: Fix = Fix()


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


class Investigation(BaseModel):
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
    replay_label: str
    runtime_label: str
    error: str | None = None
    # Why it stopped, in words (the last note), when the stage is failed.
    message: str | None = None
