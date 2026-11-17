import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LiveAnnouncer } from "../../../a11y/LiveAnnouncer";
import { ApiProvider } from "../../../api/ApiProvider";
import type { Api } from "../../../api/client";
import type { Bug, Investigation, InvestigationSummary } from "../../../api/types";
import { FakeStorage } from "../../../cases/__tests__/helpers";
import { CaseStoreProvider } from "../../../cases/store";
import { CasePage } from "../CasePage";
import { ApiError } from "../../../api/client";
import { CASE_ADDITIONS, CASE_LIVE, FIX_SHARING } from "../../../content/copy";
import { bugFixture, caseFixture } from "./fixtures/caseAdditions";
import type { FixBranch, GitHubPreview, Publish, ReplayEventMsg, Retest } from "../../../api/types";

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
    retest: vi.fn(fail),
    branchPatchUrl: () => "",
    makeBranch: vi.fn(fail),
    githubPreview: vi.fn(fail),
    githubPush: vi.fn(fail),
    githubPullRequest: vi.fn(fail),
    githubStart: vi.fn(fail),
    githubLogin: vi.fn(fail),
    githubCancel: vi.fn(fail),
    githubLogout: vi.fn(fail),
    patchUrl: () => "",
    events: () => () => undefined,
    setup: fail,
    startDocker: fail,
    startCrew: fail,
    startLogin: fail,
    cancelLogin: fail,
    logout: fail,
    deleteCrew: fail,
    deleteCase: vi.fn(async (id: string) => ({ deleted: id })),
  };
}

const renderCase = (api: Api, tab: "overview" | "fixes" | "findings" | "activity" = "overview") =>
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

const branch: FixBranch = {
  name: "timewraith/fix-clock", path: "/work/fix clock", base: "a".repeat(40), commit: "b".repeat(40),
  files: ["src/clock.ts", "tests/clock.test.ts"], created_at: BASE.created_at, patch_file: "/work/file.patch",
  upstream_url: "https://github.com/example/clock",
};
const publication: Publish = {
  fork: "reviewer/clock", branch: branch.name, commit: branch.commit, pushed_at: BASE.created_at,
  pr_url: null, pr_number: null, pr_opened_at: null,
};
const preview: GitHubPreview = {
  ready: true, upstream: "example/clock", fork: publication.fork, user: "reviewer", branch: branch.name,
  title: "Fix clock regression", body: "Verified in a sandbox.\nRegression test included.", files: branch.files, published: null,
  problems: [], duplicates: [{ number: 42, title: "Related open fix", url: "https://github.com/example/clock/pull/42", state: "OPEN" }],
};
function acceptedCase(fixBranch: FixBranch | null, publish: Publish | null = null): Investigation {
  return {
    ...caseFixture,
    id: BASE.id,
    bugs: [{ ...bugFixture, fix: { state: "verified", label: "Verified", user_decision: "accepted", branch: fixBranch, publish, attempts: [] } }],
  };
}

