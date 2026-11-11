import { render, within } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DRAFT_NOT_RUN, ILLUSTRATIVE_PIN, ISSUE_HIDDEN, SUGGESTED_FIX } from "../../../content/copy";
import { CASE_MODE_IDS } from "../../../content/modes";
import { LIBRARY_SAMPLE_LABEL } from "../../../content/sections";
import { CALCOM_CASE, FULLCALENDAR_CASE } from "../../../data/cases";
import { newDraftId } from "../../drafts/ids";
import type { DraftCase } from "../../model";
import { CaseCard } from "../CaseCard";

const noop = () => undefined;

/** Text, hrefs and accessible names (aria-label, aria-labelledby targets, alt) of a rendered card. */
function exposedStrings(root: HTMLElement): string {
  const parts = [root.textContent ?? ""];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of ["href", "aria-label", "alt", "title", "aria-description"]) {
      const v = el.getAttribute(attr);
      if (v) parts.push(v);
    }
  }
  return parts.join("\n");
}

describe("Case_Card for the sample cases (Requirements 21.2, 21.3, 21.7, 25)", () => {
  it("shows the FullCalendar card with the sample label, mode, mono target, issue link and one version", () => {
    const { container } = render(<CaseCard c={FULLCALENDAR_CASE} current onOpen={noop} />);
    const card = within(container);
    expect(card.getByText(LIBRARY_SAMPLE_LABEL)).toBeInTheDocument();
    expect(card.getByText("Known issue")).toBeInTheDocument();
    expect(card.getByText("fullcalendar/fullcalendar @ v6.1.10")).toHaveClass("mono");
    expect(card.getByRole("link", { name: FULLCALENDAR_CASE.issue.label })).toHaveAttribute("href", "https://github.com/fullcalendar/fullcalendar/issues/7998");
    const strip = card.getByRole("list", { name: "Versions checked" });
    expect(Array.from(strip.querySelectorAll("li")).map((li) => li.getAttribute("data-version-id"))).toEqual(FULLCALENDAR_CASE.versions.map((v) => v.id));
    expect(within(strip).getByText("fails")).toBeInTheDocument();
    expect(card.getByRole("button", { name: new RegExp(`^Open case: ${FULLCALENDAR_CASE.title}`) })).toHaveAttribute("aria-current", "true");
    expect(card.queryByRole("button", { name: /Remove draft/ })).toBeNull();
  });

  it("never exposes the Blind hunt issue on its card, and labels the illustrative pins", () => {
    const { container } = render(<CaseCard c={CALCOM_CASE} current={false} onOpen={noop} />);
    const card = within(container);
    expect(card.getByText(ISSUE_HIDDEN)).toBeInTheDocument();
    expect(card.getByRole("heading", { level: 3 })).toHaveTextContent("cal.com: booking availability around DST");
    const exposed = exposedStrings(container);
    expect(exposed).not.toMatch(/30021/);
    expect(exposed).not.toContain(CALCOM_CASE.title);
    expect(exposed).not.toContain(CALCOM_CASE.issue.href);
    expect(card.getByRole("button", { name: /^Open case/ })).not.toHaveAttribute("aria-current");
    const stamps = card.getAllByRole("listitem");
    expect(stamps.map((li) => li.getAttribute("data-version-id"))).toEqual(["cal-affected", "cal-patched"]);
    for (const s of stamps) expect(s).toHaveTextContent(ILLUSTRATIVE_PIN);
    expect(stamps.map((li) => li.getAttribute("data-result"))).toEqual(["fails", "passes"]);
  });

  it("gives each mode and version result a distinct shape next to its text", () => {
    const fc1 = render(<CaseCard c={FULLCALENDAR_CASE} current onOpen={noop} />).container;
    const cal = render(<CaseCard c={CALCOM_CASE} current={false} onOpen={noop} />).container;
    const modeShapes = [fc1, cal].map((c) => c.querySelector(".mode-shape")?.getAttribute("data-shape"));
    expect(new Set(modeShapes).size).toBe(2);
    const results = Array.from(cal.querySelectorAll(".version-strip .result-shape")).map((s) => s.getAttribute("data-shape"));
    expect(new Set(results).size).toBe(2);
  });
});

/**
 * Property 33: Drafts never look run.
 * Validates: Requirements 20.2, 20.3, 22.8, 25.3, 16.7
 * (The Case_View half is checked with the DraftCaseView in task 9.)
 */
const draftArb: fc.Arbitrary<DraftCase> = fc
  .record({
    mode: fc.constantFrom(...CASE_MODE_IDS),
    target: fc.oneof(
      fc.record({
        kind: fc.constant("repository" as const),
        repoUrl: fc.constantFrom("https://github.com/acme/app", "https://gitlab.com/group/project.git"),
        version: fc.oneof(
          fc.stringMatching(/^[0-9a-f]{7,40}$/).map((value) => ({ kind: "commit" as const, value })),
          fc.constantFrom("main", "v6.1.10", "release/2024.09", "feature/dst-guard").map((value) => ({ kind: "ref" as const, value })),
        ),
      }),
      fc.record({ kind: fc.constant("local-app" as const), appUrl: fc.integer({ min: 1, max: 65535 }).map((p) => `http://localhost:${p}`) }),
    ),
    area: fc.option(fc.constantFrom("week view at midnight", "booking slots on DST days", "<b>month</b> header"), { nil: undefined }),
    saved: fc.boolean(),
    n: fc.integer({ min: 1, max: 99999 }),
  })
  .map(({ mode, target, area, saved, n }) => ({
    kind: "draft" as const,
    id: newDraftId(1_700_000_000_000 + n, () => "abcd"),
    createdAt: new Date(1_700_000_000_000 + n).toISOString(),
    mode,
    target,
    saved,
    ...(area ? { area } : {}),
    ...(mode !== "open-hunt" ? { issueUrl: `https://github.com/acme/app/issues/${n}` } : {}),
  }));

describe("Property 33: Drafts never look run", () => {
  it("labels every draft card 'Draft, not run', with no ladder rung, no fix and only 'not run' versions", () => {
    fc.assert(
      fc.property(draftArb, fc.boolean(), (d, isCurrent) => {
        const { container, unmount } = render(<CaseCard c={d} current={isCurrent} onOpen={noop} onRemove={noop} />);
        const card = within(container);
        expect(card.getByText(DRAFT_NOT_RUN)).toBeInTheDocument();
        expect(container.querySelector(".evidence-shape")).toBeNull();
        expect(container.textContent).not.toContain(SUGGESTED_FIX);
        expect(container.textContent).not.toMatch(/\b(running|queued|completed|verified|reproduced|passes|fails)\b/i);
        const stamps = Array.from(container.querySelectorAll(".version-strip li"));
        expect(stamps).toHaveLength(1);
        for (const s of stamps) {
          expect(s).toHaveAttribute("data-result", "not-run");
          expect(s).toHaveTextContent("not run");
          expect(s).toHaveTextContent(d.target.kind === "local-app" ? d.target.appUrl : d.target.version.value);
        }
        expect(card.getByRole("button", { name: /^Remove draft/ })).toBeInTheDocument();
        if (d.mode === "blind-hunt") {
          expect(card.getByText(ISSUE_HIDDEN)).toBeInTheDocument();
          expect(container.textContent).not.toContain(d.issueUrl as string);
        }
        if (!d.saved) expect(card.getByText(/^Not saved/)).toBeInTheDocument();
        unmount();
      }),
      { numRuns: 60 },
    );
  });
});
