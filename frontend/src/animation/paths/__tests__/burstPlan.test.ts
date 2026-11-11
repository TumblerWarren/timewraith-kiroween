import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { burstCount, burstPlan, isTabletWidth } from "../burstPlan";
import { cubicAt, distance, inRect, sampleCubic, type Rect } from "../cubic";

/** A viewport and an origin rectangle inside it. */
const sceneArb = fc
  .record({ w: fc.integer({ min: 320, max: 2560 }), h: fc.integer({ min: 480, max: 1600 }) })
  .chain(({ w, h }) =>
    fc
      .record({
        x: fc.integer({ min: 0, max: w - 1 }),
        y: fc.integer({ min: 0, max: h - 1 }),
        ow: fc.integer({ min: 0, max: 240 }),
        oh: fc.integer({ min: 0, max: 80 }),
      })
      .map(({ x, y, ow, oh }) => ({
        bounds: { x: 0, y: 0, w, h } as Rect,
        origin: { x, y, w: Math.min(ow, w - x), h: Math.min(oh, h - y) } as Rect,
      })),
  );

describe("burstPlan", () => {
  /** Feature: timewraith, Property 19: Burst plan invariants. **Validates: Requirements 3.4, 3.7, 20.1** */
  it("Property 19: 5 to 7 flights (3 compact), starts inside the origin, 600 to 950 ms, stagger <= 130 ms, distinct paths", () => {
    fc.assert(
      fc.property(sceneArb, fc.integer(), fc.boolean(), ({ bounds, origin }, seed, compact) => {
        const plan = burstPlan(origin, bounds, seed, compact);
        if (compact) expect(plan).toHaveLength(3);
        else {
          expect(plan.length).toBeGreaterThanOrEqual(5);
          expect(plan.length).toBeLessThanOrEqual(7);
        }
        expect(plan).toHaveLength(burstCount(seed, compact));
        const keys = new Set<string>();
        for (const f of plan) {
          expect(inRect(f.p0, origin)).toBe(true);
          for (const p of [f.p1, f.p2, f.p3]) expect(inRect(p, bounds)).toBe(true);
          expect(f.durationMs).toBeGreaterThanOrEqual(600);
          expect(f.durationMs).toBeLessThanOrEqual(950);
          expect(f.delayMs).toBeGreaterThanOrEqual(0);
          expect(f.delayMs).toBeLessThanOrEqual(130);
          if (isTabletWidth(bounds.w)) expect(distance(f.p0, f.p3)).toBeLessThanOrEqual(600 + 1e-6);
          keys.add(JSON.stringify([f.p1, f.p2, f.p3]));
        }
        expect(keys.size).toBe(plan.length);
        expect(burstPlan(origin, bounds, seed, compact)).toEqual(plan);
      }),
      { numRuns: 300 },
    );
  });

  it("flights open upward from the origin", () => {
    const plan = burstPlan({ x: 600, y: 700, w: 120, h: 44 }, { x: 0, y: 0, w: 1440, h: 900 }, 42, false);
    for (const f of plan) expect(f.p3.y).toBeLessThan(f.p0.y);
  });

  it("sampleCubic hits both ends and returns n evenly spaced offsets", () => {
    const c = { p0: { x: 0, y: 0 }, p1: { x: 10, y: 0 }, p2: { x: 20, y: 10 }, p3: { x: 30, y: 30 } };
    const s = sampleCubic(c, 16);
    expect(s.x).toHaveLength(16);
    expect(s.times[0]).toBe(0);
    expect(s.times[15]).toBe(1);
    expect({ x: s.x[15], y: s.y[15] }).toEqual(cubicAt(c, 1));
  });
});
