import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CASE_ADDITIONS } from "../../../content/copy";
import { PlanCoverage, PlannerRounds } from "../PlanEvidence";
import { BugReproduction } from "../BugReproduction";
import { ActivityTab, FindingsTab, OverviewTab, PlanTab } from "../tabs";
import type { Investigation, ReplayEventMsg } from "../../../api/types";
import { bugFixture, caseFixture } from "./fixtures/caseAdditions";

describe("stored case additions", () => {
  it("shows coverage totals and every coverage status, without inventing results for skipped units", () => {
    const rows = caseFixture.coverage!;
    const partial = { ...rows[0]!, candidate_id: "partial", path: "partial.ts:1", status: "partial" as const, edges: [] };
    render(<PlanCoverage inv={{ ...caseFixture, coverage: [...rows, partial] }} />);
    expect(screen.getByText("2 of 6 candidates tested · 1 with violations")).toBeInTheDocument();
    const table = screen.getByRole("table");
    for (const status of Object.values(CASE_ADDITIONS.coverage.statusLabels)) expect(within(table).getByText(status)).toBeInTheDocument();
    expect(within(table).getByText("src/clock.ts:40")).toBeInTheDocument();
    expect(within(table).getByText("next_after_now @ Australia/Lord_Howe (fall-back)")).toBeInTheDocument();
  });

  it("shows a Python test outcome and the reason a clock run was blocked", () => {
    const inv: Investigation = { ...caseFixture, sweeps: [{ experiment_id: "exp_py", points_run: 0, zones: [],
      violations: [], pytest_results: [{ instant: "2028-02-29T00:30:00Z", zone: "UTC", outcome: "blocked",
        passed: 0, failed: 0, skipped: 0, detail: "Missing project dependency" }] }] };
    render(<PlanTab inv={inv} view="execution" onApprove={() => {}} busy={false} />);
    expect(screen.getByText("blocked")).toBeVisible();
    expect(screen.getByText("Missing project dependency")).toBeVisible();
  });

  it("groups directions and closing decisions by round, including a round without new intents", () => {
    render(<PlannerRounds inv={caseFixture} />);
    const first = screen.getByRole("region", { name: "Round 1" });
    expect(within(first).getByText("nextRun")).toBeInTheDocument();
    expect(within(first).getByText("One new direction: continue the hunt")).toBeInTheDocument();
    const second = screen.getByRole("region", { name: "Round 2" });
    expect(within(second).getByText("already tried")).toBeInTheDocument();
    expect(within(second).getByText("No new direction: the hunt ends")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Round 3" })).toHaveTextContent("The planner found no further directions.");
  });

  it("omits coverage and planner sections for older cases", () => {
    render(<><PlanCoverage inv={{ ...caseFixture, coverage: undefined }} /><PlannerRounds inv={{ ...caseFixture, intents: undefined, decisions: [] }} /></>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("keeps reproduction code read-only and exposes both the failing/control points and public API check", async () => {
    const user = userEvent.setup();
    render(<BugReproduction bug={bugFixture} />);
    expect(screen.getByText(bugFixture.reproduction!.code)).not.toBeVisible();
    await user.click(screen.getByText(CASE_ADDITIONS.reproduction.title));
    expect(screen.getByLabelText(CASE_ADDITIONS.reproduction.code)).toHaveTextContent(bugFixture.reproduction!.code);
    expect(screen.getByText(bugFixture.reproduction!.control)).toBeVisible();
    expect(screen.getByRole("heading", { name: CASE_ADDITIONS.reproduction.publicApi })).toBeVisible();
    expect(screen.getByLabelText(CASE_ADDITIONS.reproduction.userCheck)).toHaveTextContent(bugFixture.reproduction!.user_check!);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("makes wrap-up notes visible instead of hiding them in saved notes", () => {
    render(<OverviewTab inv={caseFixture} runDetails={null} />);
    const warning = screen.getByRole("note");
    expect(warning).toHaveTextContent(CASE_ADDITIONS.wrapUp.title);
    expect(within(warning).getByText(caseFixture.notes[0]!)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Saved notes" })).not.toBeInTheDocument();
  });

  it("names tool events from all three agents, shows director dispatches, and labels the new decisions", async () => {
    const user = userEvent.setup();
    const steps = Object.keys(CASE_ADDITIONS.decisionSteps);
    render(<ActivityTab inv={{ ...caseFixture, decisions: steps.map((step, index) => ({ ...caseFixture.decisions[0]!, id: `d${index}`, step })) }} events={[
      ...(["pumpkin-mechanic", "raven-archivist", "doctor-stitch"] as const).map((actor, index) => ({ id: `e${index}`, seq: index, actor, kind: "tool", phase: "design" as const, text: `Tool call ${index}`, status: "planned" as const })),
      { id: "dispatch", seq: 4, actor: "wraith-director", kind: "dispatch", phase: "design", text: "Round 1: 2 new experiment(s) from the planner", status: "planned" },
    ]} />);
    expect(screen.getByRole("region", { name: "Crew milestones" })).toHaveTextContent("Wraith Director");
    await user.click(screen.getByText("Event log (4)"));
    for (const name of ["Pumpkin Mechanic", "Raven Archivist", "Doctor Stitch"]) expect(screen.getByText(`${name} · 1 tool call`)).toBeVisible();
    await user.click(screen.getByText("Why the Crew decided (4)"));
    for (const label of Object.values(CASE_ADDITIONS.decisionSteps)) expect(screen.getByText(label)).toBeVisible();
  });

  it("keeps a tool session open as further calls arrive and starts another session when the counter resets", async () => {
    const user = userEvent.setup();
    const call = (seq: number, calls: number): ReplayEventMsg => ({
      id: `event-${seq}`, seq, kind: "tool", actor: "raven-archivist", phase: "verification", status: "planned",
      text: `Tool output ${seq}`, data: { experiment_id: "e1", calls, max_calls: 30 },
    });
    const { rerender } = render(<ActivityTab inv={caseFixture} events={[call(1, 1)]} />);
    await user.click(screen.getByText("Event log (1)"));
    await user.click(screen.getByText("Raven Archivist · 1 tool call"));
    rerender(<ActivityTab inv={caseFixture} events={[call(1, 1), call(2, 2), call(3, 1)]} />);
    expect(screen.getByText("Raven Archivist · 2 tool calls")).toBeVisible();
    expect(screen.getByText("Tool output 2")).toBeVisible();
    expect(screen.getByText("Tool output 3")).not.toBeVisible();
  });

  it("keeps an unreviewed scheduling failure visible after its sibling is confirmed", () => {
    const first = { ...bugFixture.violation, failure_kind: "not_after_now" };
    const second = { ...first, failure_kind: "exceeds_gap", detail: "Next event exceeds the allowed interval" };
    render(<FindingsTab inv={{ ...caseFixture, bugs: [{ ...bugFixture, experiment_id: "exp_clock", violation: first }],
      sweeps: [{ experiment_id: "exp_clock", points_run: 20, zones: [first.zone],
        violations: [first, second], pending_review: 1 }] }} />);
    const panel = screen.getByRole("region", { name: "Observed anomalies" });
    expect(within(panel).getByText("Awaiting verification")).toBeVisible();
    expect(within(panel).getByText(second.detail)).toBeVisible();
  });

  it("updates anomaly status from checking to intended, reproduced or not reported", () => {
    const running: Investigation = {
      ...caseFixture, stage: "verifying", bugs: [], decisions: [],
      sweeps: [{ experiment_id: "exp_clock", points_run: 20, zones: [bugFixture.violation.zone], violations: [bugFixture.violation] }],
    };
    const verdict = (subject: string, decision: "accepted" | "rejected"): ReplayEventMsg => ({
      id: "verdict", seq: 1, kind: "decision", actor: "raven-archivist", phase: "verification", status: "planned", text: "Verdict recorded",
      data: { step: "judge_violation", subject, decision, rule: "Verification concluded" },
    });
    const { rerender } = render(<FindingsTab inv={running} />);
    const panel = screen.getByRole("region", { name: "Observed anomalies" });
    expect(within(panel).getByText("Checking…")).toBeVisible();
    rerender(<FindingsTab inv={running} events={[verdict("int_clock_1", "accepted")]} />);
    expect(within(panel).getByText("Intended")).toBeVisible();
    rerender(<FindingsTab inv={running} events={[verdict("bug_clock", "accepted")]} />);
    expect(within(panel).getByText("Reproduced")).toBeVisible();
    rerender(<FindingsTab inv={running} events={[verdict("exp_clock", "rejected")]} />);
    expect(within(panel).getByText("Not reported")).toBeVisible();
  });
});
