import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LiveAnnouncer } from "../../a11y/LiveAnnouncer";
import type { InvestigationSummary } from "../../api/types";
import { liveFromSummary, type LiveCase } from "../../cases/model";
import { CaseStoreContext, type CaseStoreValue } from "../../cases/store";
import { caseHref } from "../router";
import { FinishedNotices, finishedSince } from "../FinishedNotices";

const BASE: InvestigationSummary = {
  id: "inv-1",
  created_at: "2026-11-19T10:00:00Z",
  target: { repository_url: "https://github.com/date-fns/date-fns", owner: "date-fns", repo: "date-fns", ref: "main", revision: null },
  mode: "open-hunt",
  stage: "experimenting",
  phase: "execution",
  status: "planned",
  bug_count: 0,
  replay_label: "Live",
  runtime_label: "Kiro Crew",
};
const caseOf = (over: Partial<InvestigationSummary> = {}): LiveCase => liveFromSummary({ ...BASE, ...over });
const stages = (...cases: LiveCase[]) => new Map(cases.map((c) => [c.id, c.summary.stage as string]));

describe("finishedSince", () => {
  it("reports a run seen working that now finished with problems, failed or done", () => {
    const working = stages(caseOf(), caseOf({ id: "inv-2" }), caseOf({ id: "inv-3" }));
    const done = finishedSince(working, [
      caseOf({ stage: "completed", attention: "6 of 11 experiments could not run." }),
      caseOf({ id: "inv-2", stage: "failed", error: "git_failed", message: "Git could not fetch the repository." }),
      caseOf({ id: "inv-3", stage: "completed" }),
    ]);
    expect(done.map((n) => [n.id, n.tone])).toEqual([["inv-1", "attention"], ["inv-2", "failed"], ["inv-3", "done"]]);
    expect(done[0]?.detail).toContain("6 of 11 experiments could not run");
  });
  it("ignores a case that was already finished, one never seen, and a cancelled run", () => {
    const before = stages(caseOf({ stage: "completed" }), caseOf({ id: "inv-3" }));
    expect(finishedSince(before, [caseOf({ stage: "completed" })])).toEqual([]);
    expect(finishedSince(before, [caseOf({ id: "inv-9", stage: "completed" })])).toEqual([]);
    expect(finishedSince(before, [caseOf({ id: "inv-3", stage: "cancelled" })])).toEqual([]);
  });
});

const store = (live: readonly LiveCase[]): CaseStoreValue =>
  ({ cases: live, drafts: [], live, awaitingFirstList: false, selectedId: null, selected: null, limitReached: false }) as unknown as CaseStoreValue;
const ui = (live: readonly LiveCase[], open?: string) => (
  <LiveAnnouncer>
    <CaseStoreContext.Provider value={store(live)}>
      <FinishedNotices openCaseId={open} />
    </CaseStoreContext.Provider>
  </LiveAnnouncer>
);

describe("FinishedNotices", () => {
  it("stays quiet on the first look, then tells you a run finished with problems and can be dismissed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(ui([caseOf()]));
    expect(screen.queryByRole("region", { name: "Finished runs" })).not.toBeInTheDocument();
    await act(async () => rerender(ui([caseOf({ stage: "completed", attention: "6 of 11 experiments could not run." })])));
    const region = screen.getByRole("region", { name: "Finished runs" });
    expect(region).toHaveTextContent("Done with problems");
    expect(region).toHaveTextContent("6 of 11 experiments could not run");
    expect(screen.getByRole("link", { name: "Open the case" })).toHaveAttribute("href", caseHref("inv-1"));
    expect(screen.getByRole("status")).toHaveTextContent(/Done with problems/);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Finished runs" })).not.toBeInTheDocument();
  });
  it("does not repeat what the open case already shows", async () => {
    const { rerender } = render(ui([caseOf()], "inv-1"));
    await act(async () => rerender(ui([caseOf({ stage: "failed", error: "git_failed", message: "x" })], "inv-1")));
    expect(screen.queryByRole("region", { name: "Finished runs" })).not.toBeInTheDocument();
  });
});