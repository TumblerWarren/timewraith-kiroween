/**
 * Backend contract types (docs/integration-contract.md). The source of truth is the Pydantic models exported to
 * backend/schemas/*.schema.json; `__tests__/contract.test.ts` checks that every field named here exists there,
 * so a backend rename fails the frontend tests instead of failing silently at runtime.
 * Only the fields the Case Board reads are typed.
 */
import type { CaseModeId } from "../content/modes";
import type { EvidenceStatusId } from "../content/evidence";

export type Phase = "repository" | "discovery" | "design" | "execution" | "verification" | "fix";
export type Stage =
  | "queued"
  | "cloning"
  | "analyzing"
  | "discovering"
  | "designing"
  | "awaiting-plan-approval"
  | "installing"
  | "experimenting"
  | "verifying"
  | "fixing"
  | "completed"
  | "failed"
  | "cancelled";

export const FINAL_STAGES: readonly Stage[] = ["completed", "failed", "cancelled"];

export type ActorId =
  | "wraith-director"
  | "watchtower-warden"
  | "bat-scout"
  | "pumpkin-mechanic"
  | "spider-weaver"
  | "raven-archivist"
  | "two-faced-jack"
  | "doctor-stitch";

export interface FlowStep {
  readonly id: Phase;
  readonly title: string;
  readonly owner: ActorId;
  readonly owner_name: string;
  readonly kind: "kiro-agent" | "code";
  readonly does: string;
  readonly decides: string;
  readonly follow_on: boolean;
}

export interface ApiTarget {
  readonly repository_url: string;
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly revision: string | null;
}

export interface CreateInvestigation {
  readonly repository_url: string;
  readonly ref: string;
  readonly mode: CaseModeId;
  readonly issue_url?: string | null;
  readonly area?: string | null;
  readonly auto: boolean;
}

export interface InvestigationSummary {
  readonly id: string;
  readonly created_at: string;
  readonly target: ApiTarget;
  readonly mode: CaseModeId;
  readonly stage: Stage;
  readonly phase: Phase;
  readonly status: EvidenceStatusId;
  readonly bug_count: number;
  readonly fix_verified_count?: number;
  /** Findings the repository documents as intended (not bugs). */
  readonly intended_count?: number;
  readonly replay_label: string;
  readonly runtime_label: string;
  /** Stop code when the stage is failed (e.g. `ref_not_found`). */
  readonly error?: string | null;
  /** Why it stopped, in words, when the stage is failed. */
  readonly message?: string | null;
}

export interface CapabilityItem {
  readonly id: string;
  readonly status: "supported" | "unsupported" | "unknown";
  readonly reason: string;
}

export interface Candidate {
  readonly id: string;
  readonly title: string;
  readonly unit: { readonly path: string; readonly name: string; readonly start_line: number };
  readonly bug_categories: readonly string[];
  readonly score: number;
  readonly rationale: string | null;
  readonly selected: boolean;
}

export interface InvariantUse {
  readonly id: string;
  readonly reason: string;
}

export interface Experiment {
  readonly id: string;
  readonly candidate_id: string;
  readonly status: "planned" | "designed" | "not_designed" | "adapter_invalid" | "swept";
  readonly executability_reason: string | null;
  readonly claim: string | null;
  readonly invariants: readonly InvariantUse[];
  readonly point_count: number;
  readonly zones: readonly string[];
}

export interface Evidence {
  readonly kind: "signal" | "source" | "invariant" | "point" | "issue" | "test" | "doc";
  readonly ref: string;
  readonly why: string;
}

export interface DecisionRecord {
  readonly id: string;
  readonly phase: Phase;
  readonly agent: ActorId;
  readonly step: string;
  readonly runtime: string;
  readonly subject: string;
  readonly claim: string;
  readonly evidence: readonly Evidence[];
  readonly dropped_evidence: number;
  readonly checks: readonly string[];
  readonly decision: "accepted" | "rejected" | "not_run";
  readonly rule: string;
}

export interface Violation {
  readonly invariant: string;
  readonly zone: string;
  readonly instant: string;
  readonly local: string;
  readonly detail: string;
  readonly count: number;
}

