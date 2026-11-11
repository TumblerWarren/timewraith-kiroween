/** Small 2D helpers for cubic Bezier flights (pure). */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Cubic {
  readonly p0: Pt;
  readonly p1: Pt;
  readonly p2: Pt;
  readonly p3: Pt;
}

export function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x,
    y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y,
  };
}

/** Derivative of the cubic at t. */
export function cubicTangent(c: Cubic, t: number): Pt {
  const u = 1 - t;
  return {
    x: 3 * u * u * (c.p1.x - c.p0.x) + 6 * u * t * (c.p2.x - c.p1.x) + 3 * t * t * (c.p3.x - c.p2.x),
    y: 3 * u * u * (c.p1.y - c.p0.y) + 6 * u * t * (c.p2.y - c.p1.y) + 3 * t * t * (c.p3.y - c.p2.y),
  };
}

export interface CubicSamples {
  readonly x: number[];
  readonly y: number[];
  /** Heading in degrees (0 = pointing right, 90 = pointing down). */
  readonly angle: number[];
  /** Keyframe offsets 0..1, evenly spaced. */
  readonly times: number[];
}

/** Samples the cubic at `n` evenly spaced t values (n >= 2), for Motion keyframes. */
export function sampleCubic(c: Cubic, n: number): CubicSamples {
  const count = Math.max(2, Math.floor(n));
  const out: CubicSamples = { x: [], y: [], angle: [], times: [] };
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const p = cubicAt(c, t);
    const d = cubicTangent(c, t);
    out.x.push(p.x);
    out.y.push(p.y);
    out.angle.push((Math.atan2(d.y, d.x) * 180) / Math.PI);
    out.times.push(t);
  }
  return out;
}

/** SVG path data, for the dev debug overlay only (Requirement 13.9: SVG for flight paths, not characters). */
export function cubicPathD(c: Cubic): string {
  const f = (p: Pt) => `${round2(p.x)} ${round2(p.y)}`;
  return `M ${f(c.p0)} C ${f(c.p1)}, ${f(c.p2)}, ${f(c.p3)}`;
}

export function clampPt(p: Pt, r: Rect): Pt {
  return { x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) };
}

export function inRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectCenter(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
