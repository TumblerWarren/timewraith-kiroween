import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAnnouncer } from "../../../a11y/LiveAnnouncer";
import { ApiProvider } from "../../../api/ApiProvider";
import { ApiError, type Api } from "../../../api/client";
import type { InvestigationSummary } from "../../../api/types";
import { DRAFT_CREATED, DRAFT_NOT_RUN, LIVE_CASE_STARTED, NOT_SAVED } from "../../../content/copy";
import { FORM_LABELS, FORM_LIMIT_REACHED, FORM_NOTE_OFFLINE, FORM_NOTE_ONLINE, FORM_SUBMIT, FORM_SUMMARY_HEADING } from "../../../content/form";
import { CaseStoreProvider } from "../../store";
import { DRAFTS_KEY, MAX_DRAFTS } from "../../drafts/storage";
import { newDraftId } from "../../drafts/ids";
import { CaseList, FakeStorage, renderBoard } from "../../__tests__/helpers";
import { ERRORS } from "../validate";
import { OpenCaseForm } from "../OpenCaseForm";

/** Open_Case_Form component tests: offline drafts and real investigations through a fake backend. */

const fetchSpy = vi.fn();
const sendBeaconSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", vi.fn());
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeaconSpy, configurable: true });
  fetchSpy.mockClear();
  sendBeaconSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const field = (label: string) => screen.getByLabelText(label, { exact: false, selector: "input, textarea" });

function seed(storage: FakeStorage, n: number) {
  const drafts = Array.from({ length: n }, (_, i) => ({
    id: newDraftId(1_700_000_000_000 + i, () => "abcd"),
    createdAt: new Date(1_700_000_000_000 + i).toISOString(),
    mode: "open-hunt",
    target: { kind: "repository", repoUrl: `https://github.com/acme/app${i}`, version: { kind: "ref", value: "main" } },
  }));
  storage.map.set(DRAFTS_KEY, JSON.stringify({ schemaVersion: 1, drafts }));
}

const SUMMARY: InvestigationSummary = {
  id: "inv-1",
  created_at: "2026-11-11T10:00:00.000Z",
  target: { repository_url: "https://github.com/acme/app.git", owner: "acme", repo: "app", ref: "v1.2.3", revision: null },
  mode: "open-hunt",
  stage: "queued",
  phase: "repository",
  status: "planned",
  bug_count: 0,
  replay_label: "Live",
  runtime_label: "Stub runtime, not a Kiro Crew run",
};

function fakeApi(over: Partial<Api> = {}): Api {
  return {
    health: async () => ({ gateway: "connected", agent_runtime: { name: "stub", label: "Stub" }, sandbox: { available: true, detail: "" }, git: true }),
    flow: async () => [],
    list: async () => [],
    get: async () => {
      throw new ApiError("not_found", "Investigation not found");
    },
    create: vi.fn(async () => SUMMARY),
    approvePlan: async () => SUMMARY,
    cancel: async () => SUMMARY,
    decideFix: async () => SUMMARY,
    patchUrl: () => "",
    events: () => () => undefined,
    setup: async () => Promise.reject(new Error("unused")),
    startDocker: async () => Promise.reject(new Error("unused")),
    startCrew: async () => Promise.reject(new Error("unused")),
    startLogin: async () => Promise.reject(new Error("unused")),
    logout: async () => Promise.reject(new Error("unused")),
    ...over,
  };
}

function renderOnline(api: Api, storage = new FakeStorage()) {
  const wrap = (children: ReactNode) => (
    <LiveAnnouncer>
      <ApiProvider api={api}>
        <CaseStoreProvider storage={storage}>{children}</CaseStoreProvider>
      </ApiProvider>
    </LiveAnnouncer>
  );
  return render(
    wrap(
      <>
        <h1 id="open-case-title">Open a case</h1>
        <OpenCaseForm />
        <CaseList />
      </>,
    ),
  );
}

async function fillRepo(user: ReturnType<typeof userEvent.setup>, version = "v1.2.3") {
  await user.type(field(FORM_LABELS.repoUrl), "https://github.com/acme/app");
  await user.type(field(FORM_LABELS.version), version);
  await user.click(screen.getByRole("radio", { name: /^Open hunt/ }));
}

