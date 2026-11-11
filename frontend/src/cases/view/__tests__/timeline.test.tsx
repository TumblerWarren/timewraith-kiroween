import { act, fireEvent, render, within } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LINKS } from "../../../config/links";
import { CALCOM_REPLAY_LABEL, FIXED_CHECK_NOT_RUN, REPLAY_LABEL } from "../../../content/copy";
import { LIBRARY_SAMPLE_LABEL } from "../../../content/sections";
import { CALCOM_CASE, FULLCALENDAR_CASE } from "../../../data/cases";
import { validateStream } from "../../../replay/validateStream";
import { revealIndexOf } from "../../../replay/view";
import { CaseCard } from "../../library/CaseCard";
import { MILESTONE_ORDER, type SampleCase } from "../../model";
import { SampleCaseView } from "../CaseView";
import { timelineView } from "../timeline";

const SAMPLES: readonly SampleCase[] = [FULLCALENDAR_CASE, CALCOM_CASE];
const noop = () => undefined;

/** Text, every attribute value (href, aria-*, title, alt, data-*) of a rendered subtree. */
function exposedStrings(root: HTMLElement): string {
  const parts = [root.textContent ?? ""];
  // `data-case` and `data-case-id` hold the internal case id ("calcom-30021"), a developer hook that is not shown or announced.
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) if (attr.name !== "data-case" && attr.name !== "data-case-id") parts.push(attr.value);
  }
  return parts.join("\n");
}

/** The same case with every `check` removed: a generated case that never ran a fixed-version check. */
const withoutChecks = (c: SampleCase): SampleCase => ({ ...c, stream: c.stream.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "check")) as unknown as (typeof c.stream)[number]) });

