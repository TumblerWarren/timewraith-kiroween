import { THREAD_ECHO_OFFSET_PX, THREAD_MAX_WOBBLE_PX, THREAD_SAMPLES } from "../animation/constants";
import { mulberry32 } from "../animation/paths/random";

/**
 * Pure Timeline_Thread geometry (design "Timeline Thread"). Anchors are page coordinates with y strictly
 * increasing (one `data-thread-anchor` per region). The path is a cubic Hermite spline of x as a function
 * of y through the anchors and seeded wobble midpoints. Each cubic's y control points are spaced evenly,
 * so y is linear in t on every segment and the path is y-monotonic by construction. Wobble moves x only,
 * by at most 6 px, and never moves an anchor.
 */

export interface Anchor {
  x: number;
  y: number;
}

export interface ThreadSample {
  x: number;
  y: number;
  /** Cumulative path length from the first anchor. */
  len: number;
  /** Tangent heading in degrees (90 = straight down). */
  angle: number;
}

export interface ThreadModel {
  /** SVG path data for the main ink stroke. */
  d: string;
  /** Second stacked stroke (offset 1.5 px in x, its own wobble), drawn under the main one with the same dash progress. */
  echoD: string;
  totalLength: number;
  /** About 400 samples, y non-decreasing; the first and last equal the first and last anchors. */
  samples: ThreadSample[];
  /** Sample at page y, clamped to the thread's y range and linearly interpolated. */
  atY(y: number): ThreadSample;
}

interface Knot {
  x: number;
  y: number;
  /** dx/dy at the knot. */
  m: number;
}

/** Sorts by y, drops non-finite points and repeated y values (the first one wins). */
function cleanAnchors(anchors: readonly Anchor[]): Anchor[] {
  const sorted = anchors.filter((a) => Number.isFinite(a.x) && Number.isFinite(a.y)).sort((a, b) => a.y - b.y);
  const out: Anchor[] = [];
  for (const a of sorted) if (out.length === 0 || a.y > (out[out.length - 1] as Anchor).y) out.push({ x: a.x, y: a.y });
  return out;
}

/** Anchors plus one wobbled midpoint per gap, with Catmull-Rom style slopes dx/dy. */
function knotsFor(anchors: readonly Anchor[], seed: number, offsetX: number): Knot[] {
  const rand = mulberry32(seed);
  const pts: Anchor[] = [];
  anchors.forEach((a, i) => {
    pts.push({ x: a.x + offsetX, y: a.y });
    const next = anchors[i + 1];
    if (next) pts.push({ x: (a.x + next.x) / 2 + offsetX + (rand() * 2 - 1) * THREAD_MAX_WOBBLE_PX, y: (a.y + next.y) / 2 });
  });
  return pts.map((p, i) => {
    const prev = pts[i - 1] ?? p;
    const next = pts[i + 1] ?? p;
    const dy = next.y - prev.y;
    return { x: p.x, y: p.y, m: dy > 0 ? (next.x - prev.x) / dy : 0 };
  });
}

