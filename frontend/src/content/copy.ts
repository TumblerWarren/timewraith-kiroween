/**
 * Fixed copy strings (Requirements 3.1, 5.6, 6.1, 7.2, 7.9, 7.10, 8.4, 8.5, 16.1 to 16.9, 19 to 26).
 * Components and tests import these constants; no component retypes them.
 *
 * Honesty rules enforced here and by the copy-honesty property test:
 * - Pre-recorded data is "Recorded replay", modelled data "Illustrative replay", never "Live".
 * - Clock control is "Browser clock controlled"; server-side time is "Server time zone set".
 * - A negative result is "No anomaly observed in tested cases".
 * - Every mock-data region is labelled sample, illustrative or simulated; a draft is "not run".
 * - FullCalendar #7998 and Cal.com #30021 are third-party public reports, never a new finding.
 * - A suggested fix is never called merged, and is called verified only after a passing fixed-version check.
 *
 * The first spec version's "Enter the Clocktower" CTA and its note are retired (decision D19).
 */

// Open-a-case panel (Requirement 3.1)
export const HEADLINE = "Bugs are hiding in time.";
export const SUBHEAD = "Send your Crew to investigate date-boundary failures.";
export const POSITIONING = "An autonomous regression investigator for date-sensitive apps.";

// Secondary links (Requirements 5.6, 5.7); they live in the Closing and the footer since D19.
export const CTA_DEMO = "Watch the 3-minute demo";
export const CTA_GITHUB = "View source on GitHub";

// The Closing's one action (decision D19, Requirement 3.10)
export const OPEN_A_CASE = "Open a case";

// Setup checklist and the header's Gateway_Status_Badge (Requirements 6.1, 6.4, 6.5). Also the checklist's <h2>.
export const CHECKLIST_LABEL = "Demo mode, simulated status";
export const GATEWAY_LABEL = CHECKLIST_LABEL;

// Open-a-case form and drafts (Requirements 19, 20, 21)
export const NOT_CONTACTED = "Not contacted in demo mode";
export const DRAFT_NOT_RUN = "Draft, not run: cases run in the next milestone";
export const DRAFT_CREATED = "Draft case created, not run";
export const NOT_SAVED = "Not saved: browser storage unavailable";
export const REMOVE_DRAFT = "Remove draft";
export const ISSUE_HIDDEN = "Issue hidden until the reveal";

// Blind hunt reveal outcomes (Requirement 23)
export const REVEAL_MATCH = "Same behaviour as the public report";
export const REVEAL_NO_MATCH = "Did not match";

// Suggested fix (Requirement 24)
export const SUGGESTED_FIX = "Suggested fix";
export const ILLUSTRATIVE_DIFF = "Illustrative diff";
export const NO_UPSTREAM_FIX = "No upstream fix found";
export const FIXED_CHECK_NOT_RUN = "Fixed-version check not run";
export const ILLUSTRATIVE_PIN = "illustrative pin";

// Replay Lab (Requirements 7.2, 7.9, 7.10, 26)
export const REPLAY_LABEL = "Sample replay (illustrative data), not a real finding";
export const CALCOM_REPLAY_LABEL = "Illustrative replay modelled on the public report, not a real recorded run";
export const RECORDED_REPLAY = "Recorded replay";
export const ILLUSTRATIVE_REPLAY = "Illustrative replay";
export const BROWSER_CLOCK_CONTROLLED = "Browser clock controlled";
export const SERVER_TZ_SET = "Server time zone set";
export const SERVER_CLOCK_NOT_CONTROLLED = "Server clock not controlled";
export const REPLAY_SOURCE_NOTE =
  "Sample scenario modelled on FullCalendar issue #7998, a time-zone date-boundary case. TimeWraith claims no new finding.";
export const REPLAY_SOURCE_LINK_LABEL = "FullCalendar issue #7998";

// Case-scoped proof (Requirements 8.4, 8.5)
export const BROWSER_NOT_SERVER = "Browser time ≠ server time";
export const BROWSER_NOT_SERVER_EXPLANATION =
  "The Playwright clock controls browser-side time only. The browser clock and the server clock are controlled separately, so a result in one says nothing about the other.";
export const NO_ANOMALY = "No anomaly observed in tested cases";

// Lost Hour (Requirement 3.3, decisions D1 and D18): a generic illustration, not the #7998 case, and it does not
// name Cal.com #30021, whose report stays hidden until the Blind hunt reveal.
export const PROBLEM_ILLUSTRATION_LABEL =
  "Illustration: the US spring-forward night, 8 March 2026. Clocks in New York jump from 01:59 to 03:00.";

/** Every fixed string, for the copy-honesty property test and for scans. */
export const COPY_STRINGS = {
  HEADLINE,
  SUBHEAD,
  POSITIONING,
  CTA_DEMO,
  CTA_GITHUB,
  OPEN_A_CASE,
  CHECKLIST_LABEL,
  NOT_CONTACTED,
  DRAFT_NOT_RUN,
  DRAFT_CREATED,
  NOT_SAVED,
  REMOVE_DRAFT,
  ISSUE_HIDDEN,
  REVEAL_MATCH,
  REVEAL_NO_MATCH,
  SUGGESTED_FIX,
  ILLUSTRATIVE_DIFF,
  NO_UPSTREAM_FIX,
  FIXED_CHECK_NOT_RUN,
  ILLUSTRATIVE_PIN,
  REPLAY_LABEL,
  CALCOM_REPLAY_LABEL,
  RECORDED_REPLAY,
  ILLUSTRATIVE_REPLAY,
  BROWSER_CLOCK_CONTROLLED,
  SERVER_TZ_SET,
  SERVER_CLOCK_NOT_CONTROLLED,
  REPLAY_SOURCE_NOTE,
  REPLAY_SOURCE_LINK_LABEL,
  BROWSER_NOT_SERVER,
  BROWSER_NOT_SERVER_EXPLANATION,
  NO_ANOMALY,
  PROBLEM_ILLUSTRATION_LABEL,
} as const;
