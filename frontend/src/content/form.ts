/**
 * Open_Case_Form copy (design: Open-a-case panel and form; Requirements 19, 20). Field errors live with their rules
 * in `cases/form/validate.ts`; the draft note, "Not contacted in demo mode" and the announcement are in `copy.ts`.
 */
export const FORM_LABELS = {
  targetType: "Target type",
  targetRepository: "Git repository",
  targetLocal: "Local app",
  repoUrl: "Repository URL",
  version: "Version, tag or commit",
  appUrl: "Local app URL",
  area: "Date-sensitive area (optional)",
  mode: "Case mode",
  issueUrl: "Public issue URL",
} as const;

export const FORM_HINTS = {
  repoUrl: "A public https address, for example https://github.com/owner/repo",
  version: "Tag (v6.1.10), branch or commit hash",
  appUrl: "For example http://localhost:3000",
  area: "For example: week view around midnight in Pacific/Honolulu. Up to 200 characters.",
  issueUrl: "The address of the issue, ending in its number",
  issueUrlBlind: "The Crew does not see this issue until the reveal",
} as const;

export const FORM_SUBMIT = "Open the case";
export const FORM_SUMMARY_HEADING = "Check these fields";
export const FORM_LIMIT_REACHED =
  "This browser already holds 20 drafts, the most it keeps. Remove a draft in the Case library to open another.";
