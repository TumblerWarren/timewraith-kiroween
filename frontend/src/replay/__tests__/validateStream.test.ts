import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CALCOM_CASE, FULLCALENDAR_CASE, SAMPLE_CASES } from "../../data/cases";
import type { ReplayEvent } from "../../data/types";
import { formatLocal, validateStream } from "../validateStream";

/**
 * Property 11: Mock stream validity (both sample streams and random single mutations).
 * Validates: Requirements 7.3, 16.5, 22.6, 22.7, 23.1, 26.6
 */

type Mutable = { -readonly [K in keyof ReplayEvent]: ReplayEvent[K] };
type Mutation = (s: Mutable[], i: number) => boolean;

const clone = (s: readonly ReplayEvent[]): Mutable[] => JSON.parse(JSON.stringify(s));

describe("validateStream on the sample cases (task 8.2)", () => {
  for (const c of SAMPLE_CASES) {
    it(`accepts the ${c.id} stream`, () => {
      expect(validateStream(c.stream, c)).toEqual({ ok: true, errors: [] });
    });
  }

  it("has 14 FullCalendar events on fc-6.1.10, the last one by Doctor Stitch, and no fixed-version event", () => {
    const s = FULLCALENDAR_CASE.stream;
    expect(s).toHaveLength(14);
    expect(new Set(s.map((e) => e.versionId))).toEqual(new Set(["fc-6.1.10"]));
    expect(s[13]).toMatchObject({ id: "e14", actor: "doctor-stitch", kind: "fix" });
    expect(s.some((e) => e.status === "fixed-version-verified")).toBe(false);
    expect(s[12]?.text).toMatch(/^Fixed-version check not run/);
    expect(FULLCALENDAR_CASE.fix.upstream).toBeNull();
  });

  it("has 17 Cal.com events, server-side only, with one reveal at e12 and the climax on the patched pin", () => {
    const s = CALCOM_CASE.stream;
    expect(s).toHaveLength(17);
    expect(s.every((e) => e.browserClock === null)).toBe(true);
    expect(s.some((e) => e.text.includes("Browser clock controlled"))).toBe(false);
    const reveal = s.filter((e) => e.kind === "reveal");
    expect(reveal.map((e) => e.id)).toEqual(["e12"]);
    expect(s.filter((e) => e.check).map((e) => [e.id, e.check?.versionId, e.check?.result])).toEqual([
      ["e14", "cal-affected", "fails"],
      ["e15", "cal-patched", "passes"],
    ]);
    // Nothing before the reveal names the hidden report.
    for (const e of s.slice(0, 11)) expect(e.text).not.toMatch(/30021|#\d+/);
    // The report's facts are in the stream.
    const text = s.map((e) => e.text).join("\n");
    for (const fact of ["processWorkingHours", "packages/features/schedules/lib/date-ranges.ts", "9 AM start", "18:00 to 23:00 UTC", "17:00 to 22:00 UTC", "2026-03-08", "13:00 is read as 01:00", "192 tests"]) {
      expect(text).toContain(fact);
    }
    for (const e of s) if (e.serverClock !== "not controlled") expect(e.serverClock).toMatchObject({ tz: "UTC", method: "unit-test" });
  });

  it("labels the Cal.com case as an illustrative replay with illustrative pins and no commit hash", () => {
    expect(CALCOM_CASE.replayModeLabel).toBe("Illustrative replay");
    expect(CALCOM_CASE.sampleLabel).toBe("Illustrative replay modelled on the public report, not a real recorded run");
    expect(CALCOM_CASE.versions.every((v) => v.source === "illustrative-pin" && !v.includesSuggestedFix)).toBe(true);
    expect(JSON.stringify(CALCOM_CASE)).not.toMatch(/\b[0-9a-f]{7,40}\b/);
    expect(CALCOM_CASE.fix.upstream).toMatchObject({ kind: "described-in-report", reportedResult: "192 tests green" });
  });
});

/** Single mutations, each of which breaks exactly one rule. Each returns false when it does not apply. */
const MUTATIONS: Record<string, Mutation> = {
  "seq not the index": (s, i) => ((s[i] as Mutable).seq = i + 7) > 0,
  "duplicate id": (s, i) => i > 0 && ((s[i] as Mutable).id = (s[i - 1] as Mutable).id) !== "",
  "offset not increasing": (s, i) => i > 0 && ((s[i] as Mutable).tOffsetMs = (s[i - 1] as Mutable).tOffsetMs) >= 0,
  "status moves down": (s, i) => {
    const e = s[i] as Mutable;
    if (i === 0 || (s[i - 1] as Mutable).status === "planned") return false;
    e.status = "planned";
    return true;
  },
  "inconclusive status": (s, i) => {
    (s[i] as Mutable).status = "inconclusive";
    return true;
  },
  "unknown version": (s, i) => {
    (s[i] as Mutable).versionId = "nowhere";
    return true;
  },
  "browser local does not match": (s, i) => {
    const e = s[i] as Mutable;
    if (!e.browserClock) return false;
    e.browserClock = { ...e.browserClock, local: "1999-01-01 00:00:00 UTC+0" };
    return true;
  },
  "controlled clock without the wording": (s, i) => {
    const e = s[i] as Mutable;
    if (!e.browserClock?.controlled) return false;
    e.text = e.text.replaceAll("Browser clock controlled", "Clock set");
    return true;
  },
  "server event says Browser clock controlled": (s, i) => {
    const e = s[i] as Mutable;
    if (e.serverClock === "not controlled") return false;
    e.text = `Browser clock controlled. ${e.text}`;
    return true;
  },
  "wording without a controlled clock": (s, i) => {
    const e = s[i] as Mutable;
    if (e.browserClock?.controlled) return false;
    e.text = `Browser clock controlled. ${e.text}`;
    return true;
  },
  "banned wording": (s, i) => {
    (s[i] as Mutable).text = "No bugs found, the fix was merged.";
    return true;
  },
  "fixed-version verified without the checks": (s, i) => {
    const e = s[i] as Mutable;
    const passIndex = s.findIndex((x) => x.check?.result === "passes");
    if (passIndex !== -1 && i >= passIndex) return false;
    for (let j = i; j < s.length; j++) (s[j] as Mutable).status = "fixed-version-verified";
    return e.status === "fixed-version-verified";
  },
  "affected check passes instead of failing": (s) => {
    const e = s.find((x) => x.check?.result === "fails");
    if (!e) return false;
    e.check = { versionId: e.check!.versionId, result: "passes" };
    return s.some((x) => x.status === "fixed-version-verified");
  },
  "second reveal": (s, i) => {
    const e = s[i] as Mutable;
    if (e.kind === "reveal") return false;
    e.kind = "reveal";
    return true;
  },
  "reveal removed": (s) => {
    const e = s.find((x) => x.kind === "reveal");
    if (!e) return false;
    e.kind = "note";
    return true;
  },
  "hidden issue named early": (s, i) => {
    const r = s.findIndex((x) => x.kind === "reveal");
    if (r === -1 || i >= r) return false;
    (s[i] as Mutable).text = `${(s[i] as Mutable).text} See #30021.`;
    return true;
  },
  "too few events": (s) => {
    s.splice(7);
    return true;
  },
};

describe("Property 11: Mock stream validity", () => {
  it("every stream event of both samples obeys the per-event rules", () => {
    for (const c of SAMPLE_CASES) {
      for (const e of c.stream) {
        if (e.browserClock) expect(e.browserClock.local).toBe(formatLocal(e.browserClock.instant, e.browserClock.tz));
        expect(c.versions.map((v) => v.id)).toContain(e.versionId);
      }
    }
  });

  it("rejects any single random mutation that breaks a rule", () => {
    const names = Object.keys(MUTATIONS);
    fc.assert(
      fc.property(fc.constantFrom(...SAMPLE_CASES), fc.constantFrom(...names), fc.nat(), (c, name, at) => {
        const s = clone(c.stream);
        const applied = (MUTATIONS[name] as Mutation)(s, at % s.length);
        fc.pre(applied);
        expect(validateStream(s, c).ok, name).toBe(false);
      }),
      { numRuns: 400 },
    );
  });

  it("never throws on broken input", () => {
    expect(() => validateStream([{} as ReplayEvent], FULLCALENDAR_CASE)).not.toThrow();
    expect(validateStream([], CALCOM_CASE).ok).toBe(false);
    expect(validateStream(FULLCALENDAR_CASE.stream, { ...FULLCALENDAR_CASE, mode: "blind-hunt" }).ok).toBe(false);
  });
});
