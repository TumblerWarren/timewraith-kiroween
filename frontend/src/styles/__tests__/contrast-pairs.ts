/**
 * The design's "Token contrast table" (design.md), one row per pair, with role and size.
 * The property test in contrast.test.ts reads this table and checks it against the real colors in tokens.css.
 *
 * role:
 *   text        the foreground may carry text on that background
 *   boundary    shapes and interface boundaries (3:1 for components)
 *   decoration  decoration only: never text, never an interactive boundary
 * size (only meaningful for role "text"):
 *   normal      body text, needs 4.5:1
 *   large       large text only (18.66 px bold or larger), needs 3:1
 */

export type PairRole = "text" | "boundary" | "decoration";
export type PairSize = "normal" | "large";

export interface ContrastPair {
  fg: string;
  bg: string;
  /** Ratio printed in the design table (WCAG formula, two decimals). */
  ratio: number;
  role: PairRole;
  /** Present for role "text". */
  size?: PairSize;
  use: string;
}

const text = (fg: string, bg: string, ratio: number, use: string, size: PairSize = "normal"): ContrastPair => ({
  fg,
  bg,
  ratio,
  role: "text",
  size,
  use,
});
const boundary = (fg: string, bg: string, ratio: number, use: string): ContrastPair => ({ fg, bg, ratio, role: "boundary", use });
const decoration = (fg: string, bg: string, ratio: number, use: string): ContrastPair => ({ fg, bg, ratio, role: "decoration", use });

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  text("paper-100", "tower-950", 13.62, "all text (night)"),
  text("moon-200", "tower-950", 11.09, "muted text (night)"),
  text("mist-300", "tower-950", 7.53, "captions (night)"),
  text("gold-500", "tower-950", 5.48, "small accents text and focus ring (night)"),
  text("paper-100", "walnut-700", 8.52, "all text (Crew)"),
  text("ink-900", "moon-200", 10.73, "all text (Flow)"),
  text("ink-900", "parchment-200", 11.52, "all text (day)"),
  text("ink-900", "paper-100", 13.17, "all text (CTA sheet, checklist)"),
  text("walnut-700", "paper-100", 8.52, "muted text"),
  text("walnut-700", "parchment-200", 7.45, "muted text"),
  text("sage-700", "paper-100", 5.17, "status text"),
  text("sage-700", "parchment-200", 4.53, "status text (no margin; not below 14 px regular)"),
  text("brick-700", "paper-100", 6.29, "status text"),
  text("brick-700", "parchment-200", 5.51, "status text"),
  text("paper-100", "sage-700", 5.17, "status chip label"),
  text("paper-100", "brick-700", 6.29, "status chip label"),
  text("ink-900", "pumpkin-600", 3.6, "large text only: CTA label, 18.66 px bold or larger, 2 px ink-900 border", "large"),
  boundary("pumpkin-600", "tower-950", 3.72, "shapes, boundaries, decoration only"),
  boundary("pumpkin-600", "paper-100", 3.66, "shapes, boundaries, decoration only"),
  boundary("pumpkin-600", "parchment-200", 3.2, "shapes, boundaries, decoration only"),
  boundary("gold-500", "walnut-700", 3.43, "trim and the ladder rail tip on walnut-700 (R2); never text or focus ring"),
  boundary("mist-300", "walnut-700", 4.71, "moonlit figure rim on walnut-700 (R2, computed); not in the design table, so never text"),
  decoration("divider-300", "paper-100", 1.52, "decorative rules only"),
  decoration("divider-300", "parchment-200", 1.33, "decorative rules only"),
  decoration("gold-500", "paper-100", 2.48, "decoration only, never text on light backgrounds"),
  decoration("gold-500", "parchment-200", 2.17, "decoration only, never text on light backgrounds"),
];

/** Minimum ratio for a pair used the way its role says. Decoration has no minimum. */
export function requiredRatio(pair: Pick<ContrastPair, "role" | "size">): number {
  if (pair.role === "decoration") return 0;
  if (pair.role === "boundary") return 3;
  return pair.size === "large" ? 3 : 4.5;
}
