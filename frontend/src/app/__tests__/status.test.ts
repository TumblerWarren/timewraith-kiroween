import { describe, expect, it } from "vitest";
import type { Bug, Investigation, InvestigationSummary, ReplayEventMsg } from "../../api/types";
import { liveFromSummary } from "../../cases/model";
import { NO_ANOMALY } from "../../content/copy";
import { caseState, failureText, resultLine, suggestedRef } from "../status";

const SUMMARY: InvestigationSummary = {
  id: "inv-1",
  created_at: "2026-11-11T10:00:00Z",
  target: { repository_url: "https://github.com/acme/app", owner: "acme", repo: "app", ref: "main", revision: null },
  mode: "open-hunt",
  stage: "queued",
  phase: "repository",
  status: "planned",
  bug_count: 0,
  replay_label: "Live",
  runtime_label: "Kiro Crew",
};
const live = (over: Partial<InvestigationSummary>) => liveFromSummary({ ...SUMMARY, ...over });

const bug = (state: Bug["fix"]["state"], attempts = 0, decision: Bug["fix"]["user_decision"] = "pending") =>
  ({ id: `b-${state}-${attempts}`, fix: { state, label: "", attempts: Array.from({ length: attempts }, () => ({})), user_decision: decision } }) as unknown as Bug;

const inv = (over: Partial<Investigation>) =>
  ({ id: "inv-1", stage: "fixing", error: null, notes: [], bugs: [], ...over }) as unknown as Investigation;

describe("case state", () => {
  it("maps stages to one of seven states with a reason", () => {
    expect(caseState(live({ stage: "queued" })).id).toBe("queued");
    expect(caseState(live({ stage: "discovering" }))).toMatchObject({ id: "running", detail: "Finding time-sensitive code", mascot: "bat-scout" });
    expect(caseState(live({ stage: "awaiting-plan-approval" })).id).toBe("waiting");
    expect(caseState(live({ stage: "cancelled" })).id).toBe("cancelled");
    expect(caseState(live({ stage: "completed", bug_count: 0 })).detail).toBe(NO_ANOMALY);
    expect(caseState(live({ stage: "completed", bug_count: 2, fix_verified_count: 1 })).detail).toBe("2 bugs reproduced · 1 fix verified");
  });

  it("says which bug and attempt the fix step is on", () => {
    const fixing = inv({ bugs: [bug("no-safe-fix", 3), bug("in-progress", 1)] });
    expect(caseState(live({ stage: "fixing" }), fixing).detail).toBe("Fixing bug 2 of 2 · attempt 2 of 3");
    const events = [
      { seq: 1, kind: "tool", data: { bug_id: "b-in-progress-1", attempt: 2, calls: 7, max_calls: 30 } },
      { seq: 2, kind: "tool", data: { bug_id: "b-in-progress-1", attempt: 1, calls: 29, max_calls: 30 } },
    ] as unknown as ReplayEventMsg[];
    expect(caseState(live({ stage: "fixing" }), fixing, 3, events).detail).toBe("Fixing bug 2 of 2 · attempt 2 of 3 · 7 of 30 tool calls");
  });

  it("waits for you when a verified fix has not been accepted or rejected", () => {
    const s = caseState(live({ stage: "completed" }), inv({ stage: "completed", bugs: [bug("verified", 1)] }));
    expect(s.id).toBe("waiting");
    expect(caseState(live({ stage: "completed" }), inv({ stage: "completed", bugs: [bug("verified", 1, "accepted")] })).id).toBe("done");
  });

  it("explains a failure in words and offers the default branch", () => {
    const msg = "Ref 'master' not found. The default branch is 'main'.";
    const s = caseState(live({ stage: "failed", error: "ref_not_found", message: msg }));
    expect(s).toMatchObject({ id: "failed", detail: msg });
    expect(suggestedRef(msg)).toBe("main");
    expect(failureText("sandbox_unavailable", "Docker is not available")).toMatch(/Docker is not running/);
    expect(failureText(null, null)).toBe("The investigation stopped.");
  });

  it("does not call a case done when the Kiro usage limit stopped the agents", () => {
    const note = "Kiro usage limit reached for this account. Agent steps cannot run until the limit resets or the plan changes.";
    const s = caseState(live({ stage: "completed" }), inv({ stage: "completed", notes: [note] }));
    expect(s).toMatchObject({ id: "failed", label: "Agents stopped" });
    expect(s.detail).toContain("usage limit reached");
    expect(s.detail).not.toContain("No anomaly observed");
  });

  it("writes the result line, naming intended behaviour instead of calling it a bug", () => {
    expect(resultLine(1, 0)).toBe("1 bug reproduced · 0 fixes verified");
    expect(resultLine(0, 0, 2)).toBe("No bugs: 2 findings are intended behaviour the repository documents");
    expect(caseState(live({ stage: "completed", bug_count: 0, intended_count: 1 })).detail).toMatch(/^No bugs: 1 finding is intended/);
  });
});
