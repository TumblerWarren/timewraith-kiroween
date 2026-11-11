import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import fc from "fast-check";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { LiveAnnouncer } from "../../a11y/LiveAnnouncer";
import { REMOVE_DRAFT } from "../../content/copy";
import { CALCOM_HIDDEN_TITLE, DEFAULT_CASE_ID } from "../../data/cases";
import { caseOpenedText } from "../actions";
import { MAX_DRAFTS } from "../drafts/storage";
import type { DraftInput } from "../form/validate";
import { CaseLibrary } from "../library/CaseLibrary";
import { visibleTitle } from "../model";
import { CaseStoreProvider, useCaseStore, type CaseStoreValue } from "../store";
import { CaseViewProbe, FakeStorage } from "./helpers";

/**
 * Property 29: Case selection.
 * Validates: Requirements 21.4, 21.5, 21.6, 22.9, 20.8, 5.5
 *
 * The Case view is a probe that shows the selected case's visible title until task 9 makes CaseView case-scoped;
 * the replay index reset on a selection change (Requirement 22.9) is checked with the replay state in task 9.
 */

const latest: { store: CaseStoreValue | null } = { store: null };
const keep = (s: CaseStoreValue) => {
  latest.store = s;
};
/** Hands the store value to the test after each render (effects flush inside act). */
function Spy({ onStore }: { onStore: (s: CaseStoreValue) => void }) {
  const s = useCaseStore();
  useEffect(() => onStore(s));
  return null;
}
const current = () => latest.store as CaseStoreValue;

function renderWithSpy(now: () => number) {
  return render(
    <LiveAnnouncer>
      <CaseStoreProvider storage={new FakeStorage()} now={now}>
        <Spy onStore={keep} />
        <CaseLibrary />
        <CaseViewProbe />
      </CaseStoreProvider>
    </LiveAnnouncer>,
  );
}

type Action = { type: "select"; pick: number } | { type: "create"; input: DraftInput } | { type: "remove"; pick: number };

const inputArb: fc.Arbitrary<DraftInput> = fc.record({
  mode: fc.constant("open-hunt" as const),
  target: fc.integer({ min: 1, max: 65535 }).map((p) => ({ kind: "local-app" as const, appUrl: `http://localhost:${p}` })),
});
const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ type: fc.constant("select" as const), pick: fc.nat() }),
  fc.record({ type: fc.constant("create" as const), input: inputArb }),
  fc.record({ type: fc.constant("remove" as const), pick: fc.nat() }),
);

const currentButtons = () => Array.from(document.querySelectorAll('ol.library__cards [aria-current="true"]'));

function checkInvariants(path: string) {
  const s = current();
  const marked = currentButtons();
  expect(marked).toHaveLength(1);
  expect(marked[0]?.closest("li")).toHaveAttribute("data-case-id", s.selectedId);
  const heading = document.getElementById("case-title") as HTMLElement;
  expect(heading).toHaveAttribute("data-selected", s.selectedId);
  expect(heading).toHaveTextContent(visibleTitle(s.selected));
  if (s.selectedId === "calcom-30021") expect(heading).toHaveTextContent(CALCOM_HIDDEN_TITLE);
  expect(s.drafts.length).toBeLessThanOrEqual(MAX_DRAFTS);
  expect(window.location.pathname + window.location.search).toBe(path);
}

describe("Property 29: Case selection", () => {
  it("starts on the FullCalendar sample with exactly one current card", () => {
    renderWithSpy(() => 1_700_000_000_000);
    expect(current().selectedId).toBe(DEFAULT_CASE_ID);
    checkInvariants(window.location.pathname + window.location.search);
  });

  it("keeps exactly one current case through any sequence of select, create and remove", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { minLength: 1, maxLength: 24 }), (actions) => {
        cleanup();
        const path = window.location.pathname + window.location.search;
        let t = 1_700_000_000_000;
        renderWithSpy(() => (t += 1000));
        for (const a of actions) {
          const s = current();
          if (a.type === "select") {
            const ids = s.cases.map((c) => c.id);
            const id = ids[a.pick % ids.length] as string;
            const li = document.querySelector(`li[data-case-id="${id}"]`) as HTMLElement;
            act(() => {
              fireEvent.click(within(li).getByRole("button", { name: /^Open case/ }));
            });
            expect(current().selectedId).toBe(id);
            expect(document.getElementById("case-title")).toHaveFocus();
            expect(screen.getByRole("status")).toHaveTextContent(caseOpenedText(visibleTitle(current().selected)));
          } else if (a.type === "create") {
            const before = s.drafts.length;
            act(() => {
              s.createDraft(a.input);
            });
            expect(current().drafts.length).toBe(Math.min(before + 1, MAX_DRAFTS));
          } else if (s.drafts.length > 0) {
            const d = s.drafts[a.pick % s.drafts.length];
            if (!d) continue;
            const wasCurrent = d.id === s.selectedId;
            const li = document.querySelector(`li[data-case-id="${d.id}"]`) as HTMLElement;
            act(() => {
              fireEvent.click(within(li).getByRole("button", { name: new RegExp(`^${REMOVE_DRAFT}`) }));
            });
            expect(current().drafts.some((x) => x.id === d.id)).toBe(false);
            if (wasCurrent) expect(current().selectedId).toBe(DEFAULT_CASE_ID);
          }
          checkInvariants(path);
        }
        cleanup();
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  it("ignores an unknown id", () => {
    renderWithSpy(() => 1_700_000_000_000);
    let ok = true;
    act(() => {
      ok = current().select("no-such-case");
    });
    expect(ok).toBe(false);
    expect(current().selectedId).toBe(DEFAULT_CASE_ID);
  });
});
