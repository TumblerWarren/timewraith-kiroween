import type { SampleCase, VersionEntry } from "../model";

/**
 * Suggested-fix labelling (design: "Suggested fix"; Requirements 24.4, 16.8; Property 32). The status line is
 * derived here and never stored as free text. It never produces the word "merged".
 */
export const NOT_VERIFIED = "Not verified";
export const verifiedOn = (label: string) => `Verified on ${label}`;

const isFixedRole = (v: VersionEntry | undefined) => v?.role === "fixed" || v?.role === "patched";

/**
 * Index of the first event whose check `passes` on a fixed or patched version after an earlier `fails` check on
 * an affected version, or -1. `requireSuggestedFix` also demands that the passing version includes the
 * suggested fix (the rule for calling Doctor Stitch's patch verified).
 */
export function fixedPassIndex(c: SampleCase, requireSuggestedFix = false): number {
  let failedOnAffected = false;
  for (let i = 0; i < c.stream.length; i++) {
    const check = c.stream[i]?.check;
    if (!check) continue;
    const v = c.versions.find((x) => x.id === check.versionId);
    if (check.result === "fails" && v?.role === "affected") failedOnAffected = true;
    if (check.result === "passes" && failedOnAffected && isFixedRole(v) && (!requireSuggestedFix || v?.includesSuggestedFix)) return i;
  }
  return -1;
}

/** True when the stream holds a passed Fixed_Version_Check (the climax, Requirement 22.6). */
export const hasFixedPass = (c: SampleCase): boolean => fixedPassIndex(c) >= 0;

/** "Verified on <version label>" only when a passing check ran on a version that includes the fix, else "Not verified". */
export function fixLabel(c: SampleCase): string {
  const i = fixedPassIndex(c, true);
  if (i < 0) return NOT_VERIFIED;
  const id = c.stream[i]?.check?.versionId;
  const v = c.versions.find((x) => x.id === id);
  return v ? verifiedOn(v.label) : NOT_VERIFIED;
}
