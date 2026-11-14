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
  /** Resolved token names (e.g. "night-950") for each role. */
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

describe("contrast of Violet Midnight text pairs", () => {
  it("parses all twelve Violet Midnight palette colors from tokens.css", () => {
    expect(Object.keys(tokens).sort()).toEqual(
      [
        "night-1000",
        "night-950",
        "night-900",
        "night-850",
        "line-700",
        "ink-50",
        "ink-300",
        "violet-300",
        "violet-200",
        "mint-300",
        "rose-300",
        "amber-300",
      ].sort(),
    );
  });

  it("computes known WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("Property 14: every declared text pair meets 4.5:1 (normal) or 3:1 (large text, boundaries)", () => {
    const usable = CONTRAST_PAIRS.filter((p) => p.role !== "decoration");
    fc.assert(
      fc.property(fc.constantFrom(...usable), (pair) => {
        return ratioOf(pair.fg, pair.bg) >= requiredRatio(pair);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 14: the table ratios match the ratios computed from tokens.css within rounding", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CONTRAST_PAIRS), (pair) => {
        return Math.abs(ratioOf(pair.fg, pair.bg) - pair.ratio) <= 0.011;
      }),
      { numRuns: 100 },
    );
  });

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

  it("Property 14: decoration-only pairs stay below the 3:1 component threshold, so they cannot pass as boundaries", () => {
    for (const pair of CONTRAST_PAIRS.filter((p) => p.role === "decoration")) {
      expect(ratioOf(pair.fg, pair.bg), `${pair.fg} on ${pair.bg}`).toBeLessThan(3);
    }
  });

  it("negative case: disallowed pairs are detected as failing", () => {
    expect(textPairPasses(pairOf("line-700", "night-950"), "normal")).toBe(false);
    expect(textPairPasses(pairOf("line-700", "night-900"), "normal")).toBe(false);
    expect(ratioOf("line-700", "night-950")).toBeLessThan(3);
  });

  describe("surface themes in layout.css and tokens.css", () => {
    const themes = [
      ...parseThemes(readCss("tokens.css")).map((t) => ({ ...t, selector: `tokens.css ${t.selector}` })),
      ...parseThemes(readCss("layout.css")).map((t) => ({ ...t, selector: `layout.css ${t.selector}` })),
    ];

    it("finds the default alias set and surface themes", () => {
      expect(themes.length).toBe(4);
      const bgs = new Set(themes.map((t) => t.bg));
      for (const bg of ["night-950", "night-900", "night-850"]) expect(bgs.has(bg)).toBe(true);
    });

    it("Property 14: --fg and --fg-muted on --bg are allowed text pairs with at least 4.5:1", () => {
      fc.assert(
        fc.property(fc.constantFrom(...themes), fc.constantFrom<"fg" | "fgMuted">("fg", "fgMuted"), (theme, key) => {
          const fg = theme[key];
          return textPairPasses(pairOf(fg, theme.bg), "normal");
        }),
        { numRuns: 100 },
      );
    });

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

    it("never uses line-700 or midnight-line as a text color", () => {
      for (const { name, css } of files) {
        const bad = [...css.matchAll(/(?<![-\w])color\s*:\s*var\(--(line-700|midnight-line)\)/g)].map((m) => m[0]);
        expect(bad, name).toEqual([]);
      }
    });
  });
});