describe("Property 34: Version timeline order and honesty", () => {
  /** Feature: timewraith, Property 34. **Validates: Requirements 28.1 to 28.9, 16.12** */
  it("has five milestones in order, known versions and events, honest dates", () => {
    for (const c of SAMPLES) {
      expect(c.timeline.map((m) => m.kind)).toEqual([...MILESTONE_ORDER]);
      const versions = new Set(c.versions.map((v) => v.id));
      const events = new Set(c.stream.map((e) => e.id));
      let prev = "";
      for (const m of c.timeline) {
        if (m.versionId !== null) expect(versions.has(m.versionId)).toBe(true);
        if (m.eventId !== null) expect(events.has(m.eventId)).toBe(true);
        if (m.date) {
          expect(["released", "reported"]).toContain(m.kind);
          expect(m.illustrativePin).toBe(false);
          expect(m.date.href).toMatch(/^https:\/\//);
          expect(m.date.value >= prev).toBe(true);
          prev = m.date.value;
        }
        if (m.illustrativePin) expect(m.date).toBeNull();
      }
      expect(validateStream(c.stream, c).errors).toEqual([]);
    }
  });

  it("uses the recorded dates and links of the design", () => {
    const [released, reported] = FULLCALENDAR_CASE.timeline;
    expect(released?.date).toMatchObject({ value: "2023-11-29", source: "published-release" });
    expect(reported?.date).toEqual({ value: "2025-09-12", source: "issue-tracker", href: LINKS.issue7998.href });
    const calReported = CALCOM_CASE.timeline[1];
    expect(calReported?.date).toEqual({ value: "2026-08-21", source: "issue-tracker", href: LINKS.issue30021.href });
    expect(CALCOM_CASE.timeline[0]).toMatchObject({ illustrativePin: true, date: null });
  });

  it("reaches replay milestones exactly from their event, and the fixed milestone only after a passing check", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 16 }), fc.boolean(), (raw, stripChecks) => {
        for (const base of SAMPLES) {
          const c = stripChecks ? withoutChecks(base) : base;
          const index = Math.min(raw, c.stream.length - 1);
          const view = timelineView(c, index);
          expect(view.map((v) => v.milestone.kind)).toEqual([...MILESTONE_ORDER]);
          for (const v of view) {
            const at = c.stream.findIndex((e) => e.id === v.milestone.eventId);
            if (v.milestone.kind === "reproduced" || v.milestone.kind === "fix-suggested") {
              expect(v.state).toBe(index >= at ? "reached" : "ahead");
            }
          }
          const fixed = view[4]!;
          const hasPass = c.stream.some((e) => e.check?.result === "passes");
          if (!hasPass) expect(fixed.state).toBe("not-run");
          else expect(fixed.state).toBe(index >= c.stream.findIndex((e) => e.id === "e15") ? "reached" : "ahead");
        }
      }),
      { numRuns: 60 },
    );
  });

  it("reads 'Fixed-version check not run' on FullCalendar at every index and never marks it reached", () => {
    const last = FULLCALENDAR_CASE.stream.length - 1;
    for (let i = 0; i <= last; i++) expect(timelineView(FULLCALENDAR_CASE, i)[4]?.state).toBe("not-run");
    const { container } = render(<SampleCaseView c={FULLCALENDAR_CASE} />);
    const fixed = container.querySelector('[data-milestone="fixed-verified"]') as HTMLElement;
    expect(fixed).toHaveAttribute("data-state", "not-run");
    expect(fixed).toHaveTextContent(FIXED_CHECK_NOT_RUN);
  });

  it("renders five list items in order and marks e11's milestone reached only from e11", () => {
    const { container } = render(<SampleCaseView c={FULLCALENDAR_CASE} />);
    const items = Array.from(container.querySelectorAll(".vtl__list > li"));
    expect(items.map((li) => li.getAttribute("data-milestone"))).toEqual([...MILESTONE_ORDER]);
    expect(items[0]).toHaveAttribute("data-state", "reached");
    expect(items[1]).toHaveAttribute("data-state", "reached");
    expect(items[2]).toHaveAttribute("data-state", "ahead");
    expect(items[2]).toHaveTextContent("not reached yet");
    const slider = within(container).getByRole("slider");
    for (let i = 0; i < 9; i++) fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(container.querySelector('[data-milestone="reproduced"]')).toHaveAttribute("data-state", "ahead");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(container.querySelector('[data-milestone="reproduced"]')).toHaveAttribute("data-state", "reached");
    expect(container.querySelector('[data-milestone="reproduced"]')).toHaveTextContent("Sample replay, event e11");
    const dates = Array.from(container.querySelectorAll(".vtl a[data-date-source]"));
    expect(dates.map((a) => a.getAttribute("href"))).toEqual(["https://www.npmjs.com/package/@fullcalendar/core/v/6.1.10", LINKS.issue7998.href]);
  });

  it("rejects timelines that break an order or date rule", () => {
    const base = CALCOM_CASE;
    const bad = (timeline: SampleCase["timeline"]) => validateStream(base.stream, { ...base, timeline }).ok;
    expect(bad(base.timeline)).toBe(true);
    expect(bad([...base.timeline].reverse())).toBe(false);
    expect(bad(base.timeline.map((m) => (m.kind === "released" ? { ...m, date: { value: "2020-01-01", source: "published-release" as const, href: "https://example.com/x" } } : m)))).toBe(false);
    expect(bad(base.timeline.map((m) => (m.kind === "reproduced" ? { ...m, eventId: "e99" } : m)))).toBe(false);
    expect(bad(base.timeline.map((m) => (m.kind === "reproduced" ? { ...m, date: { value: "2026-09-01", source: "issue-tracker" as const, href: "https://example.com/x" } } : m)))).toBe(false);
  });
});