describe("Accepted fix branch and sharing", () => {
  const shimDialog = typeof HTMLDialogElement.prototype.showModal !== "function";
  beforeAll(() => {
    // jsdom has no modal behavior. Chrome verification covers focus and Escape.
    if (!shimDialog) return;
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
  });
  afterAll(() => {
    if (!shimDialog) return;
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  it("shows the saved failure, remakes the branch and exposes copy and patch actions", async () => {
    const user = userEvent.setup();
    const failure = `The fix for ${bugFixture.id} was accepted, but its branch could not be made: workspace moved`;
    const api = fakeApi({ ...acceptedCase(null), notes: [failure] });
    vi.mocked(api.makeBranch).mockResolvedValue(branch);
    vi.mocked(api.githubPreview).mockResolvedValue({ ...preview, ready: false, user: null, fork: null, problems: ["GitHub is disconnected"] });
    api.branchPatchUrl = () => "/case/branch.patch";
    renderCase(api, "fixes");
    expect(await screen.findByText(failure)).toBeVisible();
    expect(api.githubPreview).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: FIX_SHARING.remake }));
    expect(api.makeBranch).toHaveBeenCalledWith(BASE.id, bugFixture.id);
    const region = screen.getByRole("region", { name: FIX_SHARING.branch });
    expect(within(region).getByText(branch.commit.slice(0, 12))).toBeVisible();
    await user.click(within(region).getByRole("button", { name: FIX_SHARING.copyLabel(FIX_SHARING.log) }));
    expect(await navigator.clipboard.readText()).toBe("git -C '/work/fix clock' log -1");
    expect(within(region).getByRole("link", { name: FIX_SHARING.download })).toHaveAttribute("href", "/case/branch.patch");
    expect(await screen.findByRole("link", { name: FIX_SHARING.connect })).toHaveAttribute("href", "#/crew");
    expect(screen.getByRole("button", { name: FIX_SHARING.push })).toBeDisabled();
  });

  it("requires separate confirmations, sends the branch and edited PR copy, and refreshes the preview", async () => {
    const user = userEvent.setup();
    const api = fakeApi(acceptedCase(branch));
    vi.mocked(api.githubPreview).mockResolvedValue(preview);
    vi.mocked(api.githubPush).mockResolvedValue(publication);
    const pr = { ...publication, pr_url: "https://github.com/example/clock/pull/43", pr_number: 43 };
    vi.mocked(api.githubPullRequest).mockResolvedValue(pr);
    renderCase(api, "fixes");
    expect(await screen.findByRole("link", { name: "Related open fix" })).toHaveAttribute("href", preview.duplicates[0]!.url);
    await user.click(screen.getByRole("button", { name: FIX_SHARING.push }));
    let dialog = screen.getByRole("dialog", { name: FIX_SHARING.push });
    expect(dialog).toHaveTextContent(FIX_SHARING.confirmPush(branch.name, publication.fork));
    expect(within(dialog).getByRole("button", { name: FIX_SHARING.confirm })).toBeDisabled();
    expect(api.githubPush).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: FIX_SHARING.confirm }));
    expect(api.githubPush).toHaveBeenCalledExactlyOnceWith(BASE.id, bugFixture.id, branch.name);
    const title = await screen.findByLabelText(FIX_SHARING.title);
    expect(title).toHaveValue(preview.title);
    expect(screen.getByLabelText(FIX_SHARING.description)).toHaveValue(preview.body);
    await user.clear(title);
    await user.type(title, "Fix the repeated hour");
    await user.click(screen.getByRole("button", { name: FIX_SHARING.pullRequest }));
    dialog = screen.getByRole("dialog", { name: FIX_SHARING.pullRequest });
    expect(dialog).toHaveTextContent(FIX_SHARING.confirmPr(preview.upstream));
    expect(api.githubPullRequest).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: FIX_SHARING.confirm }));
    expect(api.githubPullRequest).toHaveBeenCalledExactlyOnceWith(BASE.id, bugFixture.id, "Fix the repeated hour", preview.body, branch.name);
    expect(await screen.findByRole("link", { name: FIX_SHARING.result })).toHaveAttribute("href", pr.pr_url);
    expect(api.githubPreview).toHaveBeenCalledTimes(3);
  });

  it("keeps the saved PR link when GitHub preview fails after reload", async () => {
    const pr = { ...publication, pr_url: "https://github.com/example/clock/pull/43", pr_number: 43 };
    const api = fakeApi(acceptedCase(branch, pr));
    vi.mocked(api.githubPreview).mockRejectedValue(new ApiError("github_not_connected", "backend detail"));
    renderCase(api, "fixes");
    expect(await screen.findByRole("link", { name: FIX_SHARING.result })).toHaveAttribute("href", pr.pr_url);
    expect(await screen.findByRole("alert")).toHaveTextContent(FIX_SHARING.errors.github_not_connected);
  });
});

