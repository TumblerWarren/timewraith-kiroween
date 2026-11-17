import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LiveAnnouncer } from "../../../a11y/LiveAnnouncer";
import { ApiProvider } from "../../../api/ApiProvider";
import type { Api } from "../../../api/client";
import type { Bug, Investigation, InvestigationSummary } from "../../../api/types";
import { FakeStorage } from "../../../cases/__tests__/helpers";
import { CaseStoreProvider } from "../../../cases/store";
import { CasePage } from "../CasePage";
import { RunGraph, stepStates } from "../parts";
import { ApiError } from "../../../api/client";
import { CASE_ADDITIONS, CASE_LIVE, CONTRIBUTION, FIX_SHARING } from "../../../content/copy";
import { bugFixture, caseFixture } from "./fixtures/caseAdditions";
import type { Contribution, FixBranch, GitHubPreview, Publish, ReplayEventMsg, Retest } from "../../../api/types";

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
    prepareContribution: vi.fn(fail),
    githubPush: vi.fn(fail),
    githubPullRequest: vi.fn(fail),
    githubUpdate: vi.fn(fail),
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

describe("Condensed run graph", () => {
  it.each([
    ["discovery", "discovering", "now", "Discovery · In progress", "/plan/discovery"],
    ["design", "awaiting-plan-approval", "waiting", "Design · Needs approval", "/plan"],
    ["execution", "experimenting", "now", "Execution · In progress", "/plan/execution"],
    ["design", "failed", "failed", "Design · Stopped", "/plan"],
    ["fix", "completed", "done", "Complete.", "/plan"],
  ] as const)("keeps the Plan node accurate during %s / %s", (phase, stage, expectedState, caption, suffix) => {
    render(<RunGraph id="inv-1" tab="plan" inv={null} states={stepStates(phase, stage, 1)} />);
    const graph = screen.getByRole("navigation", { name: "Run path" });
    expect(within(graph).getAllByRole("link")).toHaveLength(4);
    const plan = within(graph).getByRole("link", { name: /^Plan\./ });
    expect(plan).toHaveAttribute("aria-current", "location");
    expect(plan).toHaveAttribute("href", `#/cases/inv-1${suffix}`);
    expect(plan.closest("li")).toHaveAttribute("data-state", expectedState);
    expect(plan).toHaveTextContent(caption.replace(".", ""));
    expect(graph).not.toHaveTextContent("✓");
  });
});

