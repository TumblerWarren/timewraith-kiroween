/**
 * Case view prose and short labels (task 9). Honesty-critical fixed strings (mode labels, "Browser clock
 * controlled", "Server time zone set", reveal outcomes, "Suggested fix", "Illustrative diff", "No upstream fix
 * found", "Fixed-version check not run", "Draft, not run ...") stay in `copy.ts`; this file holds the rest.
 * None of these strings names the hidden Blind hunt report.
 */

/** Region intro for an Illustrative replay (the Cal.com Blind hunt). The Recorded replay keeps `replayIntro`. */
export function illustrativeIntro(eventCount: number): string {
  return `This folder holds an illustrative replay. Nobody ran it: the ${eventCount} events below were written from a public report so you can see how a Blind hunt would go. The Crew is told the target and the area, and nothing else, until the reveal.`;
}
export const DRAFT_INTRO =
  "This folder belongs to a draft you opened in this browser. Nothing has run it yet, so there are no events to scrub and no rung on the ladder.";

// Case header
export const CASE_MODE_TERM = "Mode";
export const CASE_TARGET_TERM = "Target";
export const CASE_AREA_TERM = "Area";
export const CASE_ISSUE_TERM = "Issue";

// Replay controls
export const REPLAY_PLAY_LABEL = "Play";
export const REPLAY_PAUSE_LABEL = "Pause";
export const REPLAY_PLAY_NOTE = "Steps through the events, one every 1.4 seconds.";
export const EVENT_TRACK_LABEL = "Events";
export const VERSION_TRACK_LABEL = "Version and clock";
export const CURRENT_MARK = "current";
export const VERSION_ROLE_TEXT = {
  affected: "affected",
  fixed: "fixed",
  patched: "patched",
  "under-test": "under test",
} as const;
export const CHECK_STAMP = { fails: "fails", passes: "passes", inconclusive: "inconclusive" } as const;
export const CHECK_STAMP_ON = "on";

// Clock inspector
export const INSPECTOR_TITLE = "Clock inspector";
export const INSPECTOR_VERSION = "Target version";
export const INSPECTOR_BROWSER = "Browser clock";
export const INSPECTOR_ZONE_CALENDAR = "Calendar time zone";
export const INSPECTOR_ZONE_SERVER = "Server time zone";
export const INSPECTOR_SYSTEM_ZONE = "System time zone";
export const INSPECTOR_SERVER = "Server clock";
export const INSPECTOR_DATE = "Date under test";
export const BROWSER_CLOCK_NOT_USED = "Browser clock not used";
export const NO_ZONE_SET = "none set";

// Blind hunt reveal
export const REVEAL_HIDDEN_TITLE = "Hidden public report: shown at the reveal";
export const REVEAL_HIDDEN_NOTE =
  "The Crew works from the target and the area alone. The report this case was modelled on stays face down until the Raven checks the reproduced behaviour against it.";
export const REVEAL_SHOWN_LEAD = "Public report by a third party:";
export const REVEAL_SHOWN_NOTE = "TimeWraith claims no new finding. The Crew re-investigated a bug somebody else reported.";
export const REVEAL_OUTCOME_TERM = "Outcome";

// Time control note
export const TIME_CONTROL_TITLE = "How this case controlled time";
export const DRAFT_TIME_CONTROL = "Not run, so no clock has been set for this draft.";

// Suggested fix
export const FIX_CHANGE_CAPTION = "Proposed change";
export const FIX_TEST_CAPTION = "Regression test";
export const FIX_OURS_TITLE = "Doctor Stitch's suggestion";
export const FIX_UPSTREAM_TITLE = "Upstream";
export const FIX_STATUS_TERM = "Status";
export const FIX_SAME_APPROACH = "same approach as the fix in the public report";
export const FIX_UPSTREAM_HIDDEN = "The upstream fix is shown at the reveal.";
export const FIX_UPSTREAM_PASSES = "Passes on the patched pin (illustrative replay)";
export const FIX_REPORTED_RESULT = "Reported result:";
export const ADDED_LINE = "added line";
export const REMOVED_LINE = "removed line";
export const UNCHANGED_LINE = "unchanged line";

// Draft view
export const DRAFT_NO_EVENTS = "No events yet";
export const DRAFT_VERSION_TERM = "Version";
export const DRAFT_RESULT = "not run";

// Jack's two faces for a server-side case (the browser-side case keeps PROOF_BROWSER_FACE and PROOF_SERVER_FACE)
export const JACK_BROWSER_FACE_SERVER_CASE = {
  title: "Browser clock",
  text: "Not used. The bug lives in code that runs on the server, so moving the browser clock would change nothing.",
} as const;
export const JACK_SERVER_FACE_SERVER_CASE = {
  title: "Server clock",
  text: "Server time zone set to UTC for the test process, with fixed dates passed to a unit-level test.",
} as const;
export const JACK_DRAFT_FACES = {
  browser: { title: "Browser clock", text: "Not set. This draft has not run." },
  server: { title: "Server clock", text: "Not set. This draft has not run." },
} as const;

/** Source note for a Known issue sample other than FullCalendar #7998 (which keeps REPLAY_SOURCE_NOTE). */
export const SOURCE_NOTE_GENERIC = "Sample scenario modelled on a public third-party report. TimeWraith claims no new finding.";
// Version_Timeline (D21, Requirement 28)
export const TIMELINE_TITLE = "Version timeline";
export const TIMELINE_NOTE = "Release and report dates come from the linked records. Replay milestones carry no calendar date.";
export const TIMELINE_STATE_TEXT = {
  reached: "reached",
  ahead: "not reached yet",
  "not-run": "not run",
  hidden: "hidden",
} as const;
export const TIMELINE_HIDDEN_LABEL = "Public report";
export const TIMELINE_HIDDEN_TEXT = "Public report hidden until the reveal";
export const TIMELINE_NO_DATE = "date not stated";
export const TIMELINE_PIN_TEXT = "illustrative pin";
export const TIMELINE_DATE_LINK = { "published-release": "npm release", "issue-tracker": "issue tracker" } as const;
export const timelineEventText = (modeLabel: string, eventId: string) => `${modeLabel}, event ${eventId}`;
export const TIMELINE_DRAFT_LABEL = "Version entered";
export const TIMELINE_FIXED_PASS_TEXT = "the report's fix passes on the patched pin";
