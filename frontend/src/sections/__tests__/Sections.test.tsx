import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHECKLIST_LABEL, DRAFT_NOT_RUN, HEADLINE, NOT_CONTACTED, POSITIONING, PROBLEM_ILLUSTRATION_LABEL, SUBHEAD } from "../../content/copy";
import { TIER2_REACTIONS } from "../../animation/react/regionCast";
import { CREW, MASCOT_IDS } from "../../content/crew";
import { crewReactLabel } from "../../content/sections";
import { Crew } from "../Crew/Crew";
import { LostHour } from "../LostHour/LostHour";
import { OpenCase } from "../OpenCase/OpenCase";

describe("Open-a-case panel (Requirements 3.1, 3.2, 6.1, 6.4)", () => {
  it("has the exact headline as the only h1, the exact subhead and the positioning line", () => {
    render(<OpenCase />);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]?.textContent).toBe(HEADLINE);
    expect(screen.getByText(SUBHEAD)).toBeInTheDocument();
    expect(screen.getByText(POSITIONING)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: HEADLINE })).toHaveAttribute("id", "open");
  });

  it("has a paper sheet slot for the form with the honest demo-mode notes, and no retired CTA", () => {
    const { container } = render(<OpenCase />);
    const sheet = container.querySelector('[data-slot="open-case-form"]') as HTMLElement;
    expect(sheet).toHaveClass("paper-sheet");
    expect(within(sheet).getByRole("heading", { level: 2 })).toHaveAttribute("id", "open-case-title");
    expect(within(sheet).getByText(new RegExp(`^${NOT_CONTACTED}`))).toBeInTheDocument();
    expect(within(sheet).getByText(DRAFT_NOT_RUN)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Enter the Clocktower/);
  });

  it("keeps the checklist label inside the checklist region", () => {
    render(<OpenCase />);
    const board = screen.getByRole("region", { name: CHECKLIST_LABEL });
    expect(within(board).getByText(CHECKLIST_LABEL)).toBeInTheDocument();
    expect(screen.getAllByText(CHECKLIST_LABEL)).toHaveLength(1);
  });

  it("stands the Wraith Director in front of a Clock reading 23:59, with the Watchtower Warden at the notice board", () => {
    const { container } = render(<OpenCase />);
    const stage = container.querySelector(".hero__stage") as HTMLElement;
    expect(within(stage).getByRole("img", { name: "Wraith Director" })).toBeInTheDocument();
    expect(within(stage).getByRole("img", { name: "Tower clock reading 23:59" })).toBeInTheDocument();
    const notice = container.querySelector(".hero__notice") as HTMLElement;
    expect(within(notice).getByRole("img", { name: "Watchtower Warden" })).toBeInTheDocument();
  });
});

describe("Lost Hour (Requirement 3.3, decision D18)", () => {
  it("shows the 01:59 and 03:00 stamps, a static crack and the 8 March 2026 caption, and never an 02:xx reading", () => {
    const { container } = render(<LostHour />);
    expect(container.querySelector("section")).toHaveAttribute("id", "lost-hour");
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    const stamps = Array.from(container.querySelectorAll("time.problem__stamp-time")).map((t) => t.textContent);
    expect(stamps).toEqual(["01:59", "03:00"]);
    expect(container.querySelector('[data-crack="static"]')).not.toBeNull();
    expect(screen.getByText(PROBLEM_ILLUSTRATION_LABEL)).toBeInTheDocument();
    expect(PROBLEM_ILLUSTRATION_LABEL).toMatch(/^Illustration: the US spring-forward night, 8 March 2026\./);
    expect(PROBLEM_ILLUSTRATION_LABEL).not.toMatch(/cal\.com|30021/i);
    expect(container.textContent ?? "").not.toMatch(/\b02:\d\d\b/);
    expect(container.querySelector("[data-clock-time]")?.getAttribute("data-clock-time")).toBe("01:59");
  });
});

