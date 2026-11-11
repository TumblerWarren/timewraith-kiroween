import {
  BURST_DURATION_MS,
  BURST_MAX_STAGGER_MS,
  BURST_SIZE,
  COMPACT_MAX_WIDTH_PX,
  TABLET_MAX_FLIGHT_PX,
  TABLET_MAX_WIDTH_PX,
} from "../constants";
import { clamp, clampPt, distance, type Pt, type Rect } from "./cubic";
import { between, mulberry32 } from "./random";

/** One bat flight: a cubic from `p0` (inside the origin) to `p3`, in viewport coordinates. */
export interface Flight {
  readonly delayMs: number;
  readonly durationMs: number;
  readonly p0: Pt;
  readonly p1: Pt;
  readonly p2: Pt;
  readonly p3: Pt;
  /** Body tilt in degrees, applied on top of the path. */
  readonly rotate: number;
}

/** Half-angle of the upward cone, in degrees. */
const CONE_HALF_DEG = 65;

/** Flights in a burst for this seed and size class (5 to 7, or 3 when compact). */
export function burstCount(seed: number, compact: boolean): number {
  const [lo, hi] = compact ? BURST_SIZE.compact : BURST_SIZE.regular;
  const rand = mulberry32(seed);
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** True for tablet widths (768 to 1099 px), where flights stay within 600 px of their start. */
export function isTabletWidth(width: number): boolean {
  return width > COMPACT_MAX_WIDTH_PX && width <= TABLET_MAX_WIDTH_PX;
}

/**
 * Seeded Bat Burst plan (design "Burst plan"). Pure: the same arguments always give the same flights.
 * The flights open upward and outward in a cone, one cone sector per bat, and every point after `p0` is
 * clamped to `bounds`.
 */
export function burstPlan(origin: Rect, bounds: Rect, seed: number, compact: boolean): Flight[] {
  const count = burstCount(seed, compact);
  // A second stream for geometry, so the count draw does not shift every flight.
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const tablet = isTabletWidth(bounds.w);
  const [dMin, dMax] = compact ? [110, 220] : [180, 380];
  const sector = (CONE_HALF_DEG * 2) / count;
  const seen = new Set<string>();
  const flights: Flight[] = [];

  for (let i = 0; i < count; i++) {
    const p0: Pt = { x: origin.x + rand() * Math.max(0, origin.w), y: origin.y + rand() * Math.max(0, origin.h) };
    const deg = -90 - CONE_HALF_DEG + sector * (i + 0.5) + between(rand, -0.35, 0.35) * sector;
    const rad = (deg * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const perp = { x: -dir.y, y: dir.x };
    const d = between(rand, dMin, dMax);
    const bend = between(rand, -0.2, 0.2) * d;
    const along = (k: number, side: number): Pt => ({
      x: p0.x + dir.x * d * k + perp.x * side,
      y: p0.y + dir.y * d * k + perp.y * side,
    });
    let p1 = along(0.3, bend * 0.7);
    let p2 = along(0.7, bend);
    let p3 = along(1, bend * 0.25);
    const limit = (p: Pt): Pt => {
      let q = clampPt(p, bounds);
      if (tablet) {
        const dist = distance(p0, q);
        if (dist > TABLET_MAX_FLIGHT_PX) {
          const s = TABLET_MAX_FLIGHT_PX / dist;
          q = clampPt({ x: p0.x + (q.x - p0.x) * s, y: p0.y + (q.y - p0.y) * s }, bounds);
        }
      }
      return q;
    };
    p1 = limit(p1);
    p2 = limit(p2);
    p3 = limit(p3);

    // Clamping into a corner could make two flights identical; nudge inward until unique.
    for (let k = 1; seen.has(keyOf(p1, p2, p3)) && k < 64; k++) {
      const step = p1.x > bounds.x + bounds.w / 2 ? -k : k;
      p1 = { x: clamp(p1.x + step, bounds.x, bounds.x + bounds.w), y: clamp(p1.y + k, bounds.y, bounds.y + bounds.h) };
    }
    seen.add(keyOf(p1, p2, p3));

    const stagger = count > 1 ? (BURST_MAX_STAGGER_MS * i) / (count - 1) : 0;
    flights.push({
      delayMs: Math.min(BURST_MAX_STAGGER_MS, Math.round(stagger * between(rand, 0.6, 1))),
      durationMs: BURST_DURATION_MS.min + Math.floor(rand() * (BURST_DURATION_MS.max - BURST_DURATION_MS.min + 1)),
      p0,
      p1,
      p2,
      p3,
      rotate: between(rand, -18, 18),
    });
  }
  return flights;
}

function keyOf(a: Pt, b: Pt, c: Pt): string {
  return `${a.x},${a.y}|${b.x},${b.y}|${c.x},${c.y}`;
}
