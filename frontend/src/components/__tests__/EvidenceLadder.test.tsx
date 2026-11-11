import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EVIDENCE_LADDER, EVIDENCE_STATUSES, INCONCLUSIVE } from "../../content/evidence";
import { EvidenceLadder } from "../EvidenceLadder";
import { LadderStrip } from "../LadderStrip";

describe("EvidenceLadder (Requirements 8.1, 8.2, 8.3, 8.6)", () => {
  it("lists the five rungs in order in one <ol>, lowest first", () => {
    render(<EvidenceLadder />);
    const list = screen.getByRole("list", { name: /Evidence Ladder/ });
    expect(list.tagName).toBe("OL");
    const rungs = within(list).getAllByRole("listitem");
    expect(rungs.map((r) => r.getAttribute("data-status"))).toEqual([
      "planned",
      "observed-anomaly",
      "reproduced",
      "known-issue-match",
      "fixed-version-verified",
    ]);
    expect(rungs.map((r) => r.getAttribute("data-rank"))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("prints a label and a one-line definition for every status", () => {
    render(<EvidenceLadder />);
    for (const status of EVIDENCE_STATUSES) {
      expect(screen.getByText(status.label)).toBeInTheDocument();
      expect(screen.getByText(status.definition)).toBeInTheDocument();
    }
  });

  it("shows Inconclusive apart from the ordered list", () => {
    const { container } = render(<EvidenceLadder />);
    const list = container.querySelector("ol.ladder") as HTMLElement;
    const inconclusive = container.querySelector(".ladder__inconclusive") as HTMLElement;
    expect(inconclusive).not.toBeNull();
    expect(inconclusive).toHaveTextContent(INCONCLUSIVE.label);
    expect(list).not.toContainElement(inconclusive);
    expect(within(list).queryByText(INCONCLUSIVE.label)).toBeNull();
  });

  it("gives each of the six statuses its own shape, besides the text", () => {
    const { container } = render(<EvidenceLadder />);
    const shapes = Array.from(container.querySelectorAll("svg[data-shape]")).map((s) => s.getAttribute("data-shape"));
    expect(shapes).toEqual(EVIDENCE_STATUSES.map((s) => s.shape));
    expect(new Set(shapes).size).toBe(6);
  });
});

describe("LadderStrip", () => {
  it.each(EVIDENCE_LADDER)("marks only the $label rung as current and the lower rungs as reached", (status) => {
    const { container } = render(<LadderStrip current={status.id} />);
    const rungs = Array.from(container.querySelectorAll("li.ladder-strip__rung"));
    expect(rungs).toHaveLength(5);
    const current = rungs.filter((r) => r.getAttribute("aria-current") === "step");
    expect(current.map((r) => r.getAttribute("data-status"))).toEqual([status.id]);
    expect(rungs.filter((r) => r.getAttribute("data-state") === "reached")).toHaveLength((status.rank as number) - 1);
    expect(current[0]).toHaveTextContent("now");
  });

  it("marks no rung as current for Inconclusive and highlights the separate block instead", () => {
    const { container } = render(<LadderStrip current="inconclusive" />);
    expect(container.querySelectorAll('li[aria-current="step"]')).toHaveLength(0);
    expect(container.querySelector(".ladder-strip__other")).toHaveAttribute("data-state", "current");
  });
});
