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
  startLogin: "Sign in with Builder ID",
  signInGoogle: "Sign in with Google",
  signInGitHub: "Sign in with GitHub",
  methodHint:
    "Pick the account whose Kiro credits the agents should use. A Google, GitHub or Builder ID sign-in can be a different Kiro account, even with the same email.",
  retryLead: "Sign-in did not finish. Choose a method to try again:",
  logout: "Sign out of Kiro",
  switchAccount: "Switch account",
  otherAccountHint: "To use a different Google or GitHub account, choose Use another account on the sign-in page, or open the link in a private window.",
  logoutConfirm: "Sign out",
  logoutCancel: "Keep signed in",
  logoutWarn:
    "Signing out stops real Kiro agent calls. Investigations that are running lose their agents, and new ones use the stub runtime until you sign in again.",
  signedInAs: "Signed in as",
  openSignIn: "Open the sign-in page",
  pulling: "downloading the image (a few minutes the first time)",
  codeLabel: "Sign-in code",
  deviceLead: "Approve this code on the sign-in page.",
  deviceWait: "Waiting for you to approve. This board updates on its own.",
  cancelLogin: "Cancel sign-in",
  cancelHint: "If the sign-in page shows an error, such as an AWS Builder ID error, cancel and sign in again, or pick another method.",
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

export const FIX_SHARING = {
  branch: "Fix branch",
  branchHelp: "A local copy of the repository with one commit. Nothing is pushed.",
  branchName: "Branch",
  commit: "Commit",
  folder: "Folder",
  dockerFolder: "Folder inside the TimeWraith container",
  files: "Files changed",
  log: "Inspect the commit",
  dockerLog: "Inspect the commit inside the container",
  copy: "Copy",
  copyLabel: (label: string) => `Copy ${label}`,
  copied: "Copied",
  copyError: "Could not copy. Select the text to copy it manually.",
  download: "Download patch (git am)",
  originalPatch: "Download the verified patch",
  remake: "Make the branch again",
  remaking: "Making the branch…",
  share: "Share this fix",
  preview: "GitHub preview",
  loading: "Loading GitHub preview…",
  retry: "Refresh preview",
  original: "Original repository",
  fork: "Your fork",
  waitingFork: "Unavailable",
  connect: "Connect GitHub on the Crew page",
  duplicates: "An existing pull request may already cover this fix.",
  readDuplicates: "I read the existing PRs",
  prNumber: (number: number) => `Pull request #${number}`,
  steps: ["Fork and push", "Pull request", "Done"],
  waiting: "Waiting",
  ready: "Ready",
  complete: "Complete",
  pushed: (fork: string) => `Pushed to ${fork}`,
  prOpened: "Pull request opened",
  success: "Shared on GitHub",
  push: "Push to my fork",
  pushing: "Pushing to your fork…",
  pullRequest: "Open pull request",
  opening: "Opening pull request…",
  update: "Update pull request",
  updating: "Updating pull request…",
  updateCount: "Follow-up commits",
  updatedAt: "Last updated",
  confirmPush: (branch: string, fork: string) => `Pushes ${branch} to github.com/${fork}. Nothing is sent to the original repository.`,
  confirmPr: (upstream: string) => `Opens a public pull request on ${upstream}.`,
  confirmUpdate: (branch: string, upstream: string, number: number | null) =>
    `Adds a commit from ${branch} to the open pull request${number === null ? "" : ` #${number}`} on ${upstream} and updates its title and description.`,
  acknowledgement: "I confirm this branch and destination.",
  confirm: "Confirm",
  cancel: "Cancel",
  title: "Pull request title",
  description: "Pull request description",
  result: "View pull request",
  errors: {
    github_not_connected: "Connect GitHub on the Crew page first.",
    github_not_running: "Start the GitHub container on the Crew page.",
    confirm_mismatch: "The branch changed. Refresh the preview and confirm the branch again.",
    fix_not_accepted: "Accept the verified fix before sharing it.",
    branch_missing: "Make the local fix branch again before sharing it.",
    branch_not_allowed: "TimeWraith can only publish a fix branch it created.",
    already_published: "This fix branch is already published.",
    not_your_fork: "The destination must be a fork of the original repository that you own.",
    push_failed: "The push to your fork did not finish. Check the preview before trying again.",
    not_pushed: "Push the branch to your fork before opening a pull request.",
    invalid_title: "Enter a title for the pull request.",
    pr_exists: "A pull request already exists for this branch.",
    pr_failed: "GitHub could not open the pull request. Check the preview before trying again.",
    busy: "Another operation is running on this case. Try again when it finishes.",
    docker_not_running: "Start Docker on the Crew page first.",
    invalid_repo: "This case does not point to a valid GitHub repository.",
    github_logout_failed: "TimeWraith could not disconnect GitHub. Check that its container is running and try again.",
    branch_failed: "TimeWraith could not create the local fix branch. Check that the case workspace is available and try again.",
    not_prepared: "Check the fix against the repository's rules before sharing it.",
    checks_failed: "The fix failed one or more repository checks. Review the check results before sharing.",
    repo_archived: "This repository is archived and cannot receive pull requests.",
    duplicate_exists: "GitHub found existing pull requests for this bug. Read them and confirm before continuing.",
    already_fixed_upstream: "This bug is already fixed on the repository's default branch.",
    rebase_conflict: "The fix could not be applied to the latest code on the repository's default branch.",
    contribution_failed: "TimeWraith could not check the fix against the repository's rules. Try again.",
    fork_changed: "The branch on your fork has commits TimeWraith did not push. Review the branch on GitHub before trying again.",
    pr_closed: "This pull request was closed on GitHub. Reopen it before sending another commit.",
    pr_merged: "This pull request has already been merged. It can no longer receive updates.",
    nothing_to_update: "There is no prepared update to send. Refresh the preview to see the current patch status.",
    update_failed: "GitHub could not finish updating the pull request. Refresh the preview before trying again.",
  },
} as const;

