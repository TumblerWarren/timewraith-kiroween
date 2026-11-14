/**
 * Copy for the app shell and pages (redesign R4: five hash-routed pages). Honesty-critical strings stay in
 * `copy.ts`; case-detail labels shared with the old view stay in `caseView.ts`.
 */
import type { CaseTab } from "../app/router";

/** The three mascot sizes. Every figure on a page uses one of them. */
export const FIG = { avatar: 32, badge: 64, scene: 160 } as const;

export const NAV = {
  label: "Main",
  home: "Home",
  cases: "Cases",
  newCase: "New case",
  crew: "Crew setup",
  about: "How it works",
} as const;

/** The first-visit intro on the home page. */
export const INTRO = {
  label: "TimeWraith introduction",
  skip: "Skip intro",
  wraith: "Open a case",
  hint: "Click him to open a case",
} as const;

export const HOME = {
  lead: "Give TimeWraith a GitHub repository. The Crew finds its time-sensitive code, designs clock experiments, runs them in a Docker sandbox and reports only the bugs it can reproduce.",
  start: "Open a case",
  recent: "Recent cases",
  allCases: "See all cases",
  noCases: "No cases yet. Open one to see the Crew at work.",
  readinessTitle: "Before you start",
  readinessReady: "Docker, the Kiro Crew container and your Kiro sign-in are ready. Investigations run with real Kiro agents.",
  readinessNotReady: "Finish the Crew setup first, or investigations run with the stub runtime instead of Kiro agents.",
  readinessChecking: "Asking the backend about Docker, the Crew container and your sign-in.",
  readinessOffline: "Start the backend to run investigations: uv --directory backend run uvicorn timewraith.api:app --port 8787",
  setupLink: "Go to Crew setup",
} as const;

export const NEW_CASE = {
  title: "Open a case",
  lead: "Pin a public GitHub repository to a branch, tag or commit and choose how the Crew should hunt.",
  modesTitle: "Which mode",
} as const;

export const CASES = {
  title: "Cases",
  lead: "Every investigation on this backend, newest first, and the drafts saved in this browser.",
  empty: "No cases yet.",
  filterLabel: "Show",
  all: "All",
  columns: { target: "Repository", mode: "Mode", status: "Status", now: "Now", result: "Result", opened: "Opened" },
  remove: "Remove draft",
} as const;

export const CASE_PAGE = {
  back: "All cases",
  notFound: "This case was not found on the backend or in this browser.",
  offline: "The backend is offline, so this investigation cannot be loaded right now.",
  loading: "Loading the investigation",
  tabsLabel: "Case sections",
  tabs: { overview: "Overview", plan: "Plan", findings: "Findings", fixes: "Fixes", activity: "Activity" } satisfies Record<CaseTab, string>,
  counters: { elapsed: "Active time", open: "Open for", agents: "Agent calls", bugs: "Bugs reproduced", fixes: "Fixes verified" },
  stepsLabel: "Investigation steps",
  stepState: { done: "done", now: "now", waiting: "waiting for you", failed: "stopped here", ahead: "not yet", skipped: "skipped" },
  cancel: "Cancel",
  approve: "Approve the plan",
  reviewPlan: "Review the plan",
  reviewFixes: "Review the fixes",
  retryWith: (ref: string) => `Retry with ${ref}`,
  retry: "Run it again",
  needsYou: "Needs you",
  nothingNeeded: "Nothing needs you right now.",
  latest: "Latest activity",
  allActivity: "All activity",
  noEvents: "No events yet.",
  results: "Results so far",
  noBugsYet: "No bugs reproduced yet.",
  phaseFilter: "Step",
  allPhases: "All steps",
  gateNotRun: "not run",
  fixesNone: "Fixes start after a bug is reproduced.",
  planNotReady: "The plan appears here after discovery and design.",
  findingsNone: "Findings appear here after the controlled execution.",
} as const;

export const ABOUT = {
  title: "How TimeWraith works",
  lead: "TimeWraith is a Kiro Crew agent team for date-sensitive code. Kiro agents propose; plain code checks every proposal; nothing is called a bug until it reproduces, and nothing is called a fix until it passes eight gates.",
  lostHourTitle: "The lost hour",
  lostHourText:
    "On a daylight-saving night the clock jumps from 01:59 to 03:00, or repeats an hour. Code that adds 24 hours, compares local dates or schedules the next run often breaks right there, and only for users in some time zones.",
  flowTitle: "The six steps",
  crewTitle: "The Crew",
  crewLead: "Each mascot owns one job in the flow. Kiro agents judge; system components are plain code.",
  ladderTitle: "How strong is the evidence",
} as const;