async function openFixTools(label = "Retest and share") {
  await userEvent.setup().click(await screen.findByText(label, { exact: true, selector: "summary" }));
}

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
const contribution: Contribution = {
  prepared_at: BASE.created_at, base: "c".repeat(40), rebased: true,
  title: "fix: respect the repeated hour", body: "Prepared from the repository template.", test_path: "test/clock.spec.ts",
  rules: {
    default_branch: "main", archived: false, contributing_url: "https://github.com/example/clock/blob/main/CONTRIBUTING.md",
    template_path: ".github/PULL_REQUEST_TEMPLATE.md", conventional_commits: true, dco: true, cla: false,
    ai_policy: ["Disclose AI assistance."], test_dir: "test", test_pattern: ".spec.ts", scripts: ["lint", "test"],
  },
  notes: ["Moved the test to the repository's test directory."],
  checks: [
    { name: "Lint", command: "npm run lint", passed: true, preexisting: false, detail: "Lint passed." },
    { name: "Typecheck", command: "npm run typecheck", passed: false, preexisting: true, detail: "Same failure on the base commit." },
  ],
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
    vi.mocked(api.githubPreview).mockResolvedValue({ ...preview, ready: false, user: null, fork: null, problems: ["Connect GitHub on the Crew page"] });
    api.branchPatchUrl = () => "/case/branch.patch";
    api.patchUrl = () => "/case/patch";
    renderCase(api, "fixes");
    await openFixTools();
    expect(await screen.findByText(failure)).toBeVisible();
    expect(screen.getByRole("link", { name: FIX_SHARING.originalPatch })).toHaveAttribute("href", "/case/patch");
    expect(api.githubPreview).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: FIX_SHARING.remake }));
    expect(api.makeBranch).toHaveBeenCalledWith(BASE.id, bugFixture.id);
    const region = screen.getByRole("region", { name: FIX_SHARING.branch });
    expect(within(region).getByText(branch.commit.slice(0, 12))).toBeVisible();
    await user.click(within(region).getByRole("button", { name: FIX_SHARING.copyLabel(FIX_SHARING.log) }));
    expect(await navigator.clipboard.readText()).toBe("git -C '/work/fix clock' log -1");
    expect(within(region).getByRole("link", { name: FIX_SHARING.download })).toHaveAttribute("href", "/case/branch.patch");
    expect(screen.queryByRole("link", { name: FIX_SHARING.originalPatch })).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: FIX_SHARING.connect })).toHaveAttribute("href", "#/crew");
    expect(screen.getAllByText(FIX_SHARING.connect)).toHaveLength(1);
    expect(screen.getByRole("button", { name: FIX_SHARING.push })).toBeDisabled();
  });

  it("prepares the contribution, requires duplicate acknowledgement, and sends the edited PR copy", async () => {
    const user = userEvent.setup();
    const api = fakeApi(acceptedCase({ ...branch, path: "/data/branches/inv-1/clock" }));
    const checkedBranch = { ...branch, path: "/data/branches/inv-1/clock", commit: "c".repeat(40), contribution };
    const checkedPreview = { ...preview, contribution, warnings: ["The repository requires a sign-off."] };
    vi.mocked(api.githubPreview).mockResolvedValue({ ...preview, ready: false, contribution: null });
    let finishCheck!: (result: Contribution) => void;
    vi.mocked(api.prepareContribution).mockImplementation(() => new Promise((resolve) => { finishCheck = resolve; }));
    vi.mocked(api.githubPush).mockResolvedValue(publication);
    const pr = { ...publication, pr_url: "https://github.com/example/clock/pull/43", pr_number: 43 };
    vi.mocked(api.githubPullRequest).mockResolvedValue(pr);
    renderCase(api, "fixes");
    await openFixTools();
    expect(await screen.findByRole("link", { name: "Related open fix" })).toHaveAttribute("href", preview.duplicates[0]!.url);
    expect(screen.getByText(FIX_SHARING.dockerFolder)).toBeVisible();
    expect(screen.getByRole("button", { name: FIX_SHARING.push })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: CONTRIBUTION.check }));
    expect(api.prepareContribution).toHaveBeenCalledExactlyOnceWith(BASE.id, bugFixture.id);
    expect(screen.getByRole("button", { name: CONTRIBUTION.checking })).toBeDisabled();
    expect(screen.getByText(CONTRIBUTION.busyHelp)).toBeVisible();
    vi.mocked(api.get).mockResolvedValue(acceptedCase(checkedBranch));
    vi.mocked(api.githubPreview).mockResolvedValue(checkedPreview);
    await act(async () => finishCheck(contribution));
    const branchPanel = screen.getByRole("region", { name: FIX_SHARING.branch });
    expect(await within(branchPanel).findByText(checkedBranch.commit.slice(0, 12))).toBeVisible();
    expect(screen.getByText(CONTRIBUTION.preexisting)).toBeVisible();
    expect(screen.getByText(contribution.notes[0]!)).toBeVisible();
    expect(await screen.findByText(checkedPreview.warnings[0]!)).toBeVisible();
    await user.click(screen.getByText(CONTRIBUTION.rules, { exact: true }));
    expect(screen.getByText(contribution.rules.template_path!)).toBeVisible();
    expect(screen.getByRole("button", { name: FIX_SHARING.push })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: FIX_SHARING.readDuplicates }));
    await user.click(screen.getByRole("button", { name: FIX_SHARING.push }));
    let dialog = screen.getByRole("dialog", { name: FIX_SHARING.push });
    expect(dialog).toHaveTextContent(FIX_SHARING.confirmPush(branch.name, publication.fork));
    expect(within(dialog).getByRole("button", { name: FIX_SHARING.confirm })).toBeDisabled();
    expect(api.githubPush).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: FIX_SHARING.confirm }));
    expect(api.githubPush).toHaveBeenCalledExactlyOnceWith(BASE.id, bugFixture.id, branch.name, true);
    const title = await screen.findByLabelText(FIX_SHARING.title);
    expect(title).toHaveValue(contribution.title);
    const body = screen.getByLabelText(FIX_SHARING.description);
    expect(body).toHaveValue(contribution.body);
    await user.clear(title);
    await user.paste("Fix the repeated hour");
    await user.clear(body);
    await user.paste("Reviewed the related pull request.");
    const open = screen.getByRole("button", { name: FIX_SHARING.pullRequest });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    dialog = screen.getByRole("dialog", { name: FIX_SHARING.pullRequest });
    expect(dialog).toHaveTextContent(FIX_SHARING.confirmPr(preview.upstream));
    expect(api.githubPullRequest).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: FIX_SHARING.confirm }));
    expect(api.githubPullRequest).toHaveBeenCalledExactlyOnceWith(BASE.id, bugFixture.id, "Fix the repeated hour", "Reviewed the related pull request.", branch.name, true);
    expect(await screen.findByRole("link", { name: FIX_SHARING.result })).toHaveAttribute("href", pr.pr_url);
    expect(vi.mocked(api.githubPreview).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps push disabled when repository checks introduce a failure", async () => {
    const rejected = { ...contribution, checks: [{ ...contribution.checks[0]!, passed: false, detail: "New lint failure." }] };
    const api = fakeApi(acceptedCase({ ...branch, contribution: rejected }));
    vi.mocked(api.githubPreview).mockResolvedValue({ ...preview, ready: false, contribution: rejected, duplicates: [] });
    renderCase(api, "fixes");
    await openFixTools();
    expect(await screen.findByText("New lint failure.")).toBeVisible();
    expect(await screen.findByRole("button", { name: FIX_SHARING.push })).toBeDisabled();
    expect(api.githubPush).not.toHaveBeenCalled();
  });

  it("maps an upstream fix error and prevents an earlier preparation from being published", async () => {
    const user = userEvent.setup();
    const api = fakeApi(acceptedCase({ ...branch, contribution }));
    vi.mocked(api.githubPreview).mockResolvedValue({ ...preview, contribution, duplicates: [] });
    vi.mocked(api.prepareContribution).mockRejectedValue(new ApiError("already_fixed_upstream", "backend detail"));
    renderCase(api, "fixes");
    await openFixTools();
    expect(await screen.findByRole("button", { name: FIX_SHARING.push })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: CONTRIBUTION.check }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FIX_SHARING.errors.already_fixed_upstream);
    expect(screen.getByRole("button", { name: FIX_SHARING.push })).toBeDisabled();
  });

  it("keeps the saved PR link when GitHub preview fails after reload", async () => {
    const pr = { ...publication, pr_url: "https://github.com/example/clock/pull/43", pr_number: 43 };
    const api = fakeApi(acceptedCase(branch, pr));
    vi.mocked(api.githubPreview).mockRejectedValue(new ApiError("github_not_connected", "backend detail"));
    renderCase(api, "fixes");
    await openFixTools();
    expect(await screen.findByRole("link", { name: FIX_SHARING.result })).toHaveAttribute("href", pr.pr_url);
    expect(await screen.findByRole("alert")).toHaveTextContent(FIX_SHARING.errors.github_not_connected);
  });

  it("adds a commit to the existing PR only after confirmation and shows the latest update record", async () => {
    const user = userEvent.setup();
    const pr = { ...publication, pr_url: "https://github.com/example/clock/pull/43", pr_number: 43, updates: 1 };
    const rebuilt = { ...branch, commit: "c".repeat(40), contribution };
    const available = {
      ...preview, contribution, published: pr,
      update: { available: true, reason: "The branch was rebuilt since it was pushed" },
    };
    const updated = {
      ...pr, updates: 2, updated_at: "2026-11-17T11:00:00Z",
      update_note: "The branch was updated, but the pull request's title and text could not be changed",
    };
    const api = fakeApi(acceptedCase(rebuilt, pr));
    vi.mocked(api.githubPreview).mockResolvedValue(available);
    let finishUpdate!: (record: Publish) => void;
    vi.mocked(api.githubUpdate).mockImplementation(() => new Promise((resolve) => { finishUpdate = resolve; }));
    renderCase(api, "fixes");
    await openFixTools();

    const update = await screen.findByRole("button", { name: FIX_SHARING.update });
    expect(update).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: FIX_SHARING.readDuplicates })).not.toBeInTheDocument();
    const title = screen.getByLabelText(FIX_SHARING.title);
    const body = screen.getByLabelText(FIX_SHARING.description);
    expect(title).toHaveValue(contribution.title);
    expect(body).toHaveValue(contribution.body);
    await user.clear(title);
    await user.paste("Revised patch");
    await user.clear(body);
    await user.paste("Includes a second regression test.");
    await user.click(update);
    let dialog = screen.getByRole("dialog", { name: FIX_SHARING.update });
    expect(dialog).toHaveTextContent(FIX_SHARING.confirmUpdate(branch.name, preview.upstream, pr.pr_number));
    await user.click(within(dialog).getByRole("button", { name: FIX_SHARING.cancel }));
    expect(api.githubUpdate).not.toHaveBeenCalled();
    await user.click(update);
    dialog = screen.getByRole("dialog", { name: FIX_SHARING.update });
    expect(within(dialog).getByRole("button", { name: FIX_SHARING.confirm })).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: FIX_SHARING.confirm }));
    expect(api.githubUpdate).toHaveBeenCalledExactlyOnceWith(BASE.id, bugFixture.id, "Revised patch", "Includes a second regression test.", branch.name);
    expect(screen.getByText(FIX_SHARING.updating)).toBeVisible();
    vi.mocked(api.githubPreview).mockResolvedValue({ ...available, update: { available: false, reason: "The fork already has this version" } });
    await act(async () => finishUpdate(updated));

    const note = await screen.findByText(updated.update_note);
    const history = note.closest(".case-share__history") as HTMLElement;
    expect(within(history).getByText("2", { exact: true })).toBeVisible();
    expect(history.querySelector("time")).toHaveAttribute("datetime", updated.updated_at);
    expect(screen.getByRole("link", { name: FIX_SHARING.result })).toHaveAttribute("href", pr.pr_url);
    expect(screen.queryByRole("button", { name: FIX_SHARING.update })).not.toBeInTheDocument();
  });

  it("hides the update action when a newer branch has no pull request", async () => {
    const rebuilt = { ...branch, commit: "c".repeat(40), contribution };
    const api = fakeApi(acceptedCase(rebuilt, publication));
    vi.mocked(api.githubPreview).mockResolvedValue({
      ...preview, contribution, published: publication, duplicates: [],
      update: { available: true, reason: "The branch was rebuilt since it was pushed" },
    });
    renderCase(api, "fixes");
    await openFixTools();
    await waitFor(() => expect(screen.getByRole("button", { name: FIX_SHARING.pullRequest })).toBeEnabled());
    expect(screen.queryByRole("button", { name: FIX_SHARING.update })).not.toBeInTheDocument();
  });

  it("explains a closed PR and keeps the edited draft", async () => {
    const user = userEvent.setup();
    const pr = { ...publication, pr_url: "https://github.com/example/clock/pull/43", pr_number: 43 };
    const api = fakeApi(acceptedCase({ ...branch, contribution }, pr));
    vi.mocked(api.githubPreview).mockResolvedValue({
      ...preview, contribution, published: pr,
      update: { available: true, reason: "The branch was rebuilt since it was pushed" },
    });
    vi.mocked(api.githubUpdate).mockRejectedValue(new ApiError("pr_closed", "backend detail"));
    renderCase(api, "fixes");
    await openFixTools();
    const update = await screen.findByRole("button", { name: FIX_SHARING.update });
    const title = screen.getByLabelText(FIX_SHARING.title);
    await user.type(title, " with evidence");
    await user.click(update);
    const dialog = screen.getByRole("dialog", { name: FIX_SHARING.update });
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: FIX_SHARING.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FIX_SHARING.errors.pr_closed);
    expect(title).toHaveValue(`${contribution.title} with evidence`);
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
    await act(async () => replay({ ...event, data: { bug_id: bug.id, attempt: 1, gate: "test_first", passed: false, detail: "Baseline assertion was missing" } }));
    const verification = screen.getByRole("region", { name: "Patch verification" });
    expect(within(verification).getByText("Failed.")).toBeInTheDocument();
    await user.click(screen.getByText("View verification", { exact: true }));
    expect(screen.getByText("Baseline assertion was missing", { exact: false })).toBeVisible();
    expect(screen.getAllByText("Not run:")).toHaveLength(7);
    await act(async () => replay({ ...event, id: "finish", seq: 2, kind: "fix", text: "Attempt 1 rejected by the gates", data: { bug_id: bug.id } }));
    expect(screen.getByText("Baseline assertion was missing", { exact: false })).toBeVisible();
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
    await openFixTools(bugFixture.fix.user_decision === "accepted" ? "Retest and share" : "Retest");
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
    await openFixTools(bugFixture.fix.user_decision === "accepted" ? "Retest and share" : "Retest");
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
    expect(screen.getByRole("heading", { name: "Run details" })).toBeVisible();
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
    expect(screen.getByRole("button", { name: "matchNext skips the repeated hour" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "DST fall-back skips an hour" }));
    expect(screen.getByText("1203 changed lines (limit 60)")).not.toBeVisible();
    await user.click(screen.getByText("View verification"));
    const gates = screen.getAllByRole("list").find((l) => l.classList.contains("checks--gates")) as HTMLElement;
    expect(within(gates).getAllByRole("listitem")).toHaveLength(8);
    expect(within(gates).getByText(/1203 changed lines/)).toBeInTheDocument();
    expect(within(gates).getAllByText("Not run:")).toHaveLength(6);
  });
});
