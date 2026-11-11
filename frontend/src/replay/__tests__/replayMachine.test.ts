import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  clampIndex,
  fractionToIndex,
  keyAction,
  NEXT_ACTION,
  PREV_ACTION,
  reduceReplay,
  type ReplayAction,
  type ReplayState,
} from "../replayMachine";

const anyNumber = fc.oneof(
  fc.double({ noDefaultInfinity: false, noNaN: false }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 0.5, -0.5, 1e308, -1e308),
  fc.integer({ min: -1000, max: 1000 }),
);
const count = fc.integer({ min: 1, max: 40 });
const stateIn = (n: number) => fc.record({ index: fc.integer({ min: 0, max: n - 1 }), playing: fc.boolean() });

describe("replay index clamping", () => {
  /** Feature: timewraith, Property 8: Replay index clamping. **Validates: Requirements 7.13** */
  it("Property 8: clampIndex returns an integer in [0, n-1] for any real number, and NaN maps to 0", () => {
    fc.assert(
      fc.property(anyNumber, count, (v, n) => {
        const i = clampIndex(v, n);
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(n - 1);
        if (Number.isNaN(v)) expect(i).toBe(0);
        if (v === Number.POSITIVE_INFINITY) expect(i).toBe(n - 1);
        if (v === Number.NEGATIVE_INFINITY) expect(i).toBe(0);
      }),
      { numRuns: 500 },
    );
  });

  it("seek and fraction actions clamp too", () => {
    fc.assert(
      fc.property(anyNumber, count, (v, n) => {
        for (const action of [{ type: "seek", value: v }, { type: "fraction", f: v }] as ReplayAction[]) {
          const { index } = reduceReplay({ index: 0, playing: false }, action, n);
          expect(Number.isInteger(index) && index >= 0 && index <= n - 1).toBe(true);
        }
      }),
    );
  });
});

describe("replay stepping and keyboard mapping", () => {
  /** Feature: timewraith, Property 9: Replay stepping and keyboard mapping. **Validates: Requirements 7.6, 7.7, 7.8, 15.4** */
  it("Property 9: step, first, last, prev(next(i)) and the key map behave like the buttons", () => {
    fc.assert(
      fc.property(
        count.chain((n) => fc.tuple(fc.constant(n), stateIn(n))),
        fc.string({ maxLength: 12 }),
        ([n, s], otherKey) => {
          const run = (a: ReplayAction, from: ReplayState = s) => reduceReplay(from, a, n).index;
          expect(run({ type: "step", dir: 1 })).toBe(Math.min(s.index + 1, n - 1));
          expect(run({ type: "step", dir: -1 })).toBe(Math.max(s.index - 1, 0));
          expect(run({ type: "first" })).toBe(0);
          expect(run({ type: "last" })).toBe(n - 1);
          if (s.index > 0 && s.index < n - 1) {
            const next = reduceReplay(s, NEXT_ACTION, n);
            expect(run(PREV_ACTION, next)).toBe(s.index);
          }
          // Keys equal the buttons' actions.
          expect(keyAction("ArrowRight")).toEqual(NEXT_ACTION);
          expect(keyAction("ArrowLeft")).toEqual(PREV_ACTION);
          expect(keyAction("ArrowUp")).toEqual(keyAction("ArrowRight"));
          expect(keyAction("ArrowDown")).toEqual(keyAction("ArrowLeft"));
          expect(run(keyAction("Home") as ReplayAction)).toBe(0);
          expect(run(keyAction("End") as ReplayAction)).toBe(n - 1);
          // Any other key leaves the state unchanged: there is no action to apply.
          if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(otherKey)) {
            expect(keyAction(otherKey)).toBeNull();
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("maps a pointer fraction monotonically and Play stops at the last event", () => {
    fc.assert(
      fc.property(count, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (n, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(fractionToIndex(lo, n)).toBeLessThanOrEqual(fractionToIndex(hi, n));
      }),
    );
    const n = 5;
    let s = reduceReplay({ index: 0, playing: false }, { type: "play" }, n);
    for (let i = 0; i < 10; i++) s = reduceReplay(s, { type: "tick" }, n);
    expect(s).toEqual({ index: 4, playing: false });
    expect(reduceReplay(s, { type: "play" }, n)).toEqual({ index: 0, playing: true });
  });
});
