/**
 * Hand-inked outlines for the placeholder mascots. A shape is a short list of points; `inkPath`
 * nudges every point by a seeded amount (so no two outlines are straight or symmetric) and joins
 * them with a smooth Catmull-Rom curve. A point flagged sharp (third value 1) stays a corner: ear
 * tips, wing tips, spikes. Pure and deterministic: same input, same path.
 */

export type InkPoint = readonly [x: number, y: number] | readonly [x: number, y: number, sharp: 0 | 1];

export interface InkOptions {
  /** Maximum nudge per point, in viewBox units. */
  readonly amp?: number;
  /** Closed outline (default) or an open stroke. */
  readonly closed?: boolean;
  /** Seeds the wobble. */
  readonly seed?: number;
}

/** mulberry32: tiny seeded generator, returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

type P = { x: number; y: number; sharp: boolean };

export function inkPath(points: readonly InkPoint[], { amp = 1.6, closed = true, seed = 1 }: InkOptions = {}): string {
  const rand = seededRandom(seed);
  const pts: P[] = points.map((p) => ({
    x: p[0] + (rand() * 2 - 1) * amp,
    y: p[1] + (rand() * 2 - 1) * amp,
    sharp: p[2] === 1,
  }));
  const n = pts.length;
  if (n === 0) return "";
  const first = pts[0] as P;
  if (n === 1) return `M${r1(first.x)} ${r1(first.y)}`;
  const at = (i: number): P => {
    if (closed) return pts[((i % n) + n) % n] as P;
    return pts[Math.min(Math.max(i, 0), n - 1)] as P;
  };
  let d = `M${r1(first.x)} ${r1(first.y)}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.sharp ? p1.x : p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.sharp ? p1.y : p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.sharp ? p2.x : p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.sharp ? p2.y : p2.y - (p3.y - p1.y) / 6;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2.x)} ${r1(p2.y)}`;
  }
  return closed ? `${d}Z` : d;
}

/** Mirror points across the vertical line x = axis. */
export function mirrorX(points: readonly InkPoint[], axis: number): InkPoint[] {
  return points.map((p) => (p[2] === undefined ? ([2 * axis - p[0], p[1]] as const) : ([2 * axis - p[0], p[1], p[2]] as const)));
}

/** Scale and move points. */
export function mapPoints(points: readonly InkPoint[], sx: number, sy: number, dx = 0, dy = 0): InkPoint[] {
  return points.map((p) => (p[2] === undefined ? ([p[0] * sx + dx, p[1] * sy + dy] as const) : ([p[0] * sx + dx, p[1] * sy + dy, p[2]] as const)));
}
