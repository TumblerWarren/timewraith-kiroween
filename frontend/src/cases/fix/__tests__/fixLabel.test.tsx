import { render } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ILLUSTRATIVE_DIFF, NO_UPSTREAM_FIX, SUGGESTED_FIX } from "../../../content/copy";
import { CALCOM_CASE, FULLCALENDAR_CASE } from "../../../data/cases";
import type { ReplayCheck, ReplayEvent } from "../../../data/types";
import type { SampleCase, VersionEntry } from "../../model";
import { fixLabel, NOT_VERIFIED, verifiedOn } from "../fixLabel";
import { SuggestedFix } from "../SuggestedFix";

const versionArb = (id: string): fc.Arbitrary<VersionEntry> =>
  fc.record({
    id: fc.constant(id),
    label: fc.constantFrom("lib 1.0", "lib 1.1", "patched pin"),
    role: fc.constantFrom("affected", "fixed", "patched", "under-test"),
    source: fc.constant("illustrative-pin"),
    result: fc.constantFrom("fails", "passes", "not-run", "inconclusive"),
    includesSuggestedFix: fc.boolean(),
  }) as fc.Arbitrary<VersionEntry>;

const checkArb: fc.Arbitrary<ReplayCheck | undefined> = fc.option(
  fc.record({ versionId: fc.constantFrom("v1", "v2"), result: fc.constantFrom("fails", "passes", "inconclusive") }) as fc.Arbitrary<ReplayCheck>,
  { nil: undefined },
);

/** A case built on the Cal.com sample with random versions, random checks and a random upstream. */
const caseArb: fc.Arbitrary<SampleCase> = fc
  .record({
    v1: versionArb("v1"),
    v2: versionArb("v2"),
    checks: fc.array(checkArb, { minLength: CALCOM_CASE.stream.length, maxLength: CALCOM_CASE.stream.length }),
    upstream: fc.boolean(),
    illustrative: fc.boolean(),
    mode: fc.constantFrom("known-issue", "open-hunt"),
  })
  .map(({ v1, v2, checks, upstream, illustrative, mode }) => ({
    ...CALCOM_CASE,
    mode,
    versions: [v1, v2],
    stream: CALCOM_CASE.stream.map((e, i): ReplayEvent => {
      const check = checks[i];
      return { ...e, versionId: "v1", check };
    }),
    fix: { ...CALCOM_CASE.fix, illustrative, upstream: upstream ? CALCOM_CASE.fix.upstream : null },
  }));

/** The rule, written out independently of the implementation. */
function expectedLabel(c: SampleCase): string {
  let failed = false;
  for (const e of c.stream) {
    if (!e.check) continue;
    const v = c.versions.find((x) => x.id === e.check?.versionId);
    if (e.check.result === "fails" && v?.role === "affected") failed = true;
    if (e.check.result === "passes" && failed && (v?.role === "fixed" || v?.role === "patched") && v.includesSuggestedFix) return verifiedOn(v.label);
  }
  return NOT_VERIFIED;
}

describe("suggested-fix labelling", () => {
  /** Feature: timewraith, Property 32: Suggested-fix labelling. **Validates: Requirements 24.2, 24.3, 24.4, 24.5, 24.6, 16.8** */
  it("Property 32: heading, verified-only-by-rule status, never 'merged', illustrative and no-upstream labels", () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const label = fixLabel(c);
        expect(label).toBe(expectedLabel(c));
        const { container, unmount } = render(<SuggestedFix c={c} revealed />);
        const sheet = container.querySelector('[role="group"]') as HTMLElement;
        expect(sheet.querySelector("h3")?.textContent).toBe(SUGGESTED_FIX);
        expect(sheet.querySelector(".fix-sheet__status-value")?.textContent).toBe(label);
        const text = container.textContent ?? "";
        expect(text).not.toMatch(/merged/i);
        if (label === NOT_VERIFIED) expect(text).not.toMatch(/Verified on/);
        expect(text.includes(ILLUSTRATIVE_DIFF)).toBe(c.fix.illustrative);
        expect(text.includes(NO_UPSTREAM_FIX)).toBe(c.fix.upstream === null);
        unmount();
      }),
      { numRuns: 60 },
    );
  });

  it("labels both samples 'Not verified' (Cal.com's pass ran on the report's fix, not Doctor Stitch's)", () => {
    expect(fixLabel(FULLCALENDAR_CASE)).toBe(NOT_VERIFIED);
    expect(fixLabel(CALCOM_CASE)).toBe(NOT_VERIFIED);
  });

  it("renders diffs as pre/code with text markers and hidden line descriptions", () => {
    const { container } = render(<SuggestedFix c={FULLCALENDAR_CASE} revealed />);
    const lines = Array.from(container.querySelectorAll("pre code .diff__line"));
    const all = [...FULLCALENDAR_CASE.fix.change.lines, ...FULLCALENDAR_CASE.fix.regressionTest.lines];
    expect(lines).toHaveLength(all.length);
    lines.forEach((el, i) => {
      const type = all[i]!.type;
      const marker = el.querySelector(".diff__marker")?.textContent;
      if (type === "add") {
        expect(marker).toBe("+");
        expect(el.textContent).toContain("added line");
      }
      if (type === "remove") {
        expect(marker).toBe("\u2212");
        expect(el.textContent).toContain("removed line");
      }
    });
  });
});