describe("Property 31: Reveal honesty (card, Case view and timeline)", () => {
  /** Feature: timewraith, Property 31. **Validates: Requirements 21.7, 23.2, 23.3, 23.4, 28.8, 15.10** */
  const FORBIDDEN = ["30021", CALCOM_CASE.title, "afternoon availability", CALCOM_CASE.issue.href, "calcom/cal.com/issues", "cal.diy", "2026-08-21", CALCOM_CASE.issue.label];

  it("names no issue number, title, link or date anywhere before the reveal index, including the timeline", () => {
    const reveal = revealIndexOf(CALCOM_CASE);
    expect(reveal).toBe(11);
    const { container } = render(<SampleCaseView c={CALCOM_CASE} />);
    const slider = within(container).getByRole("slider");
    for (let i = 0; i < reveal; i++) {
      const exposed = exposedStrings(container);
      for (const bad of FORBIDDEN) expect(exposed, `index ${i} leaks ${bad}`).not.toContain(bad);
      expect(slider.getAttribute("aria-valuetext") ?? "").not.toMatch(/30021|cal\.com #/i);
      expect(container.querySelector('[data-milestone="reported"]')).toHaveAttribute("data-state", "hidden");
      expect(container.querySelector('[data-milestone="reported"]')).toHaveTextContent("Public report hidden until the reveal");
      expect(container.querySelector('[data-milestone="reported"] a')).toBeNull();
      fireEvent.keyDown(slider, { key: "ArrowRight" });
    }
    // Index 11 is the reveal: the report, its link and its date are there now.
    const after = exposedStrings(container);
    expect(after).toContain(CALCOM_CASE.issue.href);
    expect(container.querySelector('[data-milestone="reported"]')).toHaveAttribute("data-state", "reached");
    expect(container.querySelector('[data-milestone="reported"] a')).toHaveAttribute("href", LINKS.issue30021.href);
    expect(container.querySelector('[data-milestone="reported"]')).toHaveTextContent("2026-08-21");
  });

  it("hides the report again when scrubbing back before the reveal", () => {
    const { container } = render(<SampleCaseView c={CALCOM_CASE} />);
    const slider = within(container).getByRole("slider");
    fireEvent.keyDown(slider, { key: "End" });
    expect(exposedStrings(container)).toContain("30021");
    fireEvent.keyDown(slider, { key: "Home" });
    const exposed = exposedStrings(container);
    for (const bad of FORBIDDEN) expect(exposed).not.toContain(bad);
  });

  it("keeps the Case_Card free of the issue for every reveal state", () => {
    const { container } = render(<CaseCard c={CALCOM_CASE} current={false} onOpen={noop} />);
    const exposed = exposedStrings(container);
    for (const bad of FORBIDDEN) expect(exposed).not.toContain(bad);
  });

  it("at and after the reveal shows exactly one outcome phrase matching the recorded outcome", () => {
    const { container } = render(<SampleCaseView c={CALCOM_CASE} />);
    const slider = within(container).getByRole("slider");
    act(() => {
      fireEvent.keyDown(slider, { key: "End" });
    });
    const stamp = container.querySelector(".reveal-card__stamp");
    expect(stamp).toHaveTextContent("Same behaviour as the public report");
    expect(container.querySelectorAll(".reveal-card__stamp")).toHaveLength(1);
    expect(container.textContent).not.toContain("Did not match");
  });
});

describe("Property 35: Every sample case cites its source and carries its label", () => {
  /** Feature: timewraith, Property 35. **Validates: Requirements 16.4, 16.5, 16.10, 16.11, 26.7, 7.4** */
  const cases: readonly [SampleCase, string, string][] = [
    [FULLCALENDAR_CASE, LINKS.issue7998.href, REPLAY_LABEL],
    [CALCOM_CASE, LINKS.issue30021.href, CALCOM_REPLAY_LABEL],
  ];
  it.each(cases)("%#: issue link from config/links.ts, an allowed label, a non-live mode label", (c, href, label) => {
    expect(c.issue.href).toBe(href);
    expect(c.issue.source).toBe("third-party-report");
    expect(c.sampleLabel).toBe(label);
    expect([REPLAY_LABEL, CALCOM_REPLAY_LABEL]).toContain(c.sampleLabel);
    expect(["Recorded replay", "Illustrative replay"]).toContain(c.replayModeLabel);
    expect(c.replayModeLabel).not.toMatch(/Recorded investigation replay|Live/);
  });

  it.each(cases)("%#: the card shows the label and the Case view at the last index shows label and issue link", (c, href, label) => {
    const card = render(<CaseCard c={c} current onOpen={noop} />).container;
    expect(card.textContent).toContain(LIBRARY_SAMPLE_LABEL);
    const { container } = render(<SampleCaseView c={c} />);
    fireEvent.keyDown(within(container).getByRole("slider"), { key: "End" });
    expect(within(container).getAllByText(label).length).toBeGreaterThan(0);
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toContain(href);
    expect(container.textContent).toMatch(/third.party|original report|public report/i);
  });
});
