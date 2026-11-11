import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { THREAD_MAX_WOBBLE_PX } from "../../animation/constants";
import { buildThread, drawnLength, type Anchor } from "../geometry";

/** Anchors with strictly increasing y (page coordinates). */
const anchorsArb = fc
  .array(fc.record({ x: fc.double({ min: 0, max: 1600, noNaN: true }), dy: fc.double({ min: 1, max: 2400, noNaN: true }) }), {
    minLength: 2,
    maxLength: 12,
  })
  .chain((steps) =>
    fc.double({ min: -500, max: 3000, noNaN: true }).map((y0) => {
      let y = y0;
      return steps.map(({ x, dy }, i): Anchor => {
        if (i > 0) y += dy;
        return { x, y };
      });
    }),
  );

describe("thread geometry", () => {
  /** Feature: timewraith, Property 16: Thread geometry. **Validates: Requirements 2.1, 2.3** */
  it("Property 16: y-monotonic samples, exact endpoints, monotone and bounded drawnLength", () => {
    fc.assert(
      fc.property(anchorsArb, fc.integer(), fc.array(fc.double({ min: -10_000, max: 40_000, noNaN: true }), { minLength: 2, maxLength: 20 }), (anchors, seed, leads) => {
        const model = buildThread(anchors, seed);
        const first = anchors[0] as Anchor;
        const last = anchors[anchors.length - 1] as Anchor;
        const s = model.samples;
        expect(s.length).toBeGreaterThanOrEqual(300);
        for (let i = 1; i < s.length; i++) {
          expect((s[i] as Anchor).y).toBeGreaterThanOrEqual((s[i - 1] as Anchor).y);
        }
        expect(s[0]).toMatchObject({ x: first.x, y: first.y, len: 0 });
        expect(s[s.length - 1]).toMatchObject({ x: last.x, y: last.y });
        expect(model.totalLength).toBeGreaterThanOrEqual(last.y - first.y - 1e-6);

        expect(drawnLength(model, first.y)).toBe(0);
        expect(drawnLength(model, first.y - 100)).toBe(0);
        expect(drawnLength(model, last.y)).toBe(model.totalLength);
        expect(drawnLength(model, last.y + 100)).toBe(model.totalLength);

        const sorted = [...leads].sort((a, b) => a - b);
        let prev = -Infinity;
        for (const y of sorted) {
          const len = drawnLength(model, y);
          expect(len).toBeGreaterThanOrEqual(0);
          expect(len).toBeLessThanOrEqual(model.totalLength);
          expect(len).toBeGreaterThanOrEqual(prev);
          prev = len;
        }
      }),
      { numRuns: 200 },
    );
  });

  it("is deterministic per seed and draws two stacked strokes", () => {
    const anchors = [
      { x: 48, y: 100 },
      { x: 60, y: 900 },
      { x: 40, y: 1800 },
    ];
    const a = buildThread(anchors, 7);
    const b = buildThread(anchors, 7);
    expect(a.d).toBe(b.d);
    expect(a.d.startsWith("M 48 100")).toBe(true);
    expect(a.echoD.startsWith("M 49.5 100")).toBe(true);
    expect(a.echoD).not.toBe(a.d);
    expect(buildThread(anchors, 8).d).not.toBe(a.d);
  });

  it("keeps wobble small: a straight vertical thread stays within a few px of its line", () => {
    const model = buildThread(
      [
        { x: 100, y: 0 },
        { x: 100, y: 1000 },
        { x: 100, y: 2000 },
      ],
      123,
    );
    for (const s of model.samples) expect(Math.abs(s.x - 100)).toBeLessThanOrEqual(THREAD_MAX_WOBBLE_PX + 1e-9);
  });

  it("atY clamps and interpolates", () => {
    const model = buildThread(
      [
        { x: 10, y: 0 },
        { x: 10, y: 400 },
      ],
      1,
    );
    expect(model.atY(-50)).toMatchObject({ x: 10, y: 0, len: 0 });
    expect(model.atY(9999)).toMatchObject({ x: 10, y: 400 });
    expect(model.atY(200).y).toBe(200);
  });

  it("handles degenerate input without throwing", () => {
    expect(buildThread([], 1).totalLength).toBe(0);
    expect(drawnLength(buildThread([], 1), 10)).toBe(0);
    const one = buildThread([{ x: 5, y: 5 }], 1);
    expect(one.samples).toHaveLength(1);
    expect(drawnLength(one, 100)).toBe(0);
    // Unsorted and duplicate y values are cleaned up.
    const messy = buildThread(
      [
        { x: 0, y: 500 },
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: Number.NaN, y: 9 },
      ],
      2,
    );
    expect(messy.samples[0]?.y).toBe(0);
    expect(drawnLength(messy, Number.NaN)).toBe(0);
  });
});