export const CONTRIBUTION = {
  check: "Check against the repository's rules",
  recheck: "Recheck the repository's rules",
  checking: "Checking against the repository's rules…",
  busyHelp: "This usually takes about a minute.",
  checks: "Repository checks",
  passed: "Passed",
  failed: "Failed",
  preexisting: "Pre-existing failure",
  noChecks: "No check results were reported.",
  notes: "Preparation notes",
  rules: "Repository rules",
  warnings: "Contribution warnings",
  defaultBranch: "Default branch",
  base: "Base commit",
  guide: "Contribution guide",
  template: "Pull request template",
  testDirectory: "Test directory",
  testPattern: "Test filename pattern",
  test: "Regression test",
  scripts: "Check scripts",
  archived: "Archived repository",
  conventional: "Uses Conventional Commits",
  dco: "Requires a Developer Certificate of Origin (DCO)",
  cla: "Requires a Contributor License Agreement (CLA)",
  aiPolicy: "Policy on AI-generated contributions",
  rebased: "The fix was reapplied to the latest default branch.",
} as const;

export const GITHUB_SETUP = {
  title: "GitHub (optional)",
  help: "Runs in Docker. The token stays in its own container and is never shown to the Kiro agents. Access: your public repositories.",
  building: "Building…",
  blocked: "Start Docker to set up GitHub.",
  start: "Set up GitHub container",
  connect: "Connect GitHub",
  waiting: "Approve this code on GitHub.",
  code: "GitHub sign-in code",
  open: "Open GitHub",
  cancel: "Cancel GitHub sign-in",
  connectedAs: (user: string) => `Connected as @${user}`,
  connected: "Connected",
  disconnect: "Disconnect GitHub",
  disconnectWarning: "Disconnect this GitHub account from TimeWraith?",
  keep: "Keep connected",
} as const;

export const DOCKER_SETUP = {
  running: "Docker: running",
  recreate: "In Docker mode, starting the Crew again recreates it on the Compose network.",
} as const;

export const CASE_LIVE = {
  now: "Now",
  live: "Live",
  waiting: "Waiting for the next Crew update.",
  progress: (calls: number, max: number) => `${calls} of ${max} tool calls`,
  tools: (count: number) => `${count} tool ${count === 1 ? "call" : "calls"}`,
  checkingTitle: "Observed anomalies",
  checking: "Checking…",
  intended: "Intended",
  reproduced: "Reproduced",
  notReported: "Not reported",
  checkedAt: (local: string, zone: string) => `${local} in ${zone}`,
  accountTitle: "Kiro needs attention",
  reviewSetup: "Open Crew setup",
} as const;

/** Case additions read stored investigation data; none of these labels imply new evidence. */
export const CASE_ADDITIONS = {
  coverage: {
    title: "Coverage",
    tableLabel: "Experiment coverage",
    unit: "Unit",
    status: "Status",
    rules: "Rules checked",
    edges: "Edges hit",
    outcome: "Outcome",
    none: "None recorded",
    summary: (tested: number, total: number, violations: number) => `${tested} of ${total} candidates tested · ${violations} with violations`,
    statusLabels: { not_selected: "Not selected", not_designed: "Not designed", adapter_invalid: "Adapter failed", clean: "Clean", violations: "Violations" },
  },
  planner: {
    title: "Planner rounds",
    round: (round: number) => `Round ${round}`,
    reason: "Reason",
    statusLabels: { queued: "Queued", designed: "Designed", swept: "Tested", rejected: "Rejected" },
  },
  reproduction: {
    title: "How it was reproduced",
    code: "Reproduction code",
    failing: "Failing point",
    control: "Control point",
    publicApi: "Through the public API",
    userCheck: "Public API check code",
    userFailing: "Public API failing point",
  },
  retest: {
    title: "Retest this bug",
    ref: "Revision to test",
    placeholder: "master, a commit SHA, or pull/453",
    submit: "Retest",
    busy: "Retesting…",
    waiting: "Fetching the revision and running the regression test three times. This usually takes 1–3 minutes.",
    help: "Reruns this bug's regression test on another revision of the repository. Nothing is pushed.",
    history: "Retest history",
    details: "Read full retest details",
    done: "Retest completed. Results updated.",
    outcome: { fixed: "Fixed", still_reproducible: "Still reproducible", cannot_confirm: "Cannot confirm" },
  },
  wrapUp: { prefix: "Wrap-up:", title: "Time budget: some steps were skipped" },
  decisionSteps: { plan_round: "Planner round", repair_adapter: "Adapter repair", install_repair: "Dependency install repair", baseline_check: "Baseline check" },
} as const;

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
