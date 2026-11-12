/**
 * Open_Case_Form copy. Field errors live with their rules in `cases/form/validate.ts`; the draft labels and the
 * announcements are in `copy.ts`.
 */
export const FORM_LABELS = {
  repoUrl: "GitHub repository URL",
  version: "Version, tag or commit",
  area: "Date-sensitive area (optional)",
  mode: "Case mode",
  issueUrl: "Public issue URL",
  auto: "Run without stopping for plan approval",
} as const;

export const FORM_HINTS = {
  repoUrl: "A public repository, for example https://github.com/owner/repo",
  version: "Branch (main), tag (v1.2.3) or full commit hash. If a branch is not found, the case tells you the default one.",
  area: "For example: week view around midnight in Pacific/Honolulu. Up to 200 characters.",
  issueUrl: "A GitHub issue of the same repository, ending in its number",
  issueUrlBlind: "The Crew does not see this issue until the reveal",
  auto: "Off: the Crew stops after designing the experiments and waits for you. Fixes always wait for you.",
} as const;

export const FORM_SUBMIT = "Open the case";
export const FORM_SUMMARY_HEADING = "Check these fields";
export const FORM_LIMIT_REACHED =
  "This browser already holds 20 drafts, the most it keeps. Remove a draft on the Cases page to open another.";
/** Shown under the button: what submitting does right now. */
export const FORM_NOTE_ONLINE = "Starts a real investigation on the TimeWraith backend.";
export const FORM_NOTE_OFFLINE = "Backend offline: the case is saved as a draft in this browser. Run it when the backend is back.";
