/**
 * Case_Mode labels and one-line descriptions (design: Open-a-case panel and form, Requirement 19).
 * The form's mode radio group and the Case_Card mode tag read these; the shape gives each mode a non-color cue.
 */
export const CASE_MODE_IDS = ["known-issue", "blind-hunt", "open-hunt"] as const;
export type CaseModeId = (typeof CASE_MODE_IDS)[number];

export interface CaseModeDef {
  readonly id: CaseModeId;
  readonly label: string;
  readonly description: string;
  /** Mode tag shape: Known issue = open book, Blind hunt = blindfold band, Open hunt = lantern. */
  readonly shape: "book" | "blindfold" | "lantern";
  /** True when the mode asks for a public issue URL. */
  readonly needsIssue: boolean;
}

export const CASE_MODES: readonly CaseModeDef[] = [
  {
    id: "known-issue",
    label: "Known issue",
    description: "You give the Crew a public issue; it reproduces it on your pinned version.",
    shape: "book",
    needsIssue: true,
  },
  {
    id: "blind-hunt",
    label: "Blind hunt",
    description: "You give an issue, but the Crew only sees the target and area until the reveal.",
    shape: "blindfold",
    needsIssue: true,
  },
  {
    id: "open-hunt",
    label: "Open hunt",
    description: "No issue. The Crew explores the area you name.",
    shape: "lantern",
    needsIssue: false,
  },
];

export const CASE_MODE_BY_ID: Readonly<Record<CaseModeId, CaseModeDef>> = Object.fromEntries(
  CASE_MODES.map((m) => [m.id, m]),
) as Record<CaseModeId, CaseModeDef>;

/** The form's default mode. */
export const DEFAULT_CASE_MODE: CaseModeId = "known-issue";
