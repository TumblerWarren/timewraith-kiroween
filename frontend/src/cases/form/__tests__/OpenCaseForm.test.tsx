import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_CREATED, DRAFT_NOT_RUN, NOT_SAVED } from "../../../content/copy";
import { FORM_LABELS, FORM_LIMIT_REACHED, FORM_SUBMIT, FORM_SUMMARY_HEADING } from "../../../content/form";
import { DRAFTS_KEY, MAX_DRAFTS } from "../../drafts/storage";
import { newDraftId } from "../../drafts/ids";
import { FakeStorage, renderBoard } from "../../__tests__/helpers";
import { ERRORS } from "../validate";

/** Task 7.8: Open_Case_Form component tests. Requirements 19.2, 19.3, 19.6, 19.13, 19.14, 19.15, 20.1, 20.8, 20.10, 1.3. */

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
const queryField = (label: string) => screen.queryByLabelText(label, { exact: false, selector: "input, textarea" });

function seed(storage: FakeStorage, n: number) {
  const drafts = Array.from({ length: n }, (_, i) => ({
    id: newDraftId(1_700_000_000_000 + i, () => "abcd"),
    createdAt: new Date(1_700_000_000_000 + i).toISOString(),
    mode: "open-hunt",
    target: { kind: "local-app", appUrl: `http://localhost:${3000 + i}` },
  }));
  storage.map.set(DRAFTS_KEY, JSON.stringify({ schemaVersion: 1, drafts }));
}

