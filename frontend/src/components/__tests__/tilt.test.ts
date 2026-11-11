import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { paperTilt, slapTilt, stampTilt, tiltDeg } from "../tilt";

const deg = (v: unknown) => Number(String(v).replace("deg", ""));
const px = (v: unknown) => Number(String(v).replace("px", ""));
const props = (style: object) => style as Record<string, string>;

describe("seeded tilt (visual revision R1)", () => {
  it("is deterministic per key", () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        expect(paperTilt(key)).toEqual(paperTilt(key));
        expect(stampTilt(key)).toEqual(stampTilt(key));
      }),
      { numRuns: 100 },
    );
  });

  it("keeps paper objects under 1.5deg and stamps between 1 and 4 degrees either way", () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        expect(Math.abs(deg(props(paperTilt(key, 5))["--tilt"]))).toBeLessThan(1.5);
        const stamp = deg(props(stampTilt(key))["--tilt"]);
        expect(Math.abs(stamp)).toBeGreaterThanOrEqual(1);
        expect(Math.abs(stamp)).toBeLessThanOrEqual(4);
        expect(Math.abs(tiltDeg(key, 2))).toBeLessThanOrEqual(2);
      }),
      { numRuns: 200 },
    );
  });

  it("strikes a stamp twice 1 to 2px away in a seeded direction", () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        const s = props(stampTilt(key));
        const dist = Math.hypot(px(s["--strike-x"]), px(s["--strike-y"]));
        expect(dist).toBeGreaterThanOrEqual(0.9);
        expect(dist).toBeLessThanOrEqual(2.1);
      }),
      { numRuns: 200 },
    );
  });

  it("gives the page's stamps different angles", () => {
    const keys = [
      "problem-stamp-0159",
      "problem-stamp-0300",
      "final-raven-stamp",
      "replay-folder-tab",
      "replay-sample-label",
      "replay-peg-tag-e04",
      "flow-gate-approve",
      ...["planned", "observed-anomaly", "reproduced", "known-issue-match", "fixed-version-verified"].map((s) => `ladder-rank-${s}`),
    ];
    const angles = keys.map((k) => props(stampTilt(k))["--tilt"]);
    expect(new Set(angles).size).toBeGreaterThanOrEqual(keys.length - 2);
    expect(angles.some((a) => deg(a) < 0)).toBe(true);
    expect(angles.some((a) => deg(a) > 0)).toBe(true);
  });
});

describe("slapTilt (stamps slapped onto a scene)", () => {
  it("is deterministic, leans min to max degrees either way and keeps the stamp's double strike", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 6 }), (key, min, extra) => {
        const max = min + extra;
        const s = props(slapTilt(key, min, max));
        expect(slapTilt(key, min, max)).toEqual(slapTilt(key, min, max));
        const angle = Math.abs(deg(s["--tilt"]));
        expect(angle).toBeGreaterThanOrEqual(min - 0.05);
        expect(angle).toBeLessThanOrEqual(max + 0.05);
        expect(s["--strike-x"]).toBe(props(stampTilt(key))["--strike-x"]);
        expect(s["--strike-y"]).toBe(props(stampTilt(key))["--strike-y"]);
      }),
      { numRuns: 200 },
    );
  });

  it("defaults to 5 to 10 degrees", () => {
    const angle = Math.abs(deg(props(slapTilt("problem-stamp-0159"))["--tilt"]));
    expect(angle).toBeGreaterThanOrEqual(5);
    expect(angle).toBeLessThanOrEqual(10);
  });
});
