/**
 * Fixed copy strings. Components and tests import these constants; no component retypes them.
 *
 * Honesty rules enforced here and by the copy-honesty test:
 * - The board shows only real investigations from the backend and drafts kept in this browser; there is no sample
 *   or illustrative data. Status of real runs comes from the backend's own labels (`replay_label`,
 *   `runtime_label`, `fix.label`), never from copy here.
 * - A negative result is "No anomaly observed in tested cases".
 * - A draft is "not run".
 */

// Open-a-case panel
export const HEADLINE = "Bugs are hiding in time.";
export const SUBHEAD = "Send your Crew to investigate date-boundary failures.";
export const POSITIONING = "An autonomous regression investigator for date-sensitive apps.";

// The Closing's one action
export const OPEN_A_CASE = "Open a case";

// Readiness board and the header's gateway badge: real status from GET /health.
export const CHECKLIST_LABEL = "Crew readiness";
export const GATEWAY_ONLINE = "Gateway connected";
export const GATEWAY_OFFLINE = "Backend offline: drafts only";
export const GATEWAY_CHECKING = "Checking the backend";

// Open-a-case form, drafts and real investigations
export const DRAFT_NOT_RUN = "Draft, not run";
export const DRAFT_CREATED = "Draft case created, not run";
export const RUN_DRAFT = "Run this draft";

/** Setup steps on the readiness board (components/CrewSetup.tsx). */
export const SETUP = {
  title: "Set up the Crew on this machine",
  docker: "Docker Desktop",
  crew: "Kiro Crew container",
  login: "Kiro sign-in",
  startDocker: "Start Docker",
  startCrew: "Start Kiro Crew",
  startLogin: "Sign in to Kiro",
  logout: "Sign out of Kiro",
  logoutConfirm: "Sign out",
  logoutCancel: "Keep signed in",
  logoutWarn:
    "Signing out stops real Kiro agent calls. Investigations that are running lose their agents, and new ones use the stub runtime until you sign in again.",
  signedInAs: "Signed in as",
  openSignIn: "Open the sign-in page",
  pulling: "downloading the image (a few minutes the first time)",
  codeLabel: "Sign-in code",
  deviceLead: "Approve this code on the sign-in page. Builder ID, Google and GitHub accounts all work.",
  deviceWait: "Waiting for you to approve. This board updates on its own.",
  dockerManual: "Start Docker Desktop yourself, then this step turns green.",
  dockerMissing: "Install Docker Desktop to run experiments.",
  state: {
    docker: { done: "running", busy: "starting", todo: "not running", blocked: "" },
    crew: { done: "running", busy: "starting", todo: "not started", blocked: "needs Docker" },
    login: { done: "signed in", busy: "waiting for your approval", todo: "not signed in", blocked: "needs the container" },
  },
} as const;
export const LIVE_CASE_STARTED = "Investigation started. The Crew is at work.";
export const NOT_SAVED = "Not saved: browser storage unavailable";
export const REMOVE_DRAFT = "Remove draft";
export const ISSUE_HIDDEN = "Issue hidden until the reveal";

// Case-scoped proof
export const BROWSER_NOT_SERVER = "Browser time ≠ server time";
export const BROWSER_NOT_SERVER_EXPLANATION =
  "The Playwright clock controls browser-side time only. The browser clock and the server clock are controlled separately, so a result in one says nothing about the other.";
export const NO_ANOMALY = "No anomaly observed in tested cases";

// Lost Hour: a generic illustration of the failure class, on a real calendar date.
export const PROBLEM_ILLUSTRATION_LABEL =
  "Illustration: the US spring-forward night, 8 March 2026. Clocks in New York jump from 01:59 to 03:00.";

/** Every fixed string, for the copy-honesty test and for scans. */
export const COPY_STRINGS = {
  HEADLINE,
  SUBHEAD,
  POSITIONING,
  OPEN_A_CASE,
  CHECKLIST_LABEL,
  GATEWAY_ONLINE,
  GATEWAY_OFFLINE,
  GATEWAY_CHECKING,
  DRAFT_NOT_RUN,
  DRAFT_CREATED,
  RUN_DRAFT,
  LIVE_CASE_STARTED,
  NOT_SAVED,
  REMOVE_DRAFT,
  ISSUE_HIDDEN,
  BROWSER_NOT_SERVER,
  BROWSER_NOT_SERVER_EXPLANATION,
  NO_ANOMALY,
  PROBLEM_ILLUSTRATION_LABEL,
} as const;
