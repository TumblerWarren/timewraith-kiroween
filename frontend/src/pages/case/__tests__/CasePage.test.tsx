import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveAnnouncer } from "../../../a11y/LiveAnnouncer";
import { ApiProvider } from "../../../api/ApiProvider";
import type { Api } from "../../../api/client";
import type { Bug, Investigation, InvestigationSummary } from "../../../api/types";
import { FakeStorage } from "../../../cases/__tests__/helpers";
import { CaseStoreProvider } from "../../../cases/store";
import { CasePage } from "../CasePage";

const BASE: Investigation = {
  id: "inv-1",
  created_at: "2026-11-11T10:00:00Z",
  request: { repository_url: "https://github.com/node-cron/node-cron", ref: "master", mode: "open-hunt", issue_url: null, area: null, auto: false },
  target: { repository_url: "https://github.com/node-cron/node-cron", owner: "node-cron", repo: "node-cron", ref: "master", revision: null },
  stage: "failed",
  phase: "repository",
  error: "ref_not_found",
  status: "planned",
  runtime_label: "Kiro Crew",
  replay_label: "Live",
  capabilities: null,
  feature_map: null,
  test_plan: null,
  bugs: [],
  sweeps: [],
  decisions: [],
  budget: { agent_calls: 0, active_seconds: 1 },
  notes: ["Ref 'master' not found. The default branch is 'main'."],
};

const NEXT: InvestigationSummary = {
  id: "inv-2",
  created_at: "2026-11-11T10:05:00Z",
  target: { ...BASE.target, ref: "main" },
  mode: "open-hunt",
  stage: "queued",
  phase: "repository",
  status: "planned",
  bug_count: 0,
  replay_label: "Live",
  runtime_label: "Kiro Crew",
};

function fakeApi(inv: Investigation): Api {
  const fail = async (): Promise<never> => Promise.reject(new Error("unused"));
  return {
    health: async () => ({ gateway: "connected", agent_runtime: { name: "kiro-crew", label: "Kiro Crew" }, sandbox: { available: true, detail: "" }, git: true }),
    flow: async () => [],
    list: async () => [],
    get: vi.fn(async () => inv),
    create: vi.fn(async () => NEXT),
    approvePlan: vi.fn(async () => NEXT),
    cancel: vi.fn(async () => NEXT),
    decideFix: fail,
    patchUrl: () => "",
    events: () => () => undefined,
    setup: fail,
    startDocker: fail,
    startCrew: fail,
    startLogin: fail,
    logout: fail,
  };
}

const renderCase = (api: Api, tab: "overview" | "fixes" = "overview") =>
  render(
    <LiveAnnouncer>
      <ApiProvider api={api}>
        <CaseStoreProvider storage={new FakeStorage()}>
          <CasePage id="inv-1" tab={tab} />
        </CaseStoreProvider>
      </ApiProvider>
    </LiveAnnouncer>,
  );

afterEach(() => {
  window.location.hash = "";
});

describe("Case page", () => {
  it("says why a case failed and retries it on the default branch", async () => {
    const user = userEvent.setup();
    const api = fakeApi(BASE);
    renderCase(api);
    const banner = await screen.findByRole("region", { name: /Failed/ });
    expect(within(banner).getByText("Ref 'master' not found. The default branch is 'main'.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Investigation steps" }).querySelector('[data-state="failed"]')).toHaveTextContent("Repository");
    await user.click(within(banner).getByRole("button", { name: "Retry with main" }));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ ref: "main", repository_url: BASE.request.repository_url }));
    expect(window.location.hash).toBe("#/cases/inv-2");
  });

  it("shows which bug and attempt the fix step is on, and the eight gates of each attempt", async () => {
    const attempt = {
      attempt: 1,
      summary: "Advance by a second",
      root_cause: "x",
      diff: "",
      gates: [
        { gate: "test_first", passed: true, detail: "Repeated 3/3" },
        { gate: "diff_limits", passed: false, detail: "1203 changed lines (limit 60)" },
      ],
      accepted_by_gates: false,
    };
    const bugs = [
      { id: "b1", title: "DST fall-back skips an hour", fix: { state: "no-safe-fix", label: "No safe fix found", attempts: [attempt], user_decision: "pending" } },
      { id: "b2", title: "matchNext skips the repeated hour", fix: { state: "in-progress", label: "Fix in progress", attempts: [], user_decision: "pending" } },
    ].map((b) => ({ ...b, category: "dst", invariant: "next_after_now", status: "reproduced", violation: { invariant: "", zone: "", instant: "", local: "", detail: "", count: 1 }, evidence: [], regression_test_path: "t.test.ts", regression_test: "", issue_match: null, issue_match_label: "No matching public issue found" })) as unknown as Bug[];
    const inv: Investigation = { ...BASE, stage: "fixing", phase: "fix", error: null, notes: [], status: "reproduced", bugs };
    renderCase(fakeApi(inv), "fixes");
    const banner = await screen.findByRole("region", { name: /Running/ });
    expect(within(banner).getByText("Fixing bug 2 of 2 · attempt 1 of 3")).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    const gates = screen.getAllByRole("list").find((l) => l.classList.contains("checks--gates")) as HTMLElement;
    expect(within(gates).getAllByRole("listitem")).toHaveLength(8);
    expect(within(gates).getByText(/1203 changed lines/)).toBeInTheDocument();
    expect(within(gates).getAllByText("Not run:")).toHaveLength(6);
  });
});
