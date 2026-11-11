/// <reference types="node" />
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LINKS } from "../../config/links";
import {
  BROWSER_CLOCK_CONTROLLED,
  BROWSER_NOT_SERVER,
  BROWSER_NOT_SERVER_EXPLANATION,
  CTA_DEMO,
  CTA_GITHUB,
  FIXED_CHECK_NOT_RUN,
  ILLUSTRATIVE_DIFF,
  NO_ANOMALY,
  NO_UPSTREAM_FIX,
  OPEN_A_CASE,
  RECORDED_REPLAY,
  REPLAY_LABEL,
  REPLAY_SOURCE_LINK_LABEL,
  REPLAY_SOURCE_NOTE,
  SERVER_CLOCK_NOT_CONTROLLED,
  SUGGESTED_FIX,
} from "../../content/copy";
import { PLACEHOLDER_FOOTNOTE } from "../../components/PlaceholderBadge";
import { CREW, CREW_BY_ID, type MascotId } from "../../content/crew";
import { FLOW_STEPS } from "../../content/flow";
import { SECTION_IDS } from "../../content/nodes";
import { CASE_FIX_STATUS, FINAL_STAMP, FULLCALENDAR_TARGET, LIBRARY_SAMPLE_LABEL } from "../../content/sections";
import { REPLAY_STREAM } from "../../data/replay.stream";
import { CaseView } from "../CaseView/CaseView";
import { Closing } from "../Closing/Closing";
import { Flow } from "../Flow/Flow";
import { Library } from "../Library/Library";
import { SECTION_COMPONENTS, Sections } from "../index";

