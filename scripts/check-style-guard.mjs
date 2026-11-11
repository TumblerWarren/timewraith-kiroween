// Banned-style guard for frontend/src/**/*.{css,tsx} (Requirements 12.7, 12.11, 11.9).
//
//   node scripts/check-style-guard.mjs [--all] [--from-hook] [--root <dir>] [file ...]
//
// --all        scan every css/tsx file under frontend/src (default when no files are given)
// --from-hook  read the hook event on STDIN and scan only the saved file
// Exit 0: clean, or frontend/src does not exist yet. Exit 2: violations (printed to stderr as
// `file:line rule message`). The scanning functions are exported for tests.
//
// Known limits: nested rounded cards are detected in CSS selectors (nesting and descendant
// combinators), not in JSX structure. Pill and circle radii (>= 999px or 50%) are not cards.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eventPath, readEvent } from "./hooks/read-event.mjs";

export const RULES = {
  "backdrop-filter": "backdrop-filter (glassmorphism) is banned",
  "blurred-box-shadow": "box-shadow with a blur radius above 0 is banned",
  "text-shadow-glow": "text-shadow with a blur radius above 0 (glow) is banned",
  "drop-shadow-blur": "drop-shadow with a blur radius above 0 is banned",
  "radial-conic-gradient": "radial-gradient and conic-gradient are banned",
  "purple-cyan-gradient": "purple, magenta, cyan or neon gradients are banned",
  "stray-color-literal": "color literals (hex, rgb, hsl, oklch ...) are allowed only in tokens.css; use a token",
  "pumpkin-600-text": "pumpkin-600 may not be a text color (large text only, mark with /* allow-pumpkin-large */)",
  "nested-rounded-card": "rounded card nested inside another rounded card",
  "uppercase-label":
    "text-transform: uppercase is banned (no uppercase micro-labels; write sentence case, or mark the line with /* allow-uppercase */)",
};

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOW_PUMPKIN = "allow-pumpkin-large";
const ALLOW_UPPERCASE = "/* allow-uppercase */";

// ---------------------------------------------------------------- text utilities

const blankKeepNewlines = (s) => s.replace(/[^\n]/g, " ");

/** Replace comments with spaces so offsets and line numbers stay valid. */
function stripComments(text, isTsx) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blankKeepNewlines);
  if (isTsx) out = out.replace(/(^|[^:\\])(\/\/.*$)/gm, (_, pre, c) => pre + blankKeepNewlines(c));
  return out;
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Text inside the parentheses that open at `openIndex` (the index of "("), or undefined. */
function readBalanced(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(openIndex + 1, i);
  }
  return undefined;
}

/** Remove every function call (innermost first), e.g. rgba(0 0 0 / .2) or var(--x). */
function stripFunctions(s) {
  let prev;
  let out = s;
  do {
    prev = out;
    out = out.replace(/[\w-]*\([^()]*\)/g, " ");
  } while (out !== prev);
  return out;
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z%]*)$/i;

/** True when any comma-separated shadow in `value` has a blur radius above 0. */
function shadowHasBlur(value) {
  const flat = stripFunctions(value);
  return flat.split(",").some((part) => {
    const lengths = part.trim().split(/\s+/).filter((t) => NUMBER.test(t));
    return lengths.length >= 3 && parseFloat(lengths[2]) > 0;
  });
}

/** Value of a property written in CSS (`prop: value;`) or inline in TSX (`prop: "value"`). */
function propertyValue(text, from, isTsx) {
  const rest = text.slice(from);
  if (isTsx) {
    const q = /^(?:"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`)/.exec(rest);
    if (q) return q[1] ?? q[2] ?? q[3];
    return /^[^;}\n]*/.exec(rest)[0];
  }
  return /^[^;}]*/.exec(rest)[0];
}

// ---------------------------------------------------------------- color helpers

function rgbToHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 25) return undefined; // greys carry no hue
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const inBand = (h) => (h >= 250 && h <= 330) || (h >= 165 && h <= 200);

function angleToDeg(value, unit) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return undefined;
  if (unit === "turn") return n * 360;
  if (unit === "rad") return (n * 180) / Math.PI;
  if (unit === "grad") return n * 0.9;
  return n;
}

const norm = (h) => ((h % 360) + 360) % 360;

