import { clamp, cubicAt, cubicTangent, type Cubic } from "./cubic";

/**
 * Keyframes of one bat flight (pure). Beyond a straight cubic walk it adds:
 * - anticipation: a short crouch (squash) at the start before the launch;
 * - easing baked into the samples (slow out of the crouch, slow into the landing), so Motion plays them linearly;
 * - a weave perpendicular to the path (about 2.5 half-waves);
 * - rotation that follows the path tangent (a bank of 0.35 x the heading, at most 28 degrees);
 * - a depth scale 0.85 -> 1.12 -> 0.9 along the path;
 * - an ending: either a fade and shrink (bursts) or a landing squash that decays over 3 beats, a short hold and a
 *   fade and shrink (single bats flying to a node or a click point).
 */
export interface FlightOptions {
  /** Time on the path, ms (without the crouch and the landing). */
  readonly flightMs: number;
  /** Base scale of the bat sprite (1 = the pool size). */
  readonly baseScale?: number;
  /** Extra body tilt in degrees, fading out along the path. */
  readonly tilt?: number;
  /** Landing settle at the end instead of a plain fade (bat.travel, bat.to-point). */
  readonly landing?: boolean;
  readonly anticipationMs?: number;
  /** Weave amplitude in px (0 for none). */
  readonly weave?: number;
  readonly samples?: number;
}

export interface FlightKeyframes {
  readonly x: number[];
  readonly y: number[];
  readonly rotate: number[];
  readonly scaleX: number[];
  readonly scaleY: number[];
  readonly opacity: number[];
  /** Offsets 0..1. */
  readonly times: number[];
  readonly durationMs: number;
  /** Time (ms) of the first path sample and of the last one, for trails and tests. */
  readonly launchMs: number;
  readonly arriveMs: number;
}

export const ANTICIPATION_MS = 90;
export const LANDING_MS = 500;
export const MAX_BANK_DEG = 28;

/** Half linear, half smoothstep: gentle out of the crouch and into the landing. */
export function flightEase(u: number): number {
  const s = u * u * (3 - 2 * u);
  return 0.5 * u + 0.5 * s;
}

/** Depth scale along the path: 0.85 at the start, 1.12 at the apex, 0.9 at the end. */
export function depthScale(u: number): number {
  return 0.85 + 0.27 * Math.sin(Math.PI * u) + 0.05 * u;
}

/** Bank angle for a heading (degrees, 0 = right, 90 = down): leans into the motion, at most MAX_BANK_DEG. */
export function bankFor(headingDeg: number): number {
  let a = headingDeg;
  if (a > 90) a -= 180;
  else if (a < -90) a += 180;
  return clamp(-a * 0.35, -MAX_BANK_DEG, MAX_BANK_DEG);
}

export function planFlight(path: Cubic, o: FlightOptions): FlightKeyframes {
  const base = o.baseScale ?? 1;
  const antic = o.anticipationMs ?? ANTICIPATION_MS;
  const n = Math.max(6, o.samples ?? 22);
  const weave = o.weave ?? 12;
  const tilt = o.tilt ?? 0;
  const landMs = o.landing ? LANDING_MS : 0;
  const total = antic + o.flightMs + landMs;

  const frames: { t: number; x: number; y: number; r: number; sx: number; sy: number; op: number }[] = [];
  // Crouch: squashed and 4 px low, fading in.
  frames.push({ t: 0, x: path.p0.x, y: path.p0.y + 4, r: tilt, sx: base * 1.08, sy: base * 0.88, op: 0 });
  frames.push({ t: antic * 0.55, x: path.p0.x, y: path.p0.y + 4, r: tilt, sx: base * 1.08, sy: base * 0.88, op: 1 });

  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const s = flightEase(u);
    const p = cubicAt(path, s);
    const d = cubicTangent(path, s);
    const len = Math.hypot(d.x, d.y) || 1;
    const env = Math.sin(Math.PI * u);
    const w = weave * env * Math.sin(2.5 * Math.PI * u);
    const heading = (Math.atan2(d.y, d.x) * 180) / Math.PI;
    const depth = base * depthScale(u);
    const fade = o.landing ? 0 : clamp((u - 0.85) / 0.15, 0, 1);
    const shrink = 1 - 0.4 * fade;
    frames.push({
      t: antic + u * o.flightMs,
      x: p.x + (-d.y / len) * w,
      y: p.y + (d.x / len) * w,
      r: bankFor(heading) + tilt * (1 - u),
      sx: depth * shrink,
      sy: depth * shrink,
      op: 1 - fade,
    });
  }

  const last = frames[frames.length - 1]!;
  if (o.landing) {
    const at = last.t;
    const land = (dt: number, sx: number, sy: number, op = 1) => frames.push({ t: at + dt, x: last.x, y: last.y, r: 0, sx: base * sx, sy: base * sy, op });
    land(60, 1.1, 0.9);
    land(140, 0.96, 1.06);
    land(220, 1.03, 0.98);
    land(300, 1, 1);
    land(380, 1, 1);
    land(landMs, 0.6, 0.6, 0);
  }

  return {
    x: frames.map((f) => f.x),
    y: frames.map((f) => f.y),
    rotate: frames.map((f) => f.r),
    scaleX: frames.map((f) => f.sx),
    scaleY: frames.map((f) => f.sy),
    opacity: frames.map((f) => f.op),
    times: frames.map((f) => (total > 0 ? f.t / total : 1)),
    durationMs: total,
    launchMs: antic,
    arriveMs: antic + o.flightMs,
  };
}

/** Position of the bat at time `t` ms of a planned flight (linear between keyframes). */
export function flightPointAt(k: FlightKeyframes, tMs: number): { x: number; y: number } {
  const u = k.durationMs > 0 ? clamp(tMs / k.durationMs, 0, 1) : 1;
  for (let i = 1; i < k.times.length; i++) {
    const t1 = k.times[i]!;
    if (u <= t1) {
      const t0 = k.times[i - 1]!;
      const f = t1 > t0 ? (u - t0) / (t1 - t0) : 1;
      return { x: k.x[i - 1]! + (k.x[i]! - k.x[i - 1]!) * f, y: k.y[i - 1]! + (k.y[i]! - k.y[i - 1]!) * f };
    }
  }
  return { x: k.x[k.x.length - 1]!, y: k.y[k.y.length - 1]! };
}
