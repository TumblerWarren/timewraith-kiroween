import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLOW_STEPS } from "../../content/flow";

/**
 * Drift check between `api/types.ts` and the backend's exported JSON Schemas (backend/schemas/*.schema.json, the
 * source of truth). Every field the frontend reads must exist in the schema, so a backend rename fails here.
 */
const SCHEMAS = join(__dirname, "..", "..", "..", "..", "backend", "schemas");

type Schema = { properties?: Record<string, unknown>; $defs?: Record<string, { properties?: Record<string, unknown>; enum?: string[] }> };
const load = (name: string): Schema => JSON.parse(readFileSync(join(SCHEMAS, `${name}.schema.json`), "utf8"));
const props = (s: { properties?: Record<string, unknown> } | undefined) => Object.keys(s?.properties ?? {});

const USED: Record<string, readonly string[]> = {
  Investigation: ["id", "created_at", "request", "target", "stage", "phase", "error", "status", "runtime_label", "replay_label", "capabilities", "feature_map", "test_plan", "bugs", "intended", "sweeps", "decisions", "budget", "notes", "coverage", "intents"],
  InvestigationSummary: ["id", "created_at", "target", "mode", "stage", "phase", "status", "bug_count", "fix_verified_count", "intended_count", "attention", "replay_label", "runtime_label", "error", "message"],
  CreateInvestigation: ["repository_url", "ref", "mode", "issue_url", "area", "auto"],
  ReplayEvent: ["id", "seq", "actor", "kind", "phase", "text", "status", "data", "serverClock"],
  DecisionRecord: ["id", "phase", "agent", "step", "runtime", "subject", "claim", "evidence", "dropped_evidence", "checks", "decision", "rule"],
  FlowStep: ["id", "title", "owner", "owner_name", "kind", "does", "decides", "follow_on"],
};

const DEFS: Record<string, readonly string[]> = {
  Bug: ["id", "title", "category", "invariant", "status", "violation", "evidence", "regression_test_path", "regression_test", "contribution_test", "issue_match", "issue_match_label", "fix", "retests", "reproduction"],
  Retest: ["at", "ref", "revision", "outcome", "detail", "runs"],
  CoverageRow: ["candidate_id", "unit", "path", "status", "experiments", "rules", "edges", "outcome"],
  Intent: ["id", "round", "candidate_id", "focus", "rationale", "status", "experiment_id", "reason"],
  Fix: ["state", "label", "attempts", "user_decision", "branch", "publish"],
  FixBranch: ["name", "path", "base", "commit", "files", "created_at", "patch_file", "upstream_url", "contribution"],
  Contribution: ["prepared_at", "rules", "base", "rebased", "notes", "checks", "title", "body", "test_path"],
  CheckResult: ["name", "command", "passed", "preexisting", "detail"],
  RuleSummary: ["default_branch", "archived", "contributing_url", "template_path", "conventional_commits", "dco", "cla", "ai_policy", "test_dir", "test_pattern", "scripts"],
  Publish: ["fork", "branch", "commit", "pushed_at", "pr_url", "pr_number", "pr_opened_at", "updates", "updated_at", "update_note"],
  FixAttempt: ["attempt", "summary", "root_cause", "diff", "gates", "accepted_by_gates", "tool_calls", "test_runs"],
  GateResult: ["gate", "passed", "detail"],
  Violation: ["invariant", "zone", "instant", "local", "detail", "count"],
  Experiment: ["id", "candidate_id", "status", "executability_reason", "claim", "invariants", "point_count", "zones"],
  Candidate: ["id", "title", "unit", "bug_categories", "score", "rationale", "selected"],
  SweepResult: ["experiment_id", "points_run", "zones", "violations"],
  Target: ["repository_url", "owner", "repo", "ref", "revision"],
  IntendedFinding: ["id", "title", "invariant", "violation", "explanation", "evidence", "confirmed_tests"],
};

describe("frontend types match the backend schemas", () => {
  for (const [name, fields] of Object.entries(USED)) {
    it(`${name} has every field the board reads`, () => {
      const have = props(load(name));
      for (const f of fields) expect(have, `${name}.${f}`).toContain(f);
    });
  }

  it("nested Investigation parts have every field the board reads", () => {
    const defs = load("Investigation").$defs ?? {};
    for (const [name, fields] of Object.entries(DEFS)) {
      const have = props(defs[name]);
      for (const f of fields) expect(have, `${name}.${f}`).toContain(f);
    }
  });

  it("the flow steps are the backend's phases in the same order", () => {
    const phases = (load("FlowStep").properties?.id as { enum?: string[] } | undefined)?.enum ?? load("FlowStep").$defs?.Phase?.enum;
    expect(FLOW_STEPS.map((s) => s.id)).toEqual(phases);
  });
});
