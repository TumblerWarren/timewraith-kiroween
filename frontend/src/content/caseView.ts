/**
 * Case view prose and short labels. Honesty-critical fixed strings ("Browser time ≠ server time", "No anomaly
 * observed in tested cases", "Draft, not run") stay in `copy.ts`; this file holds the rest. Labels of real runs
 * come from the backend.
 */

// Empty Case view (no case open yet)
export const CASE_EMPTY_TITLE = "No case is open";
export const CASE_EMPTY_TEXT =
  "Open a case with a GitHub repository above, or pick one from the Case library. Its investigation, findings and fixes appear here.";
export const CASE_EMPTY_ACTION = "Open a case";
export const DRAFT_INTRO =
  "This folder belongs to a draft you opened in this browser. Nothing has run it yet, so there are no events and no rung on the ladder.";

// Case header
export const CASE_MODE_TERM = "Mode";
export const CASE_TARGET_TERM = "Target";
export const CASE_AREA_TERM = "Area";
export const CASE_ISSUE_TERM = "Issue";

// Time control note
export const TIME_CONTROL_TITLE = "How this case controlled time";
export const DRAFT_TIME_CONTROL = "Not run, so no clock has been set for this draft.";

// Diffs
export const FIX_CHANGE_CAPTION = "Proposed change";
export const ADDED_LINE = "added line";
export const REMOVED_LINE = "removed line";
export const UNCHANGED_LINE = "unchanged line";

// Draft view
export const DRAFT_NO_EVENTS = "No events yet";
export const DRAFT_VERSION_TERM = "Version";
export const DRAFT_RESULT = "not run";

export const JACK_DRAFT_FACES = {
  browser: { title: "Browser clock", text: "Not set. This draft has not run." },
  server: { title: "Server clock", text: "Not set. This draft has not run." },
} as const;

// Version timeline of a draft
export const TIMELINE_TITLE = "Version timeline";
export const TIMELINE_DRAFT_LABEL = "Version entered";

// Real investigations (Live_Case). The status labels themselves come from the backend.
export const INVESTIGATION_INTRO =
  "This folder is a real investigation on the TimeWraith backend. It fills in as the Crew works: each step below shows what was found, and the Crew's reasons sit beside each decision.";
export const INV_STAGE_TERM = "Stage";
export const INV_REVISION_TERM = "Revision";
export const INV_LOADING = "Loading the investigation";
export const INV_UNREACHABLE = "The backend is offline, so this investigation cannot be shown right now.";
export const INV_STOPPED = "The investigation stopped";
export const INV_NOTES_TITLE = "Notes from the Crew";
export const INV_APPROVAL_TITLE = "The Crew is waiting for your approval";
export const INV_APPROVAL_NOTE =
  "Nothing from the repository has run yet. Approving lets the Crew install the dependencies and sweep these experiments inside the Docker sandbox, with no network.";
export const INV_APPROVE = "Approve the experiments";
export const INV_CANCEL = "Cancel the investigation";
export const INV_CAPABILITIES_TITLE = "What the repository supports";
export const INV_CANDIDATES_TITLE = "Time-sensitive code the Crew found";
export const INV_KEPT = "kept for an experiment";
export const INV_EXPERIMENTS_TITLE = "Experiments";
export const INV_POINTS = (n: number, zones: number) => `${n} clock points in ${zones} time zones`;
export const INV_SWEEPS_TITLE = "Controlled execution";
export const INV_SWEEP_LINE = (points: number, zones: number, violations: number) =>
  `${points} clock points in ${zones} zones, ${violations} broken ${violations === 1 ? "rule" : "rules"}`;
export const INV_BUGS_TITLE = "Reproduced bugs";
export const INV_NO_BUGS = "No anomaly observed in tested cases";
export const INV_RULE_TERM = "Broken rule";
export const INV_WHERE_TERM = "Where and when";
export const INV_ISSUE_TERM = "Public issues";
export const INV_TEST_TERM = "Regression test";
export const INV_GATES_TITLE = "Fix gates";
export const INV_ATTEMPT = (n: number) => `Attempt ${n}`;
export const INV_ROOT_CAUSE = "Root cause";
export const INV_ACCEPT_FIX = "Accept the fix";
export const INV_REJECT_FIX = "Reject the fix";
export const INV_FIX_ACCEPTED = "Fix accepted";
export const INV_FIX_REJECTED = "Fix rejected";
export const INV_DECISIONS_TITLE = "Why the Crew decided";
export const INV_DECISION_WORDS = { accepted: "accepted", rejected: "rejected", not_run: "not run" } as const;
export const INV_DROPPED = (n: number) => `${n} cited ${n === 1 ? "item" : "items"} did not check out and ${n === 1 ? "was" : "were"} removed`;
export const INV_EVENTS_TITLE = "Event log";
export const GATE_LABELS: Readonly<Record<string, string>> = {
  test_first: "Fails first",
  diff_limits: "Small, safe diff",
  fixed: "Fixed in every zone",
  mutation_check: "Fails again without the fix",
  no_regressions: "No new test failures",
  no_new_anomalies: "No new broken rules",
  static_checks: "Typecheck and lint",
  independent_review: "Raven's blind review",
};
export const INVARIANT_LABELS: Readonly<Record<string, string>> = {
  well_formed: "Returns a valid value",
  deterministic: "Same input, same answer",
  local_date_matches: "Today is the local calendar date",
  instant_zone_independent: "Stored instant does not depend on the zone",
  flag_monotonic: "Once expired, stays expired",
  next_after_now: "Next run is after now and never goes back",
};
