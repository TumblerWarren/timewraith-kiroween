import type { InvestigationSummary } from "../api/types";
import type { CaseModeId } from "../content/modes";
import type { EvidenceStatus } from "../data/types";

/**
 * Case models. A Case is a Draft_Case kept in this browser or a Live_Case: a real investigation on the TimeWraith
 * backend. Targets are public GitHub repositories pinned to a ref. There is no bundled sample data.
 */
export type CaseMode = CaseModeId;

export type TargetVersion = { readonly kind: "commit" | "ref"; readonly value: string };

export type Target = { readonly kind: "repository"; readonly repoUrl: string; readonly version: TargetVersion };

export type VersionRole = "affected" | "fixed" | "patched" | "under-test";
export type VersionResult = "fails" | "passes" | "not-run" | "inconclusive";

export interface VersionEntry {
  readonly id: string;
  /** Shown in mono: a ref or a short commit. */
  readonly label: string;
  readonly role: VersionRole;
  readonly source: "user-input";
  readonly result: VersionResult;
  readonly includesSuggestedFix: boolean;
}

export interface DiffLine {
  readonly type: "add" | "remove" | "context";
  readonly text: string;
}

interface CaseBase {
  readonly id: string;
  readonly mode: CaseMode;
  readonly target: Target;
  readonly area?: string;
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

/** A real investigation on the backend; the full record is loaded by the Case view. */
export interface LiveCase extends CaseBase {
  readonly kind: "live";
  readonly summary: InvestigationSummary;
}

export type Case = DraftCase | LiveCase;

export type CaseStatus = EvidenceStatus | "draft-not-run";

export const caseStatus = (c: Case): CaseStatus => (c.kind === "draft" ? "draft-not-run" : c.summary.status);

/** The title of a case: its repository and, when given, the area. */
export const visibleTitle = (c: Case): string => (c.kind === "draft" ? draftTitle(c) : liveTitle(c));

/** Target in one mono line: "owner/repo @ ref". */
export function targetLine(target: Target): string {
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
  const where = repoSlug(d.target.repoUrl);
  return d.area ? `${where}: ${d.area}` : where;
}

export function liveTitle(c: LiveCase): string {
  const where = `${c.summary.target.owner}/${c.summary.target.repo}`;
  return c.area ? `${where}: ${c.area}` : where;
}

/** A draft's single version entry: what the visitor entered, never run. */
export function draftVersions(d: DraftCase): readonly VersionEntry[] {
  return [
    { id: "draft", label: d.target.version.value, role: "under-test", source: "user-input", result: "not-run", includesSuggestedFix: false },
  ];
}

/** A live case's revision under test, with its result once a bug is reproduced. */
export function liveVersions(c: LiveCase): readonly VersionEntry[] {
  const s = c.summary;
  const label = s.target.revision ? s.target.revision.slice(0, 12) : s.target.ref;
  // No bug never becomes "passes": the honest negative is "No anomaly observed in tested cases", shown in the view.
  const result: VersionResult = s.bug_count > 0 ? "fails" : "not-run";
  return [{ id: "live", label, role: s.bug_count > 0 ? "affected" : "under-test", source: "user-input", result, includesSuggestedFix: false }];
}

export function caseVersions(c: Case): readonly VersionEntry[] {
  return c.kind === "draft" ? draftVersions(c) : liveVersions(c);
}

/** A backend summary as a Live_Case. */
export function liveFromSummary(s: InvestigationSummary, area?: string | null): LiveCase {
  const commit = /^[0-9a-f]{40}$/.test(s.target.ref);
  return {
    kind: "live",
    id: s.id,
    mode: s.mode,
    target: { kind: "repository", repoUrl: `https://github.com/${s.target.owner}/${s.target.repo}`, version: { kind: commit ? "commit" : "ref", value: s.target.ref } },
    ...(area ? { area } : {}),
    summary: s,
  };
}