// Vitest runs with css: false, so stylesheets are read from disk where a test needs a rule.
const readCss = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("region registry (decision D14)", () => {
  it("renders the seven Case Board regions in order with no stub left", () => {
    const { container } = render(<Sections />);
    const ids = Array.from(container.querySelectorAll(":scope > section")).map((s) => s.id);
    expect(ids).toEqual(["open", "lost-hour", "library", "case", "crew", "flow", "close"]);
    expect(ids).toEqual([...SECTION_IDS]);
    expect(Object.keys(SECTION_COMPONENTS)).toEqual([...SECTION_IDS]);
    expect(container.textContent).not.toMatch(/arrives in the next build step/i);
    expect(container.textContent).not.toMatch(/Enter the Clocktower|App opens in the next milestone/);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});

describe("Case library (Requirements 21.1, 21.2, 21.3, 21.6)", () => {
  it("lists both sample cases in order in an ordered list, FullCalendar current, with label, mono target and status", () => {
    const { container } = render(<Library />);
    expect(container.querySelector("section")).toHaveAttribute("id", "library");
    const items = container.querySelectorAll("ol.library__cards > li");
    expect(Array.from(items).map((li) => li.getAttribute("data-case-id"))).toEqual(["fullcalendar-7998", "calcom-30021"]);
    const card = items[0] as HTMLElement;
    expect(within(card).getByText(LIBRARY_SAMPLE_LABEL)).toBeInTheDocument();
    expect(within(card).getByText(FULLCALENDAR_TARGET)).toHaveClass("mono");
    expect(within(card).getByText("Known issue")).toBeInTheDocument();
    const open = within(card).getByRole("button", { name: /^Open case/ });
    expect(open).toHaveAttribute("aria-current", "true");
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    const last = REPLAY_STREAM[REPLAY_STREAM.length - 1]!;
    expect(card.querySelector(".case-card__status")).toHaveAttribute("data-status", last.status);
  });
});

describe("Flow (Requirements 3.6, 3.7, 3.8, decision D17)", () => {
  it("presents scope, plan, approve, run, evidence, fix in order, alternating sides", () => {
    const { container } = render(<Flow />);
    const steps = Array.from(container.querySelectorAll("ol.flow__steps > li.flow__step"));
    expect(steps.map((s) => s.getAttribute("data-step"))).toEqual(["scope", "plan", "approve", "run", "evidence", "fix"]);
    expect(steps.map((s) => s.getAttribute("data-side"))).toEqual(["start", "end", "start", "end", "start", "end"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(FLOW_STEPS.map((s) => s.title));
  });

  it("attaches each agent and system mascot to its step exactly once, with Doctor Stitch and the Scribe on fix", () => {
    const { container } = render(<Flow />);
    const seen: string[] = [];
    for (const step of FLOW_STEPS) {
      const item = container.querySelector(`li[data-step="${step.id}"]`) as HTMLElement;
      const ids = Array.from(item.querySelectorAll("li.flow__mascot")).map((m) => m.getAttribute("data-mascot-id"));
      expect(ids).toEqual([...step.mascots]);
      for (const id of step.mascots) expect(within(item).getByText(CREW_BY_ID[id as MascotId].name)).toBeInTheDocument();
      seen.push(...(ids as string[]));
    }
    expect(seen).toHaveLength(12);
    expect(new Set(seen)).toEqual(new Set(CREW.filter((m) => m.kind !== "companion").map((m) => m.id)));
    const fix = container.querySelector('li[data-step="fix"]') as HTMLElement;
    expect(Array.from(fix.querySelectorAll("li.flow__mascot")).map((m) => m.getAttribute("data-mascot-id"))).toEqual([
      "doctor-stitch",
      "skeleton-scribe",
    ]);
    expect(within(fix).getByText(/called verified only after it passes on a fixed version/)).toBeInTheDocument();
  });

  it("marks the approve step as the place the Bat Burst plays", () => {
    const { container } = render(<Flow />);
    const burst = Array.from(container.querySelectorAll("[data-burst='true']")).map((s) => s.getAttribute("data-step"));
    expect(burst).toEqual(["approve"]);
    expect(container.querySelector('[data-burst-anchor="approve"]')).not.toBeNull();
  });
});

describe("Case view: replay sheet (Requirements 7.1, 7.2, 7.4, 7.9, 7.10, 7.11, 16.2, 16.4, 16.5)", () => {
  it("labels the sheet as a recorded replay of sample data, never as live", () => {
    const { container } = render(<CaseView />);
    expect(container.querySelector("section")).toHaveAttribute("id", "case");
    expect(screen.getByText(RECORDED_REPLAY)).toBeInTheDocument();
    expect(screen.getByText(REPLAY_LABEL)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\blive\b/i);
    expect(container.textContent ?? "").not.toMatch(/time travel enabled|no bugs found|\bmerged\b/i);
  });

  it("links FullCalendar issue 7998 as the source, with a note that it is a time-zone date-boundary case and no new finding", () => {
    render(<CaseView />);
    const link = screen.getByRole("link", { name: REPLAY_SOURCE_LINK_LABEL });
    expect(link).toHaveAttribute("href", "https://github.com/fullcalendar/fullcalendar/issues/7998");
    expect(screen.getByText(REPLAY_SOURCE_NOTE)).toBeInTheDocument();
    expect(REPLAY_SOURCE_NOTE).toMatch(/time-zone date-boundary/);
    expect(REPLAY_SOURCE_NOTE).toMatch(/no new finding/);
    expect(link.getAttribute("href")).toBe(LINKS.issue7998.href);
  });

  it("shows event 0 with its timestamp, clock reading and server clock, values in mono", () => {
    const { container } = render(<CaseView />);
    const first = REPLAY_STREAM[0]!;
    const card = container.querySelector(".event-card") as HTMLElement;
    expect(card).toHaveAttribute("data-event", first.id);
    expect(within(card).getByText(first.text)).toBeInTheDocument();
    expect(within(card).getByText("t+00:00").closest("dd")).not.toBeNull();
    const inspector = container.querySelector(".clock-inspector") as HTMLElement;
    expect(within(inspector).getByText(first.browserClock.instant)).toHaveClass("mono");
    expect(within(inspector).getByText(first.browserClock.tz)).toHaveClass("mono");
    expect(within(inspector).getByText(SERVER_CLOCK_NOT_CONTROLLED)).toBeInTheDocument();
    expect(within(inspector).getByText(new RegExp(`^${BROWSER_CLOCK_CONTROLLED} in events 4 to 10`))).toBeInTheDocument();
  });

  it("puts Spider Weaver, Bat Scout and Raven Archivist on the sheet", () => {
    const { container } = render(<CaseView />);
    const sheet = container.querySelector(".case-file") as HTMLElement;
    for (const name of ["Bat Scout", "Raven Archivist"]) {
      expect(within(sheet).getByRole("img", { name })).toBeInTheDocument();
    }
    // The Spider hangs inside the slider, whose children are presentational (the slider has one accessible value).
    expect(sheet.querySelector('.scrubber__slider [data-spider]')).not.toBeNull();
    expect(container.querySelector(".event-card__thumb")).not.toBeNull();
    expect(container.querySelector(".event-card__name")).toHaveTextContent("Wraith Director");
  });

  it("is interactive: one peg per event, event 0 current, a slider and real Previous and Next buttons", () => {
    const { container } = render(<CaseView />);
    expect(container.querySelector("section#case")).not.toHaveAttribute("data-static");
    const pegs = Array.from(container.querySelectorAll("li.scrubber__peg"));
    expect(pegs).toHaveLength(REPLAY_STREAM.length);
    expect(pegs.map((p) => p.getAttribute("aria-current"))).toEqual(pegs.map((_, i) => (i === 0 ? "step" : null)));
    for (const name of ["Previous event", "Next event"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  });

  it("shows the event 0 rung (Planned) on the rung strip", () => {
    const { container } = render(<CaseView />);
    expect(container.querySelector('.ladder-strip li[aria-current="step"]')).toHaveAttribute("data-status", "planned");
  });

  it("keeps the case file square: no rounded rule is declared for the sheet", () => {
    const css = readCss("../../styles/sections/replay.css");
    const sheet = /\.case-file\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(sheet).toMatch(/border-radius:\s*0/);
  });
});

describe("Case view: proof and fix (Requirements 3.9, 8.1 to 8.6, 16.1, 24)", () => {
  it("shows the ladder with Inconclusive apart and a definition per status", () => {
    const { container } = render(<CaseView />);
    expect(container.querySelectorAll("ol.ladder > li")).toHaveLength(5);
    expect(container.querySelector("ol.ladder")).not.toContainElement(container.querySelector(".ladder__inconclusive"));
    expect(container.querySelectorAll(".ladder__def")).toHaveLength(6);
  });

  it("states Browser time ≠ server time with the separate-control explanation, in the mono font", () => {
    const { container } = render(<CaseView />);
    expect(screen.getByText(BROWSER_NOT_SERVER)).toHaveClass("jack-panel__statement");
    expect(screen.getByText(BROWSER_NOT_SERVER_EXPLANATION)).toBeInTheDocument();
    const rule = /\.jack-panel__statement\s*\{([^}]*)\}/.exec(readCss("../../styles/sections/proof.css"))?.[1] ?? "";
    expect(rule).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(container.querySelector('[data-face="browser"]')).not.toBeNull();
    expect(container.querySelector('[data-face="server"]')).not.toBeNull();
  });

  it("uses the negative-result phrase and never 'no bugs found'", () => {
    const { container } = render(<CaseView />);
    expect(screen.getByText(NO_ANOMALY)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/no bugs found/i);
  });

  it("places Mummy Wrapper, Two-Faced Jack and Doctor Stitch, with a sample-labelled hash tag", () => {
    render(<CaseView />);
    for (const name of ["Mummy Wrapper", "Two-Faced Jack", "Doctor Stitch"]) {
      expect(screen.getByRole("img", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Sample artifact hash \(illustrative\)/)).toBeInTheDocument();
  });

  it("labels Doctor Stitch's fix as a suggestion that is not verified, with an illustrative diff and no upstream fix", () => {
    const { container } = render(<CaseView />);
    const sheet = within(screen.getByRole("group", { name: SUGGESTED_FIX }));
    for (const text of [CASE_FIX_STATUS, ILLUSTRATIVE_DIFF, NO_UPSTREAM_FIX, FIXED_CHECK_NOT_RUN]) {
      expect(sheet.getByText(text)).toBeInTheDocument();
    }
    expect(container.querySelector("[data-fix-sheet]")?.textContent ?? "").not.toMatch(/\bmerged\b|\bverified fix\b/i);
  });
});

describe("Closing (Requirements 3.10, 3.11, 5.6 to 5.8, decision D19)", () => {
  it("has one 'Open a case' button and the demo and GitHub placeholder links with the shared footnote", () => {
    const { container } = render(<Closing />);
    expect(container.querySelector("section")).toHaveAttribute("id", "close");
    expect(screen.getByRole("heading", { level: 2, name: OPEN_A_CASE })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: OPEN_A_CASE })).toHaveLength(1);
    const cta = container.querySelector(".cta") as HTMLElement;
    expect(within(cta).getAllByRole("link").map((a) => a.firstChild?.textContent)).toEqual([CTA_DEMO, CTA_GITHUB]);
    expect(cta.querySelectorAll("a .footnote-mark")).toHaveLength(2);
    expect(within(cta).getByText(PLACEHOLDER_FOOTNOTE)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Enter the Clocktower/);
  });

  it("has the Raven's stamp as DOM text, the Raven and the Skeleton Scribe on the centered sheet", () => {
    const { container } = render(<Closing />);
    const sheet = container.querySelector(".cta-sheet") as HTMLElement;
    expect(within(sheet).getByText(FINAL_STAMP)).toBeInTheDocument();
    expect(sheet.querySelector("[data-raven-stamp]")).toHaveTextContent(FINAL_STAMP);
    expect(within(sheet).getByRole("img", { name: "Raven Archivist" })).toBeInTheDocument();
    expect(within(sheet).getByRole("img", { name: "Skeleton Scribe" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });
});
