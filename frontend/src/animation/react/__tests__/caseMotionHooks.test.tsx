/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LiveAnnouncer } from "../../../a11y/LiveAnnouncer";
import { CaseLibrary } from "../../../cases/library/CaseLibrary";
import { OpenCaseForm } from "../../../cases/form/OpenCaseForm";
import { onSubmitBurst } from "../../../cases/motionHooks";
import { CaseStoreProvider } from "../../../cases/store";
import { CaseViewProbe, FakeStorage } from "../../../cases/__tests__/helpers";
import { FORM_LABELS, FORM_SUBMIT } from "../../../content/form";
import { CLOCK_ENTRY_MS } from "../../constants";
import { instantAnimator } from "../../effects/animator";
import { EFFECTS } from "../../effects/registry";
import { CaseMotionHooks } from "../CaseMotionHooks";
import { createDirectorHost, DirectorContext, type DirectorHost, type RequestFn } from "../directorHost";

/** Tasks 12.15 and 14.2: the case hook points reach the director; state and focus never wait for an effect. */

function renderWired() {
  const base = createDirectorHost({ reducedMotion: false, animator: instantAnimator });
  const calls: { id: string; params: Record<string, unknown>; focused: Element | null }[] = [];
  const request: RequestFn = (id, params, opts) => {
    calls.push({ id, params: params as Record<string, unknown>, focused: document.activeElement });
    return base.request(id, params, opts);
  };
  const host: DirectorHost = { ...base, request };
  const view = render(
    <DirectorContext.Provider value={host}>
      <LiveAnnouncer>
        <CaseStoreProvider storage={new FakeStorage()}>
          <section id="open">
            <h2 id="open-case-title">Open a new case</h2>
            <OpenCaseForm />
          </section>
          <section id="library">
            <h2 id="library-title" tabIndex={-1}>
              Case library
            </h2>
            <CaseLibrary />
          </section>
          <CaseViewProbe />
        </CaseStoreProvider>
      </LiveAnnouncer>
      <CaseMotionHooks />
    </DirectorContext.Provider>,
  );
  return { host, calls, view };
}

const field = (label: string) => screen.getByLabelText(label, { exact: false, selector: "input, textarea" });

describe("CaseMotionHooks", () => {
  it("a valid submit creates the draft, then requests the burst from the submit button and the draft drop-in with focus already on the card", async () => {
    const user = userEvent.setup();
    const { calls } = renderWired();
    const submit = screen.getByRole("button", { name: FORM_SUBMIT });
    submit.getBoundingClientRect = () => new DOMRect(10, 20, 100, 40);
    await user.click(screen.getByRole("radio", { name: FORM_LABELS.targetLocal }));
    await user.type(field(FORM_LABELS.appUrl), "http://localhost:4321");
    await user.click(screen.getByRole("radio", { name: /^Open hunt/ }));
    await user.click(submit);

    const ids = calls.map((c) => c.id);
    expect(ids.indexOf("bats.burst")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("case.draft-create")).toBeGreaterThan(ids.indexOf("bats.burst"));
    expect(calls.find((c) => c.id === "bats.burst")?.params.origin).toEqual({ x: 10, y: 20, w: 100, h: 40 });

    const draftItem = document.querySelector('ol.library__cards > li[data-case-kind="draft"]') as HTMLElement;
    const card = draftItem.querySelector(".case-card") as HTMLElement;
    const create = calls.find((c) => c.id === "case.draft-create")!;
    expect(create.params.draftId).toBe(draftItem.getAttribute("data-case-id"));
    expect(create.params.targets).toEqual([card, card.querySelector("[data-draft-underline]")]);
    expect(create.params.actors).toEqual([{ actor: "library:skeleton-scribe", pose: "write" }]);
    // The state change and the focus move happened before the effect was even requested.
    expect(create.focused).toBe(card);
    expect(document.activeElement).toBe(card);
  });

  it("opening a case requests case.open for the case-file sheet and the card's folder tab", async () => {
    const user = userEvent.setup();
    const { calls } = renderWired();
    const sheet = document.createElement("div");
    sheet.className = "case-file";
    document.getElementById("case")?.append(sheet);
    const second = document.querySelector('[data-case-id="calcom-30021"] .case-card') as HTMLElement;
    await user.click(second.querySelector(".case-card__open") as HTMLElement);
    const open = calls.find((c) => c.id === "case.open");
    expect(open?.params.targets).toEqual([sheet, second.querySelector(".case-card__tab")]);
  });

  it("suppresses ambient effects while a form text input has focus, and uninstalls on unmount", async () => {
    const user = userEvent.setup();
    const { host, calls, view } = renderWired();
    await user.click(screen.getByRole("radio", { name: FORM_LABELS.targetLocal }));
    await user.click(field(FORM_LABELS.appUrl));
    expect(host.getEnv().suppressed.input).toBe(true);
    await user.click(document.body);
    expect(host.getEnv().suppressed.input).toBe(false);
    view.unmount();
    const before = calls.length;
    onSubmitBurst(document.createElement("button"));
    expect(calls.length).toBe(before);
  });
});

describe("clock entry and module boundaries (task 12.15)", () => {
  it("the clock entry lasts 580 ms, within 500 to 650", () => {
    expect(CLOCK_ENTRY_MS).toBe(580);
    expect(CLOCK_ENTRY_MS).toBeGreaterThanOrEqual(500);
    expect(EFFECTS["hero.clock-entry"].maxDurationMs).toBeLessThanOrEqual(650);
  });

  it("imports gsap, gsap/* and motion's animate only inside src/animation/", () => {
    // A variable path: Vite rewrites `new URL("literal", import.meta.url)` into an asset URL.
    const rel = "../../../";
    const src = fileURLToPath(new URL(rel, import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(src);
    const offenders = files
      .filter((f) => !relative(src, f).split(sep).join("/").startsWith("animation/"))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return /from\s+["']gsap(\/[^"']*)?["']/.test(text) || /import\s*\{[^}]*\banimate\b[^}]*\}\s*from\s*["']motion["']/.test(text);
      })
      .map((f) => relative(src, f));
    expect(offenders).toEqual([]);
  });
});
