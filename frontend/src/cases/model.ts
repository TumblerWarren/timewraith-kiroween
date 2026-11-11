import type { CaseModeId } from "../content/modes";
import type { EvidenceStatus, ReplayEvent } from "../data/types";

/**
 * Case models (design: Case models; Requirements 19.1, 20.2, 22.3, 24.1, 25.1).
 * A Case is either one of the two bundled Sample_Cases or a Draft_Case the visitor created in this browser.
 */
export type CaseMode = CaseModeId;

export type TargetVersion = { readonly kind: "commit" | "ref"; readonly value: string };

export type Target =
  | { readonly kind: "repository"; readonly repoUrl: string; readonly version: TargetVersion }
  | { readonly kind: "local-app"; readonly appUrl: string };

export type VersionRole = "affected" | "fixed" | "patched" | "under-test";
export type VersionResult = "fails" | "passes" | "not-run" | "inconclusive";

export interface VersionEntry {
  /** "fc-6.1.10", "cal-affected", "draft". */
  readonly id: string;
  /** Shown in mono: "@fullcalendar/core 6.1.10". */
  readonly label: string;
  readonly role: VersionRole;
  readonly source: "public-report" | "published-release" | "illustrative-pin" | "user-input";
  readonly result: VersionResult;
  readonly includesSuggestedFix: boolean;
}

export interface DiffLine {
  readonly type: "add" | "remove" | "context";
  readonly text: string;
}

export interface SuggestedFix {
  readonly author: "doctor-stitch";
  /** One sentence. */
  readonly summary: string;
  /** At most 12 lines. */
  readonly change: { readonly file: string; readonly lines: readonly DiffLine[] };
  /** At most 16 lines. */
  readonly regressionTest: { readonly file: string; readonly lines: readonly DiffLine[] };
  /** True => "Illustrative diff". */
  readonly illustrative: boolean;
  readonly upstream: {
    readonly kind: "merged-change" | "described-in-report";
    readonly label: string;
    readonly href: string;
    readonly reportedResult?: string;
  } | null;
}

interface CaseBase {
  readonly id: string;
  readonly mode: CaseMode;
  readonly target: Target;
  readonly area?: string;
}

/** The five Version_Timeline milestones, in fixed order (design D21; Requirement 28.1). */
export const MILESTONE_ORDER = ["released", "reported", "reproduced", "fix-suggested", "fixed-verified"] as const;
export type MilestoneKind = (typeof MILESTONE_ORDER)[number];
/** History milestones are facts about the project; replay milestones point at a replay event. */
export const HISTORY_KINDS: readonly MilestoneKind[] = ["released", "reported"];
export type MilestoneState = "reached" | "ahead" | "not-run" | "hidden";

export interface VersionMilestone {
  readonly kind: MilestoneKind;
  /** "@fullcalendar/core 6.1.10 released". */
  readonly label: string;
  /** Entry in `versions`; null only for an unrun fixed-version milestone. */
  readonly versionId: string | null;
  /** History kinds only: a real date with the record it comes from. */
  readonly date: { readonly value: string; readonly source: "published-release" | "issue-tracker"; readonly href: string } | null;
  /** Replay kinds only: the event that reaches the milestone. */
  readonly eventId: string | null;
  /** True => shown as "illustrative pin", and `date` must be null. */
  readonly illustrativePin: boolean;
  readonly notRunText?: "Fixed-version check not run";
}

export interface SampleCase extends CaseBase {
  readonly kind: "sample";
  /** Shown after the reveal for a Blind hunt. */
  readonly title: string;
  /** Blind hunt title before the reveal (target-based). */
  readonly hiddenTitle?: string;
  readonly issue: { readonly href: string; readonly label: string; readonly source: "third-party-report" };
  /** "Sample replay (illustrative data), not a real finding" | "Illustrative replay modelled on ...". */
  readonly sampleLabel: string;
  readonly replayModeLabel: "Recorded replay" | "Illustrative replay";
  /** Check order; also feeds the Version_History_Strip. */
  readonly versions: readonly VersionEntry[];
  readonly stream: readonly ReplayEvent[];
  /** Required when the mode is blind-hunt. */
  readonly reveal?: { readonly eventId: string; readonly outcome: "match" | "no-match" };
  /** TimeControlNote text. */
  readonly timeControl: string;
  readonly fix: SuggestedFix;
  /** Exactly five milestones, in `MILESTONE_ORDER` (D21). */
  readonly timeline: readonly VersionMilestone[];
}

export interface DraftCase extends CaseBase {
  readonly kind: "draft";
  /** ISO-8601. */
  readonly createdAt: string;
  /** Absent for open-hunt. */
  readonly issueUrl?: string;
  /** False when localStorage failed (kept for this visit only). */
  readonly saved: boolean;
}

export type Case = SampleCase | DraftCase;

export type CaseStatus = EvidenceStatus | "draft-not-run";

export const caseStatus = (c: Case): CaseStatus =>
  c.kind === "draft" ? "draft-not-run" : (c.stream[c.stream.length - 1]?.status ?? "planned");

/** The title a visitor may see now: the target-based one for a Blind hunt sample (cards never reveal). */
export const visibleTitle = (c: Case, revealed = false): string => {
  if (c.kind === "draft") return draftTitle(c);
  return c.mode === "blind-hunt" && !revealed && c.hiddenTitle ? c.hiddenTitle : c.title;
};

/** Target in one mono line: "owner/repo @ ref" or the local app URL. */
export function targetLine(target: Target): string {
  if (target.kind === "local-app") return target.appUrl;
  return `${repoSlug(target.repoUrl)} @ ${target.version.value}`;
}

/** "github.com/owner/repo" without the scheme and a ".git" suffix; "owner/repo" for GitHub. */
export function repoSlug(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    const path = u.pathname.replace(/\/+$/, "").replace(/\.git$/, "").replace(/^\//, "");
    return u.hostname === "github.com" ? path : `${u.hostname}/${path}`;
  } catch {
    return repoUrl;
  }
}

/** A draft's title: the target and, when given, the area. Rendered as text only. */
export function draftTitle(d: DraftCase): string {
  const where = d.target.kind === "local-app" ? d.target.appUrl : repoSlug(d.target.repoUrl);
  return d.area ? `${where}: ${d.area}` : where;
}

/** A draft's single version entry: what the visitor entered, never run (Requirement 25.3). */
export function draftVersions(d: DraftCase): readonly VersionEntry[] {
  return [
    {
      id: "draft",
      label: d.target.kind === "local-app" ? d.target.appUrl : d.target.version.value,
      role: "under-test",
      source: "user-input",
      result: "not-run",
      includesSuggestedFix: false,
    },
  ];
}

export const caseVersions = (c: Case): readonly VersionEntry[] => (c.kind === "draft" ? draftVersions(c) : c.versions);