/** Describe why a gradient's colors are purple or cyan, or return undefined. */
function gradientColorProblem(body) {
  const word = /\b(purple|violet|indigo|cyan|aqua|magenta|fuchsia|neon)\b/i.exec(body);
  if (word) return `uses "${word[1].toLowerCase()}"`;

  for (const m of body.matchAll(/\b(?:hsla?|hwb)\(\s*([-+]?[\d.]+)(deg|turn|rad|grad)?/gi)) {
    const h = angleToDeg(m[1], m[2]?.toLowerCase());
    if (h !== undefined && inBand(norm(h))) return `has hue ${Math.round(norm(h))}deg`;
  }
  for (const m of body.matchAll(/\b(?:oklch|lch)\(\s*[^\s,)]+[\s,]+[^\s,)]+[\s,]+([-+]?[\d.]+)(deg|turn|rad|grad)?/gi)) {
    const h = angleToDeg(m[1], m[2]?.toLowerCase());
    if (h !== undefined && inBand(norm(h))) return `has hue ${Math.round(norm(h))}deg`;
  }
  for (const m of body.matchAll(/\brgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) {
    const h = rgbToHue(+m[1], +m[2], +m[3]);
    if (h !== undefined && inBand(h)) return `has hue ${Math.round(h)}deg`;
  }
  for (const m of body.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) continue;
    const h = rgbToHue(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
    if (h !== undefined && inBand(h)) return `has hue ${Math.round(h)}deg`;
  }
  return undefined;
}

// ---------------------------------------------------------------- nested rounded cards (CSS)

/**
 * Tiny CSS parser with native nesting support. Returns rules with their declarations.
 * At-rules (@media, @supports, @layer ...) are transparent: their declarations and child rules
 * belong to the nearest enclosing style rule.
 */
function parseCss(text) {
  const rules = [];
  const stack = [];
  let buf = "";
  let bufLine = 1;
  let line = 1;
  let paren = 0;
  let quote = null;

  const nearestStyleRule = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].atRule) return stack[i];
    return null;
  };
  const addDeclaration = () => {
    const m = /^\s*(-{0,2}[\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(buf);
    const target = nearestStyleRule();
    if (m && target) target.decls.push({ prop: m[1].toLowerCase(), value: m[2], line: bufLine });
    buf = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") line++;
    if (buf.trim() === "" && !/\s/.test(ch)) bufLine = line;
    if (quote) {
      buf += ch;
      if (ch === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);

    if (paren === 0 && ch === "{") {
      const selector = buf.trim();
      const atRule = selector.startsWith("@");
      const skip = atRule ? /^@(?:-\w+-)?(?:keyframes|font-face|property)\b/i.test(selector) : false;
      const parent = nearestStyleRule();
      const rule = { selector, atRule, skip: skip || stack.some((r) => r.skip), parent, decls: [], line: bufLine };
      stack.push(rule);
      if (!atRule) rules.push(rule);
      buf = "";
    } else if (paren === 0 && ch === ";") {
      addDeclaration();
    } else if (paren === 0 && ch === "}") {
      addDeclaration();
      stack.pop();
    } else {
      buf += ch;
    }
  }
  return rules;
}

/** Split on a separator that is outside parentheses and brackets. */
function splitTopLevel(s, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function toCompound(text) {
  return {
    classes: new Set([...text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])),
    pseudoElement: /::|:(?:before|after)\b/.test(text),
    amp: text.includes("&"),
  };
}

function compoundsOf(item) {
  const cleaned = item.replace(/:(?:not|is|where|has)\([^()]*\)/g, "").trim();
  return cleaned.split(/\s*[>+~]\s*|\s+/).filter(Boolean).map(toCompound);
}

/** Every way a rule's selector can match, as lists of compounds from outermost to the element itself. */
function variantsOf(rule) {
  if (rule.variants) return rule.variants;
  const parentVariants = rule.parent ? variantsOf(rule.parent) : [[]];
  const out = [];
  for (const item of splitTopLevel(rule.selector, ",")) {
    const compounds = compoundsOf(item);
    if (compounds.length === 0) continue;
    for (const pv of parentVariants) {
      if (compounds[0].amp) {
        const base = pv.length > 0 ? pv[pv.length - 1] : { classes: new Set(), pseudoElement: false };
        const merged = {
          classes: new Set([...base.classes, ...compounds[0].classes]),
          pseudoElement: compounds[0].pseudoElement,
          amp: false,
        };
        out.push([...pv.slice(0, -1), merged, ...compounds.slice(1)]);
      } else {
        out.push([...pv, ...compounds]);
      }
    }
  }
  rule.variants = out;
  return out;
}

const CARD_PAINT = /^(?:background(?:-color|-image)?|border(?:-top|-right|-bottom|-left)?(?:-width|-color|-style)?|box-shadow)$/;

function isRoundedValue(value) {
  const v = value.trim().toLowerCase();
  if (/^(?:none|inherit|initial|unset|revert)$/.test(v)) return false;
  const lengths = [...v.matchAll(/(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh)?/g)];
  const hasVar = /var\(/.test(v);
  if (!hasVar && lengths.every((m) => parseFloat(m[1]) === 0)) return false;
  // Pills and circles are not cards.
  if (lengths.some((m) => (m[2] === "%" && parseFloat(m[1]) >= 50) || (m[2] !== "%" && parseFloat(m[1]) >= 999))) return false;
  return true;
}

function findNestedCards(css, add) {
  const rules = parseCss(css).filter((r) => !r.skip);
  const cards = [];
  for (const rule of rules) {
    const radius = rule.decls.find((d) => d.prop === "border-radius" && isRoundedValue(d.value));
    if (!radius) continue;
    if (!rule.decls.some((d) => CARD_PAINT.test(d.prop))) continue;
    cards.push({ rule, line: radius.line });
  }
  const cardClasses = new Set();
  for (const { rule } of cards) {
    for (const variant of variantsOf(rule)) {
      const last = variant[variant.length - 1];
      if (last && !last.pseudoElement) last.classes.forEach((c) => cardClasses.add(c));
    }
  }
  for (const { rule, line } of cards) {
    for (const variant of variantsOf(rule)) {
      const last = variant[variant.length - 1];
      if (!last || last.pseudoElement) continue;
      const ancestor = variant.slice(0, -1).find((c) => [...c.classes].some((k) => cardClasses.has(k)));
      if (ancestor) {
        const outer = [...ancestor.classes].filter((k) => cardClasses.has(k)).map((k) => `.${k}`).join("");
        const inner = [...last.classes].map((k) => `.${k}`).join("") || rule.selector;
        add(line, "nested-rounded-card", `${inner} has a rounded border-radius inside rounded card ${outer}`);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- scanning

/**
 * Scan one file's text. `file` decides the language (.css or .tsx) and the tokens.css exemption.
 * @returns {{ file: string, line: number, rule: string, message: string }[]} sorted by line.
 */
export function scanText(text, file) {
  const isTsx = /\.tsx$/i.test(file);
  const isTokens = path.basename(file).toLowerCase() === "tokens.css";
  const original = text.split(/\r?\n/);
  const code = stripComments(text.replace(/\r\n/g, "\n"), isTsx);
  const lineAt = lineIndex(code);
  const found = new Map();
  const add = (line, rule, message) => {
    const key = `${line}|${rule}`;
    if (!found.has(key)) found.set(key, { file, line, rule, message });
  };

  for (const m of code.matchAll(/backdrop-?filter/gi)) {
    add(lineAt(m.index), "backdrop-filter", RULES["backdrop-filter"]);
  }

  const shadowProps = [
    [/(?<![\w-])box-?shadow\s*:\s*/gi, "blurred-box-shadow"],
    [/(?<![\w-])text-?shadow\s*:\s*/gi, "text-shadow-glow"],
  ];
  for (const [re, rule] of shadowProps) {
    for (const m of code.matchAll(re)) {
      const value = propertyValue(code, m.index + m[0].length, isTsx);
      if (shadowHasBlur(value)) add(lineAt(m.index), rule, `${RULES[rule]} (${value.trim()})`);
    }
  }
  for (const m of code.matchAll(/drop-shadow\(/gi)) {
    const body = readBalanced(code, m.index + m[0].length - 1);
    if (body !== undefined && shadowHasBlur(body)) {
      add(lineAt(m.index), "drop-shadow-blur", `${RULES["drop-shadow-blur"]} (${body.trim()})`);
    }
  }

  for (const m of code.matchAll(/\b(?:repeating-)?(linear|radial|conic)-gradient\(/gi)) {
    const body = readBalanced(code, m.index + m[0].length - 1) ?? "";
    const line = lineAt(m.index);
    if (/^(?:radial|conic)$/i.test(m[1])) add(line, "radial-conic-gradient", RULES["radial-conic-gradient"]);
    const problem = gradientColorProblem(body);
    if (problem) add(line, "purple-cyan-gradient", `${RULES["purple-cyan-gradient"]} (gradient ${problem})`);
  }

  if (!isTokens) {
    const colorLiteral =
      /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/gi;
    for (const m of code.matchAll(colorLiteral)) {
      if (m[0].startsWith("#")) {
        const before = code.slice(Math.max(0, m.index - 24), m.index);
        if (/(?:href|xlinkHref|to|htmlFor|id|aria-[\w-]+|url\()\s*=?\s*["'{`(]*$/i.test(before)) continue; // anchors, not colors
      }
      add(lineAt(m.index), "stray-color-literal", `${RULES["stray-color-literal"]} (${m[0]})`);
    }
  }

  for (const m of code.matchAll(/(?<![\w-])color\s*:\s*([^;}\n]*)/gi)) {
    if (!/pumpkin-600/.test(m[1])) continue;
    const line = lineAt(m.index);
    if ((original[line - 1] ?? "").includes(ALLOW_PUMPKIN)) continue;
    add(line, "pumpkin-600-text", RULES["pumpkin-600-text"]);
  }

  // Uppercase micro-labels (visual revision R1): CSS `text-transform: uppercase` and TSX `textTransform: "uppercase"`.
  for (const m of code.matchAll(/(?<![\w-])(?:text-transform|textTransform)\s*:\s*["'`]?\s*uppercase\b/gi)) {
    const line = lineAt(m.index);
    if ((original[line - 1] ?? "").includes(ALLOW_UPPERCASE)) continue;
    add(line, "uppercase-label", RULES["uppercase-label"]);
  }

  if (!isTsx) findNestedCards(code, add);

  return [...found.values()].sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** Scan one file on disk. `displayName` is what appears in the report. */
export function scanFile(filePath, displayName = filePath) {
  return scanText(readFileSync(filePath, "utf8"), displayName);
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(?:css|tsx)$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

/**
 * Scan every css/tsx file under `<root>/frontend/src`, or only `files` when given.
 * @returns {{ skipped: boolean, files: string[], violations: object[] }}
 *   `skipped` is true when frontend/src does not exist yet.
 */
export function scanProject(root = DEFAULT_ROOT, files) {
  const srcDir = path.join(root, "frontend", "src");
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) return { skipped: true, files: [], violations: [] };
  const targets = files ?? collectFiles(srcDir);
  const violations = [];
  for (const file of targets) {
    const abs = path.resolve(root, file);
    if (!existsSync(abs)) continue;
    const rel = path.relative(root, abs).split(path.sep).join("/");
    violations.push(...scanFile(abs, rel));
  }
  return { skipped: false, files: targets, violations };
}

export function formatViolations(violations) {
  return violations.map((v) => `${v.file}:${v.line} ${v.rule} ${v.message}`).join("\n");
}

// ---------------------------------------------------------------- command line

async function cli(argv) {
  let root = DEFAULT_ROOT;
  let fromHook = false;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") root = path.resolve(argv[++i] ?? root);
    else if (a === "--from-hook") fromHook = true;
    else if (a === "--all") continue;
    else if (!a.startsWith("--")) files.push(a);
  }

  let targets = files.length > 0 ? files : undefined;
  if (fromHook) {
    const { json } = await readEvent();
    const saved = eventPath(json);
    if (saved) {
      if (!/\.(?:css|tsx)$/i.test(saved)) {
        console.log(`Style guard: ${saved} is not a css/tsx file; skipped.`);
        return 0;
      }
      targets = [saved];
    }
  }

  const result = scanProject(root, targets);
  if (result.skipped) {
    console.log("Style guard: frontend/src does not exist yet; skipped.");
    return 0;
  }
  if (result.violations.length > 0) {
    console.error(formatViolations(result.violations));
    console.error(`Style guard: ${result.violations.length} violation(s) in ${result.files.length} file(s).`);
    return 2;
  }
  console.log(`Style guard: ${result.files.length} file(s) clean.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`Style guard: unexpected error: ${e?.stack ?? e}`);
      process.exitCode = 1;
    },
  );
}
