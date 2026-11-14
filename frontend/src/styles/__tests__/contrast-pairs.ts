/**
 * Violet Midnight token contrast table, one row per pair, with role and size.
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

const decoration = (fg: string, bg: string, ratio: number, use: string): ContrastPair => ({
  fg,
  bg,
  ratio,
  role: "decoration",
  use,
});

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  text("ink-50", "night-950", 17.86, "primary text on midnight surface"),
  text("ink-300", "night-950", 9.55, "muted text on midnight surface"),
  text("violet-300", "night-950", 9.38, "accent text and focus ring on midnight surface"),
  text("violet-200", "night-950", 13.57, "bright accent and code text on midnight surface"),
  text("mint-300", "night-950", 13.34, "success status text on midnight surface"),
  text("rose-300", "night-950", 12.93, "error status text on midnight surface"),
  text("amber-300", "night-950", 13.6, "warning status text on midnight surface"),

  text("ink-50", "night-900", 16.91, "primary text on midnight panel"),
  text("ink-300", "night-900", 9.04, "muted text on midnight panel"),
  text("violet-300", "night-900", 8.88, "accent text and focus ring on midnight panel"),
  text("violet-200", "night-900", 12.85, "bright accent and code text on midnight panel"),
  text("mint-300", "night-900", 12.63, "success status text on midnight panel"),
  text("rose-300", "night-900", 12.24, "error status text on midnight panel"),
  text("amber-300", "night-900", 12.87, "warning status text on midnight panel"),

  text("ink-50", "night-850", 15.83, "primary text on elevated surface"),
  text("ink-300", "night-850", 8.46, "muted text on elevated surface"),
  text("violet-300", "night-850", 8.31, "accent text on elevated surface"),
  text("violet-200", "night-850", 12.02, "bright accent on elevated surface"),
  text("mint-300", "night-850", 11.82, "diff add text on elevated surface"),
  text("rose-300", "night-850", 11.45, "diff remove text on elevated surface"),
  text("amber-300", "night-850", 12.05, "warning text on elevated surface"),

  text("night-900", "violet-300", 8.88, "primary CTA button label and active chip"),
  text("night-900", "violet-200", 12.85, "primary CTA button hover label"),
  text("night-900", "mint-300", 12.63, "done/pass mark glyph"),
  text("night-900", "rose-300", 12.24, "failed/error mark glyph"),
  text("night-900", "amber-300", 12.87, "waiting mark glyph"),

  decoration("line-700", "night-950", 1.56, "decorative rules and panel outlines only"),
  decoration("line-700", "night-900", 1.47, "decorative rules only"),
  decoration("line-700", "night-850", 1.38, "decorative rules only"),
];

/** Minimum ratio for a pair used the way its role says. Decoration has no minimum. */
export function requiredRatio(pair: Pick<ContrastPair, "role" | "size">): number {
  if (pair.role === "decoration") return 0;
  if (pair.role === "boundary") return 3;
  return pair.size === "large" ? 3 : 4.5;
}
