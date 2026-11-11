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
    "planning",
    "awaiting-plan-approval",
    "installing",
    "experimenting",
    "verifying",
    "fixing",
    "completed",
    "failed",
    "cancelled",
]
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
]


class CreateInvestigation(BaseModel):
    repository_url: str = Field(max_length=300)
    ref: str = Field(max_length=200)
    mode: CaseMode = "open-hunt"
    issue_url: str | None = Field(default=None, max_length=300)
    area: str | None = Field(default=None, max_length=200)
    auto: bool = False  # True skips both approval stops


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
    instant: str  # ISO 8601 UTC, e.g. 2026-03-08T07:30:00Z
    time_zone: str  # IANA
    label: str  # what this point probes, e.g. "spring-forward gap"
    scope: Literal["test_process"] = "test_process"


class Experiment(BaseModel):
    id: str
    candidate_id: str
    category: BugCategory | Literal["baseline"]
    clocks: list[ClockConfig]
    adapter: Literal["js_tests"] = "js_tests"
    executability: Literal["ready", "needs_setup", "not_controllable"]
    executability_reason: str | None = None


class TestPlan(BaseModel):
    kind: Literal["Planned experiments, not run"] = "Planned experiments, not run"
    experiments: list[Experiment] = []
    capped: bool = False


class RunResult(BaseModel):
    experiment_id: str
    clock: ClockConfig
    outcome: Literal["passed", "assertion_failed", "error", "timeout"]
    failure: str | None = None


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


class FileEdit(BaseModel):
    path: str
    content: str


class FixAttempt(BaseModel):
    attempt: int
    summary: str
    diff: str
    gates: list[GateResult] = []
    accepted_by_gates: bool = False


class Fix(BaseModel):
    state: Literal["not-started", "in-progress", "verified", "no-safe-fix", "skipped"] = "not-started"
    label: str = "Suggested fix · not verified"
    attempts: list[FixAttempt] = []
    user_decision: Literal["pending", "accepted", "rejected"] = "pending"


class Bug(BaseModel):
    id: str
    candidate_id: str
    experiment_id: str
    title: str
    category: BugCategory | Literal["baseline"]
    status: EvidenceStatus
    clock: ClockConfig
    failure: str
    regression_test_path: str
    regression_test: str
    issue_match: dict[str, str] | None = None
    issue_match_label: str = "No matching public issue found"
    fix: Fix = Fix()


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
    """The frontend's ReplayEvent shape (frontend/src/data/types.ts) plus `data` for backend-only kinds."""

    id: str
    seq: int
    tOffsetMs: int  # noqa: N815
    actor: Actor
    kind: EventKind
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
    runs: list[RunResult] = []
    budget: Budget = Budget()
    revealed: bool = False
    notes: list[str] = []


class InvestigationSummary(BaseModel):
    id: str
    created_at: str
    target: Target
    mode: CaseMode
    stage: Stage
    status: EvidenceStatus
    bug_count: int
    replay_label: str
    runtime_label: str
