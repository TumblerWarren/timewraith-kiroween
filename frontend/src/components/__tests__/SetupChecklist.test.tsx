import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHECKLIST_LABEL } from "../../content/copy";
import { SETUP_CHECKS, SETUP_STATES } from "../../data/setup-checklist";
import { SetupChecklist } from "../SetupChecklist";

describe("SetupChecklist (Requirements 6.1 to 6.4, 16.4)", () => {
  it("puts the label 'Demo mode, simulated status' inside the checklist region as its heading", () => {
    render(<SetupChecklist />);
    const region = screen.getByRole("region", { name: CHECKLIST_LABEL });
    expect(region).toHaveClass("hero__board");
    expect(within(region).getByRole("heading", { level: 2, name: CHECKLIST_LABEL })).toBeInTheDocument();
  });

  it("lists every check with its simulated status as text and a distinct shape", () => {
    render(<SetupChecklist />);
    const region = screen.getByRole("region", { name: CHECKLIST_LABEL });
    const rows = within(region).getAllByRole("listitem");
    expect(rows).toHaveLength(SETUP_CHECKS.length);
    SETUP_CHECKS.forEach((check, i) => {
      const state = SETUP_STATES[check.state];
      const row = rows[i] as HTMLElement;
      expect(row).toHaveTextContent(check.label);
      expect(row).toHaveTextContent(state.text);
      expect(state.text.toLowerCase()).toContain("simulated");
      expect(row.querySelector(`svg[data-shape="${state.shape}"]`)).not.toBeNull();
    });
    const shapes = new Set(Array.from(region.querySelectorAll("svg[data-shape]")).map((s) => s.getAttribute("data-shape")));
    expect(shapes.size).toBe(3);
  });

  it("never presents a status as running or live", () => {
    render(<SetupChecklist />);
    expect(screen.getByRole("region", { name: CHECKLIST_LABEL }).textContent ?? "").not.toMatch(/\blive\b/i);
  });
});
