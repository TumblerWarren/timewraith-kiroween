import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { caseVersions } from "../../cases/model";
import { SAMPLE_CASES } from "../../data/cases";
import { fractionToIndex, indexToFraction } from "../replayMachine";
import { buildTracks, runAt } from "../tracks";
import { clockReadout, replayView, revealIndexOf } from "../view";

describe("two-track alignment", () => {
  /** Feature: timewraith, Property 30: Two-track alignment. **Validates: Requirements 22.2, 22.3, 22.4, 25.4** */
  it("Property 30: one event and one clock entry per event, contiguous version runs covering 0..n-1, same ids as the strip", () => {
    for (const c of SAMPLE_CASES) {
      const m = buildTracks(c);
      const n = c.stream.length;
      expect(m.events).toHaveLength(n);
      expect(m.clocks).toHaveLength(n);
      expect(m.versions[0]?.from).toBe(0);
      expect(m.versions[m.versions.length - 1]?.to).toBe(n - 1);
      for (let r = 1; r < m.versions.length; r++) expect(m.versions[r]?.from).toBe((m.versions[r - 1]?.to ?? -2) + 1);
      for (let i = 0; i < n; i++) {
        expect(runAt(m, i)?.versionId).toBe(c.stream[i]?.versionId);
        expect(m.clocks[i]?.index).toBe(i);
        expect(m.events[i]?.index).toBe(i);
        // Peg i and chip i are drawn at the same fraction of the track.
        expect(indexToFraction(m.clocks[i]?.index ?? -1, n)).toBe(indexToFraction(m.events[i]?.index ?? -1, n));
      }
      // The Version_History_Strip lists the same version ids in the same order.
      const runIds = [...new Set(m.versions.map((r) => r.versionId))];
      expect(caseVersions(c).map((v) => v.id)).toEqual(runIds);
    }
  });
});

describe("replay view", () => {
  /** Feature: timewraith, Property 10: Replay view is a function of the index. **Validates: Requirements 7.1, 7.5, 7.12** */
  it("Property 10: the view shows event i, its timestamp and clock; pointer fractions map monotonically", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SAMPLE_CASES), fc.nat(40), fc.double({ min: 0, max: 1, noNaN: true }), (c, raw, f) => {
        const n = c.stream.length;
        const i = raw % n;
        const v = replayView(c, i);
        const e = c.stream[i]!;
        expect(v.event).toBe(e);
        expect(v.ladderRung).toBe(e.status);
        expect(v.version?.id).toBe(e.versionId);
        expect(v.clock).toEqual(clockReadout(e));
        if (e.browserClock) expect(v.clock.value).toContain(e.browserClock.tz);
        expect(v.ariaValueText.startsWith(`Event ${i + 1} of ${n}: `)).toBe(true);
        expect(replayView(c, i)).toEqual(v);
        expect(fractionToIndex(f, n)).toBeLessThanOrEqual(fractionToIndex(Math.min(1, f + 0.1), n));
        expect(v.revealed).toBe(c.mode !== "blind-hunt" || i >= revealIndexOf(c));
      }),
    );
  });

  it("names server-side time by its scope and never as a browser clock", () => {
    const cal = SAMPLE_CASES.find((c) => c.mode === "blind-hunt")!;
    for (const e of cal.stream) {
      const r = clockReadout(e);
      expect(r.scope).not.toBe("browser");
      expect(r.label).not.toMatch(/Browser clock controlled/);
    }
  });
});