describe("Open_Case_Form", () => {
  it("shows and hides fields with the target type and the mode", async () => {
    const user = userEvent.setup();
    renderBoard();
    expect(field(FORM_LABELS.repoUrl)).toBeInTheDocument();
    expect(field(FORM_LABELS.version)).toBeInTheDocument();
    expect(queryField(FORM_LABELS.appUrl)).toBeNull();
    expect(field(FORM_LABELS.issueUrl)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: FORM_LABELS.targetLocal }));
    expect(field(FORM_LABELS.appUrl)).toBeInTheDocument();
    expect(queryField(FORM_LABELS.repoUrl)).toBeNull();
    expect(queryField(FORM_LABELS.version)).toBeNull();

    await user.click(screen.getByRole("radio", { name: /^Open hunt/ }));
    expect(queryField(FORM_LABELS.issueUrl)).toBeNull();
    await user.click(screen.getByRole("radio", { name: /^Blind hunt/ }));
    expect(field(FORM_LABELS.issueUrl)).toBeInTheDocument();
  });

  it("gives each mode a one-line description linked to its radio", () => {
    renderBoard();
    const known = screen.getByRole("radio", { name: /^Known issue/ });
    expect(known).toBeChecked();
    expect(known).toHaveAccessibleDescription(/public issue/);
    expect(screen.getByRole("radio", { name: FORM_LABELS.targetRepository })).toBeChecked();
  });

  it("on a failed submit focuses the summary, links each error, marks fields invalid and keeps the values", async () => {
    const user = userEvent.setup();
    renderBoard();
    await user.type(field(FORM_LABELS.repoUrl), "http://github.com/acme/app?tab=1");
    await user.type(field(FORM_LABELS.area), "week view at midnight");
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));

    const summary = screen.getByRole("alert", { name: FORM_SUMMARY_HEADING });
    expect(summary).toHaveFocus();
    const links = within(summary).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#case-form-repoUrl", "#case-form-version", "#case-form-issueUrl"]);

    for (const label of [FORM_LABELS.repoUrl, FORM_LABELS.version, FORM_LABELS.issueUrl]) {
      const input = field(label);
      expect(input).toHaveAttribute("aria-invalid", "true");
      const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
      expect(ids).toContain(`${input.id}-error`);
      expect(document.getElementById(`${input.id}-error`)).toHaveTextContent(/\S/);
    }
    expect(field(FORM_LABELS.area)).not.toHaveAttribute("aria-invalid");
    expect(field(FORM_LABELS.repoUrl)).toHaveValue("http://github.com/acme/app?tab=1");
    expect(field(FORM_LABELS.area)).toHaveValue("week view at midnight");

    // A summary link moves focus to its field and leaves the URL alone.
    const before = window.location.href;
    await user.click(links[1] as HTMLElement);
    expect(field(FORM_LABELS.version)).toHaveFocus();
    expect(window.location.href).toBe(before);
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

  it("renders user input as text only", async () => {
    const user = userEvent.setup();
    const { container } = renderBoard();
    await user.click(screen.getByRole("radio", { name: FORM_LABELS.targetLocal }));
    await user.type(field(FORM_LABELS.appUrl), "http://localhost:3000");
    await user.type(field(FORM_LABELS.area), "<img src=x onerror=alert(1)>");
    await user.click(screen.getByRole("radio", { name: /^Open hunt/ }));
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/, { selector: "h3" })).toBeInTheDocument();
  });

  it("can be completed with the keyboard only, radios with the arrow keys, and makes no network call", async () => {
    const user = userEvent.setup();
    const storage = new FakeStorage();
    renderBoard(storage);
    const repoRadio = screen.getByRole("radio", { name: FORM_LABELS.targetRepository });
    repoRadio.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: FORM_LABELS.targetLocal })).toBeChecked();
    await user.tab();
    expect(field(FORM_LABELS.appUrl)).toHaveFocus();
    await user.keyboard("http://localhost:5173");
    await user.tab();
    expect(field(FORM_LABELS.area)).toHaveFocus();
    await user.keyboard("month view on the last day of February");
    await user.tab();
    expect(screen.getByRole("radio", { name: /^Known issue/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("radio", { name: /^Open hunt/ })).toBeChecked();
    await user.tab();
    expect(screen.getByRole("button", { name: FORM_SUBMIT })).toHaveFocus();
    await user.keyboard("{Enter}");

    const live = screen.getByRole("status");
    expect(live).toHaveTextContent(DRAFT_CREATED);
    const card = document.querySelector<HTMLElement>("li[data-case-kind='draft'] .case-card");
    expect(card).not.toBeNull();
    expect(card).toHaveFocus();
    expect(within(card as HTMLElement).getByText(DRAFT_NOT_RUN)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(XMLHttpRequest).not.toHaveBeenCalled();
    const stored = JSON.parse(storage.map.get(DRAFTS_KEY) as string);
    expect(stored.drafts).toHaveLength(1);
    expect(stored.drafts[0]).toMatchObject({ mode: "open-hunt", target: { kind: "local-app", appUrl: "http://localhost:5173" } });
    expect(stored.drafts[0]).not.toHaveProperty("issueUrl");
    // The form is back to its defaults.
    expect(screen.getByRole("radio", { name: FORM_LABELS.targetRepository })).toBeChecked();
    expect(field(FORM_LABELS.repoUrl)).toHaveValue("");
  });

  it("puts the newest draft first after the samples and keeps the URL path", async () => {
    const user = userEvent.setup();
    const path = window.location.pathname + window.location.search;
    let t = 1_800_000_000_000;
    renderBoard(new FakeStorage(), () => (t += 1000));
    for (const app of ["http://localhost:1111", "http://localhost:2222"]) {
      await user.click(screen.getByRole("radio", { name: FORM_LABELS.targetLocal }));
      await user.type(field(FORM_LABELS.appUrl), app);
      await user.click(screen.getByRole("radio", { name: /^Open hunt/ }));
      await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));
    }
    const items = Array.from(document.querySelectorAll("ol.library__cards > li"));
    expect(items.map((li) => li.getAttribute("data-case-kind"))).toEqual(["sample", "sample", "draft", "draft"]);
    expect(items[2]).toHaveTextContent("localhost:2222");
    expect(items[3]).toHaveTextContent("localhost:1111");
    expect(window.location.pathname + window.location.search).toBe(path);
  });

  it("at 20 drafts shows the limit message and creates nothing", async () => {
    const user = userEvent.setup();
    const storage = new FakeStorage();
    seed(storage, MAX_DRAFTS);
    renderBoard(storage);
    expect(document.querySelectorAll("li[data-case-kind='draft']")).toHaveLength(MAX_DRAFTS);
    await user.type(field(FORM_LABELS.repoUrl), "https://github.com/acme/app");
    await user.type(field(FORM_LABELS.version), "v1.2.3");
    await user.click(screen.getByRole("radio", { name: /^Open hunt/ }));
    await user.click(screen.getByRole("button", { name: FORM_SUBMIT }));
    expect(screen.getByRole("alert")).toHaveTextContent(FORM_LIMIT_REACHED);
    expect(document.querySelectorAll("li[data-case-kind='draft']")).toHaveLength(MAX_DRAFTS);
    expect(JSON.parse(storage.map.get(DRAFTS_KEY) as string).drafts).toHaveLength(MAX_DRAFTS);
    expect(field(FORM_LABELS.repoUrl)).toHaveValue("https://github.com/acme/app");
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
    const card = document.querySelector<HTMLElement>("li[data-case-kind='draft']") as HTMLElement;
    expect(within(card).getByText(NOT_SAVED)).toBeInTheDocument();
    expect(within(card).getByText("acme/app @ a1b2c3d")).toHaveClass("mono");
    expect(screen.getByRole("status")).toHaveTextContent(DRAFT_CREATED);
  });
});
