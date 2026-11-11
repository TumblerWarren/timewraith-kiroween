#!/usr/bin/env node
/**
 * Prints the seeded deckled-edge polygons used by src/styles/paper.css (visual revision R1).
 *
 *   node frontend/scripts/deckles.mjs
 *
 * Each polygon walks the four edges of a box. Every point sits on its edge, nudged inward by 0 to `depth` px
 * and slightly along the edge, so the paper reads torn rather than cut. Same seed, same polygon: paste the
 * output into paper.css when a variant changes. `ladder` keeps the two roller bars of the Evidence Ladder
 * (8px outside the sheet, 12px tall) inside the clip and deckles only the sheet's long sides.
 */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => String(Math.round(n * 10) / 10);

function edges(seed, depth, n, m) {
  const r = rng(seed);
  const j = () => f(r() * depth);
  const along = (i, count, spread) => f((i / count) * 100 + (i > 0 && i < count ? (r() - 0.5) * spread : 0));
  const top = [];
  const right = [];
  const bottom = [];
  const left = [];
  for (let i = 0; i <= n; i++) top.push(`${along(i, n, 4)}% ${j()}px`);
  for (let i = 1; i < m; i++) right.push(`calc(100% - ${j()}px) ${along(i, m, 6)}%`);
  for (let i = n; i >= 0; i--) bottom.push(`${along(i, n, 4)}% calc(100% - ${j()}px)`);
  for (let i = m - 1; i >= 1; i--) left.push(`${j()}px ${along(i, m, 6)}%`);
  return { top, right, bottom, left };
}

function deckle(seed, depth, n = 14, m = 8) {
  const e = edges(seed, depth, n, m);
  return `polygon(${[...e.top, ...e.right, ...e.bottom, ...e.left].join(", ")})`;
}

function ladder(seed, depth, m = 16) {
  const r = rng(seed);
  const j = () => f(r() * depth);
  const y = (i) => f((i / m) * 100 + (r() - 0.5) * 3);
  const right = [];
  const left = [];
  for (let i = 1; i < m; i++) right.push(`calc(100% - ${j()}px) ${y(i)}%`);
  for (let i = m - 1; i >= 1; i--) left.push(`${j()}px ${y(i)}%`);
  return `polygon(${[
    "-8px -8px",
    "calc(100% + 8px) -8px",
    "calc(100% + 8px) 4px",
    `calc(100% - ${j()}px) 4px`,
    ...right,
    `calc(100% - ${j()}px) calc(100% - 4px)`,
    "calc(100% + 8px) calc(100% - 4px)",
    "calc(100% + 8px) calc(100% + 8px)",
    "-8px calc(100% + 8px)",
    "-8px calc(100% - 4px)",
    `${j()}px calc(100% - 4px)`,
    ...left,
    `${j()}px 4px`,
    "-8px 4px",
  ].join(", ")})`;
}

console.log(`  --deckle-sheet: ${deckle(5, 6, 28, 14)};`);
console.log(`  --deckle-a: ${deckle(7, 3.5)};`);
console.log(`  --deckle-b: ${deckle(19, 3)};`);
console.log(`  --deckle-c: ${deckle(43, 2.5)};`);
console.log(`  --deckle-ladder: ${ladder(61, 4)};`);
