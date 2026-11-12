/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CONTRAST_PAIRS, requiredRatio, type ContrastPair } from "./contrast-pairs";

// Vitest runs with css: false, so the stylesheets are read from disk.
const STYLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readCss = (rel: string) => readFileSync(path.join(STYLES_DIR, rel), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// ---------------------------------------------------------------- WCAG 2.x contrast

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex color: ${hex}`);
  const n = parseInt(m[1] as string, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------- stylesheet parsing

/** Color tokens from tokens.css: name without the leading dashes -> hex. */
function parseColorTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of stripComments(css).matchAll(/--([a-z]+-\d+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1] as string] = (m[2] as string).toLowerCase();
  }
  return out;
}

interface Theme {
  selector: string;
  /** Resolved token names (e.g. "paper-100") for each role. */
  bg: string;
  fg: string;
  fgMuted: string;
  edge: string;
  focus: string;
}

/** Every rule that declares --bg, --fg, --fg-muted, --edge and --focus-color, with var(--token) resolved to a token name. */
function parseThemes(css: string): Theme[] {
  const themes: Theme[] = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2] as string;
    const decl = (name: string): string | undefined => {
      const d = new RegExp(`(?:^|[;\\s])--${name}\\s*:\\s*var\\(--([a-z]+-\\d+)\\)`).exec(body);
      return d?.[1];
    };
    const [bg, fg, fgMuted, edge, focus] = [decl("bg"), decl("fg"), decl("fg-muted"), decl("edge"), decl("focus-color")];
    if (bg === undefined && fg === undefined) continue;
    const selector = (m[1] as string).replace(/\s+/g, " ").trim();
    if (bg === undefined || fg === undefined || fgMuted === undefined || edge === undefined || focus === undefined) {
      throw new Error(`theme ${selector} must declare --bg, --fg, --fg-muted, --edge and --focus-color as var(--token)`);
    }
    themes.push({ selector, bg, fg, fgMuted, edge, focus });
  }
  return themes;
}

function cssFilesUnder(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const child = path.join(dir, name);
    if (statSync(child).isDirectory()) files.push(...cssFilesUnder(child));
    else if (name.endsWith(".css")) files.push(child);
  }
  return files;
}

const tokens = parseColorTokens(readCss("tokens.css"));
const hexOf = (name: string): string => {
  const hex = tokens[name];
  if (!hex) throw new Error(`unknown color token ${name}`);
  return hex;
};
const ratioOf = (fg: string, bg: string): number => contrastRatio(hexOf(fg), hexOf(bg));
const pairOf = (fg: string, bg: string): ContrastPair | undefined => CONTRAST_PAIRS.find((p) => p.fg === fg && p.bg === bg);

/** A pair is acceptable when it is a declared text pair whose computed ratio meets its size threshold. */
function textPairPasses(pair: ContrastPair | undefined, size: "normal" | "large"): boolean {
  if (!pair || pair.role !== "text") return false;
  if (size === "normal" && pair.size === "large") return false;
  return ratioOf(pair.fg, pair.bg) >= requiredRatio({ role: "text", size });
}

// ---------------------------------------------------------------- tests

describe("contrast of text pairs", () => {
  it("parses all twelve palette colors from tokens.css", () => {
    expect(Object.keys(tokens).sort()).toEqual(
      [
        "tower-950",
        "ink-900",
        "walnut-700",
        "paper-100",
        "parchment-200",
        "divider-300",
        "pumpkin-600",
        "gold-500",
        "sage-700",
        "brick-700",
        "moon-200",
        "mist-300",
      ].sort(),
    );
  });

  it("computes known WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
  it("Property 14: every declared text pair meets 4.5:1 (normal) or 3:1 (large text, boundaries)", () => {
    const usable = CONTRAST_PAIRS.filter((p) => p.role !== "decoration");
    fc.assert(
      fc.property(fc.constantFrom(...usable), (pair) => {
        return ratioOf(pair.fg, pair.bg) >= requiredRatio(pair);
      }),
      { numRuns: 100 },
    );
  });

  /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
  it("Property 14: any pair with pumpkin-600 and role text has size large, and is exactly ink-900 on pumpkin-600", () => {
    const withPumpkin = CONTRAST_PAIRS.filter((p) => p.fg === "pumpkin-600" || p.bg === "pumpkin-600");
    expect(withPumpkin.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(fc.constantFrom(...withPumpkin), (pair) => {
        if (pair.role !== "text") return true;
        return pair.size === "large" && pair.fg === "ink-900" && pair.bg === "pumpkin-600";
      }),
      { numRuns: 100 },
    );
    // Never small text on paper-100 or parchment-200: pumpkin-600 has no text row on any light background.
    for (const bg of ["paper-100", "parchment-200"]) {
      expect(pairOf("pumpkin-600", bg)?.role).not.toBe("text");
    }
    // ink-900 on pumpkin-600 is below 4.5, which is exactly why it is large-only.
    expect(ratioOf("ink-900", "pumpkin-600")).toBeLessThan(4.5);
    expect(ratioOf("ink-900", "pumpkin-600")).toBeGreaterThanOrEqual(3);
  });

  /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
  it("Property 14: the table ratios match the ratios computed from tokens.css within rounding", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CONTRAST_PAIRS), (pair) => {
        return Math.abs(ratioOf(pair.fg, pair.bg) - pair.ratio) <= 0.011;
      }),
      { numRuns: 100 },
    );
  });

  /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
  it("Property 14: contrast is symmetric and between 1 and 21 for any two palette colors", () => {
    const names = Object.keys(tokens);
    fc.assert(
      fc.property(fc.constantFrom(...names), fc.constantFrom(...names), (a, b) => {
        const r = ratioOf(a, b);
        return Math.abs(r - ratioOf(b, a)) < 1e-9 && r >= 1 && r <= 21;
      }),
      { numRuns: 100 },
    );
  });

  /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
  it("Property 14: decoration-only pairs stay below the 3:1 component threshold, so they cannot pass as boundaries", () => {
    for (const pair of CONTRAST_PAIRS.filter((p) => p.role === "decoration")) {
      expect(ratioOf(pair.fg, pair.bg), `${pair.fg} on ${pair.bg}`).toBeLessThan(3);
    }
  });

  /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
  it("negative case: disallowed pairs are detected as failing", () => {
    // gold-500 text on paper-100 / parchment-200 is decoration only (2.48 / 2.17).
    expect(textPairPasses(pairOf("gold-500", "paper-100"), "normal")).toBe(false);
    expect(textPairPasses(pairOf("gold-500", "parchment-200"), "normal")).toBe(false);
    expect(ratioOf("gold-500", "paper-100")).toBeLessThan(3);
    // pumpkin-600 is never small text on light backgrounds, even though its boundary ratio is above 3.
    expect(textPairPasses(pairOf("pumpkin-600", "paper-100"), "normal")).toBe(false);
    expect(textPairPasses(pairOf("pumpkin-600", "parchment-200"), "large")).toBe(false);
    // ink-900 on pumpkin-600 passes only as large text.
    expect(textPairPasses(pairOf("ink-900", "pumpkin-600"), "large")).toBe(true);
    expect(textPairPasses(pairOf("ink-900", "pumpkin-600"), "normal")).toBe(false);
    // A pair that is not in the table at all is not allowed.
    expect(textPairPasses(pairOf("mist-300", "paper-100"), "normal")).toBe(false);
    // A made-up row with a bad ratio would be caught by the threshold check.
    expect(ratioOf("gold-500", "paper-100") >= requiredRatio({ role: "text", size: "normal" })).toBe(false);
  });

  describe("section themes in layout.css and tokens.css", () => {
    const themes = [
      ...parseThemes(readCss("tokens.css")).map((t) => ({ ...t, selector: `tokens.css ${t.selector}` })),
      ...parseThemes(readCss("layout.css")).map((t) => ({ ...t, selector: `layout.css ${t.selector}` })),
    ];

    it("finds the default alias set and all five section themes", () => {
      expect(themes.length).toBe(6);
      const bgs = new Set(themes.map((t) => t.bg));
      for (const bg of ["tower-950", "walnut-700", "moon-200", "parchment-200", "paper-100"]) expect(bgs.has(bg)).toBe(true);
    });

    /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
    it("Property 14: --fg and --fg-muted on --bg are allowed text pairs with at least 4.5:1", () => {
      fc.assert(
        fc.property(fc.constantFrom(...themes), fc.constantFrom<"fg" | "fgMuted">("fg", "fgMuted"), (theme, key) => {
          const fg = theme[key];
          return textPairPasses(pairOf(fg, theme.bg), "normal");
        }),
        { numRuns: 100 },
      );
    });

    /** Feature: timewraith, Property 14: Contrast of text pairs. **Validates: Requirements 11.8, 11.9, 15.6** */
    it("Property 14: --edge and --focus-color on --bg are allowed pairs with at least 3:1", () => {
      fc.assert(
        fc.property(fc.constantFrom(...themes), fc.constantFrom<"edge" | "focus">("edge", "focus"), (theme, key) => {
          const fg = theme[key];
          const pair = pairOf(fg, theme.bg);
          return pair !== undefined && pair.role !== "decoration" && ratioOf(fg, theme.bg) >= 3;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("text color usage across stylesheets", () => {
    const files = cssFilesUnder(STYLES_DIR).map((file) => ({
      name: path.relative(STYLES_DIR, file).split(path.sep).join("/"),
      css: stripComments(readFileSync(file, "utf8")),
    }));

    it("never uses pumpkin-600 or divider-300 as a text color", () => {
      for (const { name, css } of files) {
        const bad = [...css.matchAll(/(?<![-\w])color\s*:\s*var\(--(pumpkin-600|divider-300)\)/g)].map((m) => m[0]);
        expect(bad, name).toEqual([]);
      }
    });

    it("uses gold-500 as a text color only on the night shell (app.css, tower-950 ground)", () => {
      for (const { name, css } of files) {
        const uses = [...css.matchAll(/(?<![-\w])color\s*:\s*var\(--gold-500\)/g)];
        if (name !== "app.css") expect(uses.length, name).toBe(0);
      }
    });

    it("puts text on a pumpkin-600 background only for the primary CTA label (ink-900, large bold, ink border)", () => {
      for (const { name, css } of files) {
        for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          const body = m[2] as string;
          if (!/background(?:-color)?\s*:\s*var\(--pumpkin-600\)/.test(body)) continue;
          const color = /(?<![-\w])color\s*:\s*var\(--([a-z]+-\d+)\)/.exec(body);
          if (!color) continue; // a shape, not text
          const selector = (m[1] as string).trim();
          expect({ name, selector }).toEqual({ name: "base.css", selector: ".btn--primary" });
          expect(color[1]).toBe("ink-900");
          expect(body).toMatch(/font-size\s*:\s*var\(--text-cta\)/);
          expect(body).toMatch(/font-weight\s*:\s*(?:7|8|9)00/);
          expect(body).toMatch(/border\s*:\s*var\(--border-ink\)/);
        }
      }
      const tokensCss = readCss("tokens.css");
      // --text-cta is 1.25rem = 20px, above the 18.66px large bold threshold.
      expect(/--text-cta\s*:\s*1\.25rem/.test(tokensCss)).toBe(true);
      expect(1.25 * 16).toBeGreaterThanOrEqual(18.66);
    });
  });
});