/** x on the Hermite segment between knots a and b at page y (a.y <= y <= b.y). */
function xOn(a: Knot, b: Knot, y: number): { x: number; dxdy: number } {
  const h = b.y - a.y;
  const t = h > 0 ? (y - a.y) / h : 0;
  const t2 = t * t;
  const t3 = t2 * t;
  const x = (2 * t3 - 3 * t2 + 1) * a.x + (t3 - 2 * t2 + t) * h * a.m + (-2 * t3 + 3 * t2) * b.x + (t3 - t2) * h * b.m;
  const dxdt = (6 * t2 - 6 * t) * a.x + (3 * t2 - 4 * t + 1) * h * a.m + (-6 * t2 + 6 * t) * b.x + (3 * t2 - 2 * t) * h * b.m;
  return { x, dxdy: h > 0 ? dxdt / h : 0 };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function pathD(knots: readonly Knot[]): string {
  const first = knots[0];
  if (!first) return "";
  let d = `M ${r2(first.x)} ${r2(first.y)}`;
  for (let i = 0; i + 1 < knots.length; i++) {
    const a = knots[i] as Knot;
    const b = knots[i + 1] as Knot;
    const h = b.y - a.y;
    d += ` C ${r2(a.x + (a.m * h) / 3)} ${r2(a.y + h / 3)}, ${r2(b.x - (b.m * h) / 3)} ${r2(b.y - h / 3)}, ${r2(b.x)} ${r2(b.y)}`;
  }
  return d;
}

function sampleKnots(knots: readonly Knot[], anchors: readonly Anchor[], count: number): ThreadSample[] {
  const first = anchors[0] as Anchor;
  const last = anchors[anchors.length - 1] as Anchor;
  const samples: ThreadSample[] = [];
  let seg = 0;
  let len = 0;
  for (let k = 0; k <= count; k++) {
    const y = k === count ? last.y : first.y + ((last.y - first.y) * k) / count;
    while (seg + 2 < knots.length && y > (knots[seg + 1] as Knot).y) seg++;
    const a = knots[seg] as Knot;
    const b = knots[seg + 1] as Knot;
    const { x: rawX, dxdy } = xOn(a, b, y);
    const x = k === 0 ? first.x : k === count ? last.x : rawX;
    const prev = samples[samples.length - 1];
    if (prev) len += Math.hypot(x - prev.x, y - prev.y);
    samples.push({ x, y: k === 0 ? first.y : y, len, angle: (Math.atan2(1, dxdy) * 180) / Math.PI });
  }
  return samples;
}

function sampleAt(samples: readonly ThreadSample[], y: number): ThreadSample {
  const first = samples[0] as ThreadSample;
  const last = samples[samples.length - 1] as ThreadSample;
  if (!(y > first.y)) return { ...first };
  if (y >= last.y) return { ...last };
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((samples[mid] as ThreadSample).y <= y) lo = mid;
    else hi = mid;
  }
  const a = samples[lo] as ThreadSample;
  const b = samples[hi] as ThreadSample;
  const t = b.y > a.y ? (y - a.y) / (b.y - a.y) : 0;
  return { x: a.x + (b.x - a.x) * t, y, len: a.len + (b.len - a.len) * t, angle: a.angle + (b.angle - a.angle) * t };
}

export function buildThread(anchors: readonly Anchor[], seed: number): ThreadModel {
  const clean = cleanAnchors(anchors);
  if (clean.length === 0) {
    const zero: ThreadSample = { x: 0, y: 0, len: 0, angle: 90 };
    return { d: "", echoD: "", totalLength: 0, samples: [], atY: (y) => ({ ...zero, y: Number.isFinite(y) ? y : 0 }) };
  }
  if (clean.length === 1) {
    const a = clean[0] as Anchor;
    const only: ThreadSample = { x: a.x, y: a.y, len: 0, angle: 90 };
    return { d: `M ${r2(a.x)} ${r2(a.y)}`, echoD: "", totalLength: 0, samples: [only], atY: () => ({ ...only }) };
  }
  const knots = knotsFor(clean, seed, 0);
  const echo = knotsFor(clean, (seed ^ 0x5bd1e995) >>> 0, THREAD_ECHO_OFFSET_PX);
  const samples = sampleKnots(knots, clean, THREAD_SAMPLES);
  const totalLength = (samples[samples.length - 1] as ThreadSample).len;
  return {
    d: pathD(knots),
    echoD: pathD(echo),
    totalLength,
    samples,
    atY: (y) => sampleAt(samples, y),
  };
}

/** Drawn ink length for a lead line at page y: 0 at or above the first anchor, total at or below the last, monotone between. */
export function drawnLength(model: ThreadModel, leadY: number): number {
  const first = model.samples[0];
  const last = model.samples[model.samples.length - 1];
  if (!first || !last || Number.isNaN(leadY) || leadY <= first.y) return 0;
  if (leadY >= last.y) return model.totalLength;
  return Math.min(model.totalLength, Math.max(0, model.atY(leadY).len));
}