describe("Live case updates", () => {
  it("shows the newest event, tool progress and Kiro banner, then replaces progress on dispatch", async () => {
    const api = fakeApi({ ...caseFixture, id: BASE.id, stage: "verifying", notes: ["Kiro rejected the Crew's sign-in."] });
    let replay!: (event: ReplayEventMsg) => void;
    api.events = (_id, onEvent) => { replay = onEvent; return () => {}; };
    renderCase(api);
    const now = await screen.findByRole("region", { name: CASE_LIVE.now });
    const event = { id: "tool", seq: 1, kind: "tool", phase: "verification", actor: "raven-archivist", text: "Read the regression test", status: "planned" } as const;
    await act(async () => replay({ ...event, data: { calls: 12, max_calls: 30 } }));
    expect(within(now).getByText(CASE_LIVE.live)).toBeVisible();
    expect(within(now).getByRole("progressbar", { name: CASE_LIVE.progress(12, 30) })).toHaveValue(12);
    expect(screen.getByLabelText(CASE_LIVE.accountTitle)).toHaveTextContent("Kiro rejected the Crew's sign-in.");
    await act(async () => replay({ ...event, id: "dispatch", seq: 2, kind: "dispatch", text: "Review next candidate" }));
    expect(now).toHaveTextContent("Review next candidate");
    expect(within(now).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("adds a finished attempt from stream events and keeps its open verification across the saved update", async () => {
    const user = userEvent.setup();
    const bug: Bug = { ...bugFixture, fix: { ...bugFixture.fix, state: "in-progress" } };
    const inv: Investigation = { ...caseFixture, id: BASE.id, stage: "fixing", bugs: [bug] };
    const api = fakeApi(inv);
    let replay!: (event: ReplayEventMsg) => void;
    api.events = (_id, onEvent) => { replay = onEvent; return () => {}; };
    renderCase(api, "fixes");
    await screen.findByRole("region", { name: "Suggested fixes" });
    const event = { id: "gate", seq: 1, phase: "fix", actor: "watchtower-warden", kind: "gate", text: "Gate failed", status: "planned" } as const;
    await act(async () => {
      replay({ ...event, data: { bug_id: bug.id, attempt: 1, gate: "test_first", passed: false, detail: "Baseline assertion was missing" } });
      replay({ ...event, id: "finish", seq: 2, kind: "fix", text: "Attempt 1 rejected by the gates", data: { bug_id: bug.id } });
    });
    await user.click(screen.getByText("View verification", { exact: true }));
    expect(screen.getByText("Baseline assertion was missing", { exact: false })).toBeVisible();
    expect(screen.getAllByText("Not run:")).toHaveLength(7);
    vi.mocked(api.get).mockResolvedValue({ ...inv, bugs: [{ ...bug, fix: { ...bug.fix, attempts: [{
      attempt: 1, summary: "Saved attempt", root_cause: "", diff: "", accepted_by_gates: false,
      gates: [{ gate: "test_first", passed: false, detail: "Saved gate detail" }],
    }] } }] });
    expect(await screen.findByText("Saved gate detail", { exact: false })).toBeVisible();
  });
});

describe("Case page", () => {
  it("retests once while busy, refreshes the case, and shows the newest result first", async () => {
    const user = userEvent.setup();
    const inv = { ...caseFixture, id: BASE.id };
    const result: Retest = { at: "2026-11-17T10:00:00Z", ref: "pull/999", revision: "9876543210abcdef", outcome: "cannot_confirm", detail: "The revision could not execute the existing regression test." };
    const api = fakeApi(inv);
    vi.mocked(api.get).mockResolvedValueOnce(inv).mockResolvedValue({ ...inv, bugs: [{ ...bugFixture, retests: [...bugFixture.retests!, result] }] });
    let resolve!: (value: Retest) => void;
    vi.mocked(api.retest).mockImplementation(() => new Promise<Retest>((done) => { resolve = done; }));
    renderCase(api, "fixes");
    const form = await screen.findByRole("region", { name: CASE_ADDITIONS.retest.title });
    await user.type(within(form).getByLabelText(CASE_ADDITIONS.retest.ref), "  pull/999  ");
    await user.click(within(form).getByRole("button", { name: CASE_ADDITIONS.retest.submit }));
    expect(within(form).getByRole("button", { name: CASE_ADDITIONS.retest.busy })).toBeDisabled();
    expect(within(form).getByRole("textbox")).toBeDisabled();
    expect(within(form).getByRole("status")).toHaveTextContent(CASE_ADDITIONS.retest.waiting);
    expect(api.retest).toHaveBeenCalledExactlyOnceWith(BASE.id, bugFixture.id, "pull/999");
    await act(async () => resolve(result));
    expect(await within(form).findByText("pull/999")).toBeVisible();
    expect(api.get).toHaveBeenCalledTimes(2);
    const history = within(form).getAllByRole("listitem");
    expect(history[0]).toHaveTextContent("Cannot confirm");
    expect(history[0]).toHaveTextContent("9876543210ab");
    expect(history[1]).toHaveTextContent("pull/453");
    expect(history[2]).toHaveTextContent("Still reproducible");
  });

  it.each(["busy", "not_found", "workspace_missing", "sandbox_unavailable", "invalid_ref"])("shows the backend retest message for %s and allows retry", async (code) => {
    const user = userEvent.setup();
    const api = fakeApi({ ...caseFixture, id: BASE.id });
    vi.mocked(api.retest).mockRejectedValue(new ApiError(code, `Backend detail: ${code}`));
    renderCase(api, "fixes");
    const form = await screen.findByRole("region", { name: CASE_ADDITIONS.retest.title });
    await user.type(within(form).getByRole("textbox"), "master");
    await user.click(within(form).getByRole("button", { name: CASE_ADDITIONS.retest.submit }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(`Backend detail: ${code}`);
    expect(within(form).getByRole("button", { name: CASE_ADDITIONS.retest.submit })).toBeEnabled();
  });

  it("deletes a stopped case only after confirmation", async () => {
    const user = userEvent.setup();
    const api = fakeApi(BASE);
    renderCase(api);
    await user.click(await screen.findByRole("button", { name: /Delete case/ }));
    expect(api.deleteCase).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep case" }));
    expect(api.deleteCase).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Delete case/ }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(api.deleteCase).toHaveBeenCalledWith(BASE.id);
    expect(window.location.hash).toBe("#/cases");
  });

  it("requires a running case to stop before deletion", async () => {
    renderCase(fakeApi({ ...BASE, stage: "discovering" }));
    expect(await screen.findByRole("button", { name: /Delete case/ })).toBeDisabled();
    expect(screen.getByText(/wait for the case to stop before deleting/)).toBeInTheDocument();
  });

  it("keeps a case open when deletion fails", async () => {
    const user = userEvent.setup();
    const api = fakeApi(BASE);
    vi.mocked(api.deleteCase).mockRejectedValue(new Error("Case files are in use"));
    renderCase(api);
    await user.click(await screen.findByRole("button", { name: /Delete case/ }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Case files are in use");
    expect(window.location.hash).not.toBe("#/cases");
  });

  it("says why a case failed and retries it on the default branch", async () => {
    const user = userEvent.setup();
    const api = fakeApi(BASE);
    renderCase(api);
    const banner = await screen.findByRole("region", { name: /Failed/ });
    expect(within(banner).getByText("Ref 'master' not found. The default branch is 'main'.")).toBeInTheDocument();
    await user.click(screen.getByText("Run details"));
    expect(screen.getByRole("list", { name: "Investigation steps" }).querySelector('[data-state="failed"]')).toHaveTextContent("Repository");
    await user.click(within(banner).getByRole("button", { name: "Retry with main" }));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ ref: "main", repository_url: BASE.request.repository_url }));
    expect(window.location.hash).toBe("#/cases/inv-2");
  });

  it("shows which bug and attempt the fix step is on, and the eight gates of each attempt", async () => {
    const user = userEvent.setup();
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
    expect(screen.getByText("1203 changed lines (limit 60)")).not.toBeVisible();
    await user.click(screen.getByText("View verification"));
    const gates = screen.getAllByRole("list").find((l) => l.classList.contains("checks--gates")) as HTMLElement;
    expect(within(gates).getAllByRole("listitem")).toHaveLength(8);
    expect(within(gates).getByText(/1203 changed lines/)).toBeInTheDocument();
    expect(within(gates).getAllByText("Not run:")).toHaveLength(6);
  });
});