export interface GateResult {
  readonly gate: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface FixAttempt {
  readonly attempt: number;
  readonly summary: string;
  readonly root_cause: string;
  readonly diff: string;
  readonly gates: readonly GateResult[];
  readonly accepted_by_gates: boolean;
  /** Doctor Stitch's tool calls and regression-test runs in this attempt's session. */
  readonly tool_calls?: number;
  readonly test_runs?: number;
}

export interface Fix {
  readonly state: "not-started" | "in-progress" | "verified" | "no-safe-fix" | "skipped";
  readonly label: string;
  readonly attempts: readonly FixAttempt[];
  readonly user_decision: "pending" | "accepted" | "rejected";
}

export interface Bug {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly invariant: string;
  readonly status: EvidenceStatusId;
  readonly violation: Violation;
  readonly evidence: readonly Evidence[];
  readonly regression_test_path: string;
  readonly regression_test: string;
  readonly issue_match: { readonly number: string; readonly title: string; readonly url: string } | null;
  readonly issue_match_label: string;
  readonly fix: Fix;
}

/** A repeated rule break that the repository's own passing test or docs say is deliberate: not a bug, not fixed. */
export interface IntendedFinding {
  readonly id: string;
  readonly title: string;
  readonly invariant: string;
  readonly violation: Violation;
  readonly explanation: string;
  readonly evidence: readonly Evidence[];
  readonly confirmed_tests: readonly string[];
}

export interface SweepResult {
  readonly experiment_id: string;
  readonly points_run: number;
  readonly zones: readonly string[];
  readonly violations: readonly Violation[];
}

export interface Investigation {
  readonly id: string;
  readonly created_at: string;
  readonly request: CreateInvestigation;
  readonly target: ApiTarget;
  readonly stage: Stage;
  readonly phase: Phase;
  readonly error: string | null;
  readonly status: EvidenceStatusId;
  readonly runtime_label: string;
  readonly replay_label: string;
  readonly capabilities: { readonly items: readonly CapabilityItem[] } | null;
  readonly feature_map: { readonly note: string; readonly candidates: readonly Candidate[] } | null;
  readonly test_plan: { readonly experiments: readonly Experiment[] } | null;
  readonly bugs: readonly Bug[];
  readonly intended?: readonly IntendedFinding[];
  readonly sweeps: readonly SweepResult[];
  readonly decisions: readonly DecisionRecord[];
  readonly budget: { readonly agent_calls: number; readonly active_seconds: number };
  readonly notes: readonly string[];
}

export interface ReplayEventMsg {
  readonly id: string;
  readonly seq: number;
  readonly actor: ActorId;
  readonly kind: string;
  readonly phase: Phase;
  readonly text: string;
  readonly status: EvidenceStatusId;
  /** Tool events (kind "tool") and attempt starts carry { bug_id, attempt, calls, max_calls }. */
  readonly data?: Readonly<Record<string, unknown>> | null;
}

export interface Health {
  readonly gateway: string;
  readonly agent_runtime: { readonly name: string; readonly label: string };
  readonly sandbox: { readonly available: boolean; readonly detail: string };
  readonly git: boolean;
  readonly limits?: { readonly agent_calls: number; readonly minutes: number; readonly fix_attempts: number; readonly bugs_to_fix: number };
}

/** GET /system/setup: Docker Desktop, the Kiro Crew container and the Kiro sign-in. */
export interface SetupStatus {
  readonly docker: { readonly installed: boolean; readonly running: boolean; readonly starting: boolean; readonly can_start: boolean };
  readonly crew: {
    readonly image: string;
    readonly container: "missing" | "stopped" | "running";
    readonly install: "idle" | "pulling" | "starting" | "failed";
    readonly install_error: string | null;
    readonly signed_in: boolean;
    /** Who is signed in, such as "Builder ID · name@example.com". */
    readonly account?: string | null;
  };
  readonly login: { readonly state: "idle" | "pending" | "done" | "failed"; readonly code: string | null; readonly url: string | null; readonly error: string | null };
}

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}