describe("Open_Case_Form", () => {
  it("shows the GitHub repository fields only, and the issue field with the mode", async () => {
    const user = userEvent.setup();
    renderBoard();
    expect(field(FORM_LABELS.repoUrl)).toBeInTheDocument();
    expect(field(FORM_LABELS.version)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Local app" })).toBeNull();
    expect(field(FORM_LABELS.issueUrl)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /^Open hunt/ }));
    expect(screen.queryByLabelText(FORM_LABELS.issueUrl, { exact: false, selector: "input" })).toBeNull();
    await user.click(screen.getByRole("radio", { name: /^Blind hunt/ }));
    expect(field(FORM_LABELS.issueUrl)).toBeInTheDocument();
  });

  it("gives each mode a one-line description linked to its radio, and offers the auto toggle unchecked", () => {
    renderBoard();
    const known = screen.getByRole("radio", { name: /^Known issue/ });
    expect(known).toBeChecked();
    expect(known).toHaveAccessibleDescription(/public issue/);
    expect(screen.getByRole("checkbox", { name: FORM_LABELS.auto })).not.toBeChecked();
  });

  it("on a failed submit focuses the summary, links each error, marks fields invalid and keeps the values", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.type(field(FORM_LABELS.repoUrl), "https://gitlab.com/acme/app");
    await user.type(field(FORM_LABELS.area), "week view at midnight");
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));

    const summary = screen.getByRole("alert", { name: FORM_SUMMARY_HEADING });
    expect(summary).toHaveFocus();
    const links = within(summary).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#case-form-repoUrl", "#case-form-version", "#case-form-issueUrl"]);
    for (const label of [FORM_LABELS.repoUrl, FORM_LABELS.version, FORM_LABELS.issueUrl]) {
      expect(field(label)).toHaveAttribute("aria-invalid", "true");
    }
    expect(screen.getByText(ERRORS.repoUrl)).toBeInTheDocument();
    expect(field(FORM_LABELS.area)).not.toHaveAttribute("aria-invalid");
    expect(field(FORM_LABELS.repoUrl)).toHaveValue("https://gitlab.com/acme/app");
    await user.click(links[1] as HTMLElement);
    expect(field(FORM_LABELS.version)).toHaveFocus();
  });

  it("validates a field on blur after its value changed", async () => {
    const user = userEvent.setup();
    renderBoard();
    const repo = field(FORM_LABELS.repoUrl);
    await user.click(repo);
    await user.tab();
    expect(repo).not.toHaveAttribute("aria-invalid");
    await user.type(repo, "https://user:pw@github.com/acme/app");
    await user.tab();
    expect(repo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(ERRORS.repoUrlCredentials)).toBeInTheDocument();
    await user.clear(repo);
    await user.type(repo, "https://github.com/acme/app");
    await user.tab();
    expect(repo).not.toHaveAttribute("aria-invalid");
  });

  it("offline: saves a draft in this browser, makes no network call, and renders input as text only", async () => {
    const user = userEvent.setup();
    const storage = new FakeStorage();
    const { container } = renderBoard(storage);
    expect(screen.getByText(FORM_NOTE_OFFLINE)).toBeInTheDocument();
    await fillRepo(user);
    await user.type(field(FORM_LABELS.area), "<img src=x onerror=alert(1)>");
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));

    expect(screen.getByRole("status")).toHaveTextContent(DRAFT_CREATED);
    const row = document.querySelector<HTMLElement>("li[data-case-kind='draft']") as HTMLElement;
    expect(window.location.hash).toBe(`#/cases/${row.getAttribute("data-case-id")}`);
    expect(within(row).getByText(DRAFT_NOT_RUN)).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    const stored = JSON.parse(storage.map.get(DRAFTS_KEY) as string);
    expect(stored.drafts[0]).toMatchObject({ mode: "open-hunt", target: { kind: "repository", repoUrl: "https://github.com/acme/app" } });
    expect(stored.drafts[0]).not.toHaveProperty("issueUrl");
    expect(field(FORM_LABELS.repoUrl)).toHaveValue("");
  });

  it("online: starts a real investigation with the auto choice, opens it and saves no draft", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    const storage = new FakeStorage();
    renderOnline(api, storage);
    await screen.findByText(FORM_NOTE_ONLINE);
    await fillRepo(user);
    await user.click(screen.getByRole("checkbox", { name: FORM_LABELS.auto }));
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));

    await screen.findByText(LIVE_CASE_STARTED);
    expect(api.create).toHaveBeenCalledWith({
      repository_url: "https://github.com/acme/app",
      ref: "v1.2.3",
      mode: "open-hunt",
      issue_url: null,
      area: null,
      auto: true,
    });
    expect(document.querySelector("li[data-case-kind='live'][data-case-id='inv-1']")).not.toBeNull();
    expect(window.location.hash).toBe("#/cases/inv-1");
    expect(storage.map.get(DRAFTS_KEY)).toBeUndefined();
    expect(field(FORM_LABELS.repoUrl)).toHaveValue("");
  });

  it("online: shows the backend's message and keeps the values when the backend refuses", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ create: vi.fn(async () => Promise.reject(new ApiError("ref_not_found", "Ref 'v9' not found"))) });
    renderOnline(api);
    await screen.findByText(FORM_NOTE_ONLINE);
    await fillRepo(user, "v9");
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));
    expect(await screen.findByText("Ref 'v9' not found")).toBeInTheDocument();
    expect(field(FORM_LABELS.version)).toHaveValue("v9");
  });

  it("at 20 drafts shows the limit message and creates nothing (offline)", async () => {
    const user = userEvent.setup();
    const storage = new FakeStorage();
    seed(storage, MAX_DRAFTS);
    renderBoard(storage);
    expect(document.querySelectorAll("li[data-case-kind='draft']")).toHaveLength(MAX_DRAFTS);
    await fillRepo(user);
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));
    expect(screen.getByRole("alert")).toHaveTextContent(FORM_LIMIT_REACHED);
    expect(JSON.parse(storage.map.get(DRAFTS_KEY) as string).drafts).toHaveLength(MAX_DRAFTS);
  });

  it("keeps a draft for this visit and says Not saved when storage fails", async () => {
    const user = userEvent.setup();
    const storage = new FakeStorage();
    storage.failWrites = true;
    renderBoard(storage);
    await user.type(field(FORM_LABELS.repoUrl), "https://github.com/acme/app");
    await user.type(field(FORM_LABELS.version), "a1b2c3d");
    await user.type(field(FORM_LABELS.issueUrl), "https://github.com/acme/app/issues/12");
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));
    const row = document.querySelector<HTMLElement>("li[data-case-kind='draft']") as HTMLElement;
    expect(within(row).getByText(NOT_SAVED)).toBeInTheDocument();
    expect(within(row).getByText("acme/app @ a1b2c3d")).toHaveClass("mono");
  });
});
