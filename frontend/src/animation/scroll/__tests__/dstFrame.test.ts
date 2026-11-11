import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DST_JUMP_AT, DST_STATIC_FRAME, DST_TICK_AT, dstFrame } from "../dstFrame";

describe("dstFrame (task 14.1, Lost Hour scene)", () => {
  it("reads 01:58, then 01:59, then jumps to 03:00", () => {
    expect(dstFrame(0).label).toBe("01:58");
    expect(dstFrame(DST_TICK_AT).label).toBe("01:59");
    expect(dstFrame(DST_JUMP_AT - 0.001).label).toBe("01:59");
    expect(dstFrame(DST_JUMP_AT)).toMatchObject({ label: "03:00", phase: "after" });
    expect(dstFrame(1).label).toBe("03:00");
    expect(DST_STATIC_FRAME.label).toBe("01:59");
  });

  it("property: never a 02:xx reading, and the reading only moves forward with progress", () => {
    const order = ["01:58", "01:59", "03:00"];
    fc.assert(
      fc.property(fc.double({ noNaN: false }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (any, a, b) => {
        const f = dstFrame(any);
        if (f.hours === 2 || /^02:/.test(f.label)) return false;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return order.indexOf(dstFrame(lo).label) <= order.indexOf(dstFrame(hi).label);
      }),
      { numRuns: 300 },
    );
  });
});
