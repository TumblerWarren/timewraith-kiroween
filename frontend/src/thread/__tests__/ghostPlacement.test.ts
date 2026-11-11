import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildThread, type Anchor } from "../geometry";
import { ghostPlacement } from "../ghostPlacement";

const anchorsArb = fc
  .array(fc.record({ x: fc.double({ min: 0, max: 1600, noNaN: true }), dy: fc.double({ min: 1, max: 2400, noNaN: true }) }), {
    minLength: 2,
    maxLength: 7,
  })
  .map((steps) => {
    let y = 0;
    return steps.map(({ x, dy }, i): Anchor => {
      if (i > 0) y += dy;
      return { x, y: y + 100 };
    });
  });

const num = (min: number, max: number) => fc.double({ min, max, noNaN: true });

describe("Mini Ghost placement", () => {
  /** Feature: timewraith, Property 17: Ghost placement. **Validates: Requirements 2.6, 10.5** */
  it("Property 17: on the thread at the clamped smoothed lead; at the first node under Reduce Motion", () => {
    fc.assert(
      fc.property(
        anchorsArb,
        fc.integer(),
        fc.oneof(num(-5000, 30000), fc.constant(Number.POSITIVE_INFINITY)),
        num(0, 20000),
        num(0, 400),
        num(0, 200),
        fc.boolean(),
        (anchors, seed, smoothY, scrollY, mainLeft, mainTop, reduceMotion) => {
          const model = buildThread(anchors, seed);
          const p = ghostPlacement({ model, smoothY, scrollY, mainLeft, mainTop, reduceMotion });
          expect(p).not.toBeNull();
          if (!p) return;
          const first = model.samples[0];
          const last = model.samples[model.samples.length - 1];
          if (!first || !last) return;
          // Page y (main coordinates) stays inside the thread's y range.
          const pageY = p.y - mainTop + scrollY;
          expect(pageY).toBeGreaterThanOrEqual(first.y - 1e-6);
          expect(pageY).toBeLessThanOrEqual(last.y + 1e-6);
          if (reduceMotion || !Number.isFinite(smoothY)) {
            expect(p.x).toBeCloseTo(mainLeft + first.x, 6);
            expect(pageY).toBeCloseTo(first.y, 6);
          } else {
            const clamped = Math.min(last.y, Math.max(first.y, smoothY));
            expect(pageY).toBeCloseTo(clamped, 6);
            expect(p.x).toBeCloseTo(mainLeft + model.atY(clamped).x, 6);
          }
        },
      ),
    );
  });

  it("returns null without a thread", () => {
    const model = buildThread([], 1);
    expect(ghostPlacement({ model, smoothY: 10, scrollY: 0, mainLeft: 0, mainTop: 0, reduceMotion: false })).toBeNull();
  });
});