describe("Crew (Requirement 3.5)", () => {
  it("keys all 14 mascots in three groups of 6, 6 and 2, each with its name and one-line job as text", () => {
    const { container } = render(<Crew />);
    const groups = Array.from(container.querySelectorAll(".crew__key .crew__tier"));
    expect(groups.map((s) => s.getAttribute("data-tier"))).toEqual(["agents", "system", "companions"]);
    expect(groups.map((s) => s.querySelectorAll("li.crew__member").length)).toEqual([6, 6, 2]);

    const members = container.querySelectorAll("li.crew__member");
    expect(members).toHaveLength(14);
    expect(members).toHaveLength(MASCOT_IDS.length);
    for (const m of CREW) {
      const item = container.querySelector(`li[data-member="${m.id}"]`) as HTMLElement;
      expect(item).not.toBeNull();
      expect(within(item).getByRole("heading", { level: 4, name: m.name })).toBeInTheDocument();
      expect(within(item).getByText(m.job)).toBeInTheDocument();
    }
    const stitch = container.querySelector('li[data-member="doctor-stitch"]') as HTMLElement;
    expect(within(stitch).getByText("Patch-maker: stitches a suggested fix and the regression test that proves it.")).toBeInTheDocument();
  });

  it("draws every mascot once in the group portrait, numbered to match its key entry", () => {
    const { container } = render(<Crew />);
    const portrait = container.querySelector(".crew__portrait") as HTMLElement;
    expect(portrait.querySelectorAll("[data-sitter]")).toHaveLength(MASCOT_IDS.length);
    for (const m of CREW) {
      const sitter = portrait.querySelector(`[data-sitter="${m.id}"]`) as HTMLElement;
      expect(sitter.querySelectorAll(`svg[data-mascot="${m.id}"], img[data-mascot="${m.id}"]`)).toHaveLength(1);
      const keyNo = container.querySelector(`li[data-member="${m.id}"] .crew__no`)?.textContent;
      expect(keyNo).toMatch(/^\d+$/);
      expect(sitter.querySelector(".crew__no")?.textContent).toBe(keyNo);
    }
    const numbers = Array.from(portrait.querySelectorAll(".crew__no")).map((n) => Number(n.textContent));
    expect(new Set(numbers).size).toBe(MASCOT_IDS.length);
  });

  it("groups the key by tier, with no card grid", () => {
    render(<Crew />);
    expect(screen.getAllByRole("group")).toHaveLength(3);
  });

  it("makes only the six Tier 2 figures tab stops: named buttons; Tier 1 figures and tags are hidden and not focusable (task 14.8)", () => {
    const { container } = render(<Crew />);
    const portrait = container.querySelector(".crew__portrait") as HTMLElement;
    const tabStops = Array.from(portrait.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")).filter(
      (el) => el.tabIndex >= 0,
    );
    const tier2 = CREW.filter((m) => m.tier === 2);
    expect(tabStops).toHaveLength(6);
    expect(tabStops.map((b) => b.getAttribute("data-sitter"))).toEqual(tier2.map((m) => m.id));
    for (const m of tier2) {
      const button = screen.getByRole("button", { name: crewReactLabel(m.name) });
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("data-react-actor", `crew:${m.id}`);
      expect(button.getAttribute("data-react-pose")).toBe(TIER2_REACTIONS[m.id]);
      expect(button.closest("[aria-hidden='true']")).toBeNull();
    }
    for (const m of CREW.filter((x) => x.tier === 1)) {
      const sitter = portrait.querySelector(`[data-sitter="${m.id}"]`) as HTMLElement;
      expect(sitter.tagName).toBe("DIV");
      expect(sitter).toHaveAttribute("aria-hidden", "true");
      expect(sitter).toHaveAttribute("data-react-actor", `crew:${m.id}`);
    }
    expect(portrait.querySelector('[data-sitter="doctor-stitch"]')).toHaveAttribute("data-react-pose", "spin");
    for (const tag of portrait.querySelectorAll(".crew__no")) expect(tag).toHaveAttribute("aria-hidden", "true");
    // Only the six buttons are exposed from the portrait; the art inside them is decorative.
    expect(within(portrait).queryAllByRole("img")).toHaveLength(0);
  });
});
