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
  /** What went wrong in a run that finished (experiments that could not run, a refused agent service), or null. */
  readonly attention?: string | null;
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
  readonly expired_at_deadline?: boolean | null;
  readonly expectation_ref?: string | null;
  readonly id: string;
  readonly reason: string;
}

export interface Experiment {
  readonly id: string;
  readonly candidate_id: string;
  readonly status: "planned" | "designed" | "not_designed" | "adapter_invalid" | "not_run" | "swept";
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
  readonly failure_kind?: string;
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

export interface ContributionCheck {
  readonly name: string;
  readonly command: string;
  readonly passed: boolean;
  readonly preexisting: boolean;
  readonly detail: string;
}

export interface ContributionRules {
  readonly default_branch: string;
  readonly archived: boolean;
  readonly contributing_url: string | null;
  readonly template_path: string | null;
  readonly conventional_commits: boolean;
  readonly dco: boolean;
  readonly cla: boolean;
  readonly ai_policy: readonly string[];
  readonly test_dir: string | null;
  readonly test_pattern: string;
  readonly scripts: readonly string[];
}

export interface Contribution {
  readonly prepared_at: string;
  readonly rules: ContributionRules;
  readonly base: string;
  readonly rebased: boolean;
  readonly notes: readonly string[];
  readonly checks: readonly ContributionCheck[];
  readonly title: string;
  readonly body: string;
  readonly test_path: string;
}

/** The pull request text written again in the repository's own template and title style. Not saved or sent. */
export interface GeneratedDescription {
  readonly title: string;
  readonly body: string;
  /** The repository's pull request template file, or "" when it has none. */
  readonly template: string;
}

export interface FixBranch {
  readonly name: string;
  readonly path: string;
  readonly base: string;
  readonly commit: string;
  readonly files: readonly string[];
  readonly created_at: string;
  readonly patch_file: string;
  readonly upstream_url: string;
  readonly contribution?: Contribution | null;
}

export interface Publish {
  readonly fork: string;
  readonly branch: string;
  readonly commit: string;
  readonly pushed_at: string;
  readonly pr_url: string | null;
  readonly pr_number: number | null;
  readonly pr_opened_at: string | null;
  readonly updates?: number;
  readonly updated_at?: string | null;
  readonly update_note?: string | null;
}

export interface GitHubPreview {
  readonly ready: boolean;
  readonly upstream: string;
  readonly fork: string | null;
  readonly user: string | null;
  readonly branch: string;
  readonly title: string;
  readonly body: string;
  readonly files: readonly string[];
  readonly duplicates: readonly { readonly number: number; readonly title: string; readonly url: string; readonly state: string }[];
  readonly published: Publish | null;
  readonly problems: readonly string[];
  readonly contribution?: Contribution | null;
  readonly warnings?: readonly string[];
  readonly update?: { readonly available: boolean; readonly reason: string };
}

export interface Fix {
  readonly state: "not-started" | "in-progress" | "verified" | "no-safe-fix" | "skipped";
  readonly label: string;
  readonly attempts: readonly FixAttempt[];
  readonly user_decision: "pending" | "accepted" | "rejected";
  readonly branch?: FixBranch | null;
  readonly publish?: Publish | null;
}

export interface Bug {
  readonly id: string;
  readonly experiment_id?: string;
  readonly title: string;
  readonly category: string;
  readonly invariant: string;
  readonly status: EvidenceStatusId;
  readonly violation: Violation;
  readonly evidence: readonly Evidence[];
  readonly regression_test_path: string;
  readonly regression_test: string;
  readonly contribution_test?: string | null;
  readonly issue_match: { readonly number: string; readonly title: string; readonly url: string } | null;
  readonly issue_match_label: string;
  readonly fix: Fix;
  /** The regression test rerun on other revisions, such as the upstream fix PR. */
  readonly retests?: readonly Retest[];
  /** Raven's reproduction through the code's own API (code, failing and control points), when she verified with tools. */
  readonly reproduction?: {
    readonly code: string;
    readonly failing: string;
    readonly control: string;
    readonly control_code?: string;
    readonly user_check?: string;
    readonly user_failing?: string;
  } | null;
}

export interface Retest {
  readonly at: string;
  readonly ref: string;
  readonly revision: string;
  readonly outcome: "still_reproducible" | "fixed" | "cannot_confirm";
  readonly detail: string;
  readonly runs?: readonly string[];
}

export interface CoverageRow {
  readonly candidate_id: string;
  readonly unit: string;
  readonly path: string;
  readonly status: "not_selected" | "not_designed" | "adapter_invalid" | "partial" | "clean" | "violations";
  readonly experiments: readonly string[];
  readonly rules: readonly string[];
  readonly edges: readonly string[];
  readonly outcome: string;
}

export interface Intent {
  readonly id: string;
  readonly round: number;
  readonly candidate_id: string;
  readonly focus: string;
  readonly rationale: string;
  readonly status: "queued" | "designed" | "swept" | "rejected";
  readonly experiment_id: string | null;
  readonly reason: string;
}

/** A repeated rule break that the repository's own passing test or docs say is deliberate: not a bug, not fixed. */
export interface IntendedFinding {
  readonly id: string;
  readonly experiment_id?: string;
  readonly title: string;
  readonly invariant: string;
  readonly violation: Violation;
  readonly explanation: string;
  readonly evidence: readonly Evidence[];
  readonly confirmed_tests: readonly string[];
}

export interface SweepResult {
  readonly pytest_results?: readonly {
    readonly runtime?: string | null;
    readonly instant: string;
    readonly zone: string;
    readonly outcome: "passed" | "failed" | "skipped" | "blocked";
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
    readonly detail: string;
  }[];
  readonly pending_review?: number | null;
  readonly experiment_id: string;
  readonly points_run: number;
  readonly zones: readonly string[];
  readonly violations: readonly Violation[];
}

export interface Investigation {
  /** What the agents left undone when they stopped (usage limit, expired sign-in, throttle), in words. Continue runs it. */
  readonly unfinished?: readonly string[];
  readonly sweep_window?: { readonly start_ms: number; readonly end_ms: number } | null;
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
  readonly coverage?: readonly CoverageRow[];
  readonly intents?: readonly Intent[];
}

export interface ReplayEventMsg {
  readonly id: string;
  readonly seq: number;
  readonly actor: ActorId;
  readonly kind: string;
  readonly phase: Phase;
  readonly text: string;
  readonly status: EvidenceStatusId;
  readonly serverClock?: "not controlled" | { readonly label: string; readonly tz: string; readonly dateUnderTest: string };
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
/** How the Kiro Crew container signs in to Kiro. Different methods can be different Kiro accounts, with separate credits. */
export type LoginMethod = "builder_id" | "google" | "github";

export interface GitHubSetupStatus {
  readonly container: "missing" | "stopped" | "running";
  readonly install: "idle" | "building" | "starting" | "failed";
  readonly install_error: string | null;
  readonly connected: boolean;
  readonly user: string | null;
  readonly scopes: string;
  readonly login: {
    readonly state: "idle" | "pending" | "done" | "failed";
    readonly code: string | null;
    readonly url: string | null;
    readonly error: string | null;
  };
}

export interface SetupStatus {
  /** Optional for backends that predate the GitHub container. */
  readonly github?: GitHubSetupStatus;
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
  readonly login: {
    readonly state: "idle" | "pending" | "done" | "failed";
    readonly code: string | null;
    readonly url: string | null;
    readonly error: string | null;
    /** The sign-in method in progress or last tried. */
    readonly method?: LoginMethod;
  };
}

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}
