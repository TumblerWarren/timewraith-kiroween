import type { Bug, Investigation } from "../../../../api/types";

export const bugFixture: Bug = {
  id: "bug-1", title: "Repeated hour moves the clock backwards", category: "dst", invariant: "next_after_now", status: "reproduced",
  violation: { invariant: "next_after_now", zone: "Australia/Lord_Howe", instant: "2024-04-06T15:00:00Z", local: "2024-04-07T01:30:00+10:30", detail: "The next instant precedes the starting instant.", count: 1 },
  evidence: [], regression_test_path: "clock.test.ts", regression_test: "assert(next > now);", issue_match: null, issue_match_label: "No matching public issue found",
  fix: { state: "not-started", label: "Fix not started", attempts: [], user_decision: "pending" },
  reproduction: { code: "const result = nextRun(clock);", failing: "Australia/Lord_Howe @ 2024-04-06T15:00:00Z", control: "UTC @ 2024-04-06T15:00:00Z", user_check: "const next = api.parse('0 * * * *').next();", user_failing: "Public API: Australia/Lord_Howe @ 2024-04-06T15:00:00Z" },
  retests: [
    { at: "2026-11-15T10:00:00Z", ref: "master", revision: "123456789012abcdef", outcome: "still_reproducible", detail: "The regression test still fails three times." },
    { at: "2026-11-16T10:00:00Z", ref: "pull/453", revision: "abcdef1234567890", outcome: "fixed", detail: "The regression test passes three times." },
  ],
};

export const caseFixture: Investigation = {
  id: "case-fixture", created_at: "2026-11-16T08:00:00Z",
  request: { repository_url: "https://github.com/example/clock", ref: "master", mode: "open-hunt", auto: false },
  target: { repository_url: "https://github.com/example/clock", owner: "example", repo: "clock", ref: "master", revision: "123456789012abcdef" },
  stage: "completed", phase: "fix", error: null, status: "reproduced", runtime_label: "Kiro Crew", replay_label: "Recorded investigation replay",
  capabilities: null, feature_map: null, test_plan: null, bugs: [bugFixture], sweeps: [], budget: { active_seconds: 180, agent_calls: 6 },
  notes: ["Wrap-up: the final planner round was skipped when the time budget ended."],
  coverage: [
    { candidate_id: "c1", unit: "nextRun", path: "src/clock.ts:40", status: "violations", experiments: ["e1"], rules: ["next_after_now"], edges: ["next_after_now @ Australia/Lord_Howe (fall-back)"], outcome: "bug: repeated hour moves the clock backwards" },
    { candidate_id: "c2", unit: "parseDate", path: "src/date.ts:12", status: "clean", experiments: ["e2"], rules: ["well_formed"], edges: [], outcome: "No anomaly observed in tested cases" },
    { candidate_id: "c3", unit: "formatDate", path: "src/format.ts:8", status: "not_selected", experiments: [], rules: [], edges: [], outcome: "No time-sensitive input" },
    { candidate_id: "c4", unit: "advanceMinute", path: "src/clock.ts:90", status: "adapter_invalid", experiments: ["e4"], rules: [], edges: [], outcome: "Adapter did not pass its baseline check" },
    { candidate_id: "c5", unit: "getDate", path: "src/date.ts:120", status: "not_designed", experiments: [], rules: [], edges: [], outcome: "Time budget reached" },
  ],
  intents: [
    { id: "i1", round: 1, candidate_id: "c1", focus: "Check the repeated half hour", rationale: "The offset changes by thirty minutes.", status: "swept", experiment_id: "e1", reason: "" },
    { id: "i2", round: 2, candidate_id: "c2", focus: "Check the year boundary", rationale: "Confirm the date stays valid.", status: "rejected", experiment_id: null, reason: "already tried" },
  ],
  decisions: [
    { id: "d1", phase: "design", agent: "wraith-director", step: "plan_round", runtime: "kiro", subject: "round 1", claim: "A half-hour transition is a new direction.", evidence: [], dropped_evidence: 0, checks: [], decision: "accepted", rule: "One new direction: continue the hunt" },
    { id: "d2", phase: "design", agent: "wraith-director", step: "plan_round", runtime: "kiro", subject: "round 2", claim: "The remaining directions have already been tested.", evidence: [], dropped_evidence: 0, checks: [], decision: "rejected", rule: "No new direction: the hunt ends" },
    { id: "d3", phase: "design", agent: "wraith-director", step: "plan_round", runtime: "kiro", subject: "round 3", claim: "The planner found no further directions.", evidence: [], dropped_evidence: 0, checks: [], decision: "not_run", rule: "No new direction: the hunt ends" },
  ],
};
