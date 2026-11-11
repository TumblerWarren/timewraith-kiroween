import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CREW } from "../../content/crew";
import * as crew from "../../content/crew";
import { MASCOT_IDS } from "../ids";
import { misregistration, PlaceholderMascot } from "../placeholder/PlaceholderMascot";
import { inkPath } from "../placeholder/inkPath";
import { ROSTER, MASCOT_ART } from "../roster";

describe("mascot ids and roster", () => {
  it("keeps one source of truth for the ids", () => {
    expect(crew.MASCOT_IDS).toBe(MASCOT_IDS);
    expect(MASCOT_IDS).toHaveLength(14);
    expect(MASCOT_IDS).toContain("doctor-stitch");
  });

  it("points Doctor Stitch at the real pose asset id and the D15 rig parts", () => {
    expect(MASCOT_ART["doctor-stitch"].pose).toBe("doctor-stitch/pose");
    expect(MASCOT_ART["doctor-stitch"].rig).toEqual(["doctor-stitch/body", "doctor-stitch/arm-needle", "doctor-stitch/eyes"]);
  });

  it("has an art spec and a roster entry for every mascot", () => {
    expect(ROSTER.map((m) => m.id)).toEqual(CREW.map((m) => m.id));
    for (const id of MASCOT_IDS) {
      expect(MASCOT_ART[id].pose.startsWith(`${id}/`)).toBe(true);
      expect(MASCOT_ART[id].rig.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("PlaceholderMascot", () => {
  it.each(CREW.map((m) => [m.id, m.name] as const))("%s draws an svg named %s", (id, name) => {
    const { container } = render(<PlaceholderMascot id={id} />);
    expect(screen.getByRole("img", { name })).toBeInTheDocument();
    const svg = container.querySelector("svg");
    expect(svg?.querySelectorAll("path,circle,ellipse").length).toBeGreaterThan(3);
    expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${MASCOT_ART[id].size.w} ${MASCOT_ART[id].size.h}`);
  });

  it("uses palette variables only (no colour literals)", () => {
    const { container } = render(
      <>
        {MASCOT_IDS.map((id) => (
          <PlaceholderMascot key={id} id={id} />
        ))}
      </>,
    );
    const paints = [...container.querySelectorAll("[fill],[stroke]")].flatMap((el) => [el.getAttribute("fill"), el.getAttribute("stroke")]);
    for (const paint of paints) {
      if (paint && paint !== "none") expect(paint).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
});

describe("ink misregistration (visual revision R1)", () => {
  it("prints a colour plate offset 2 to 2.8 units from the ink plate, in a direction that differs per mascot", () => {
    const offsets = MASCOT_IDS.map((id) => {
      const { container } = render(<PlaceholderMascot id={id} />);
      const fill = container.querySelector('g[data-plate="fill"]');
      const ink = container.querySelector('g[data-plate="ink"]');
      expect(fill).not.toBeNull();
      expect(ink).not.toBeNull();
      expect(ink).not.toHaveAttribute("transform");
      const m = /^translate\(([-\d.]+) ([-\d.]+)\)$/.exec(fill?.getAttribute("transform") ?? "");
      expect(m).not.toBeNull();
      const [dx, dy] = [Number(m?.[1]), Number(m?.[2])];
      // The Mummy's plate is capped at 1.3 units so its bandage lines do not read as a double outline.
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(id === "mummy-wrapper" ? 1.28 : 1.98);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(2.82);
      expect(misregistration(id)).toEqual(misregistration(id));
      return `${dx},${dy}`;
    });
    expect(new Set(offsets).size).toBe(MASCOT_IDS.length);
  });

  it("varies the stroke width between outlines", () => {
    const { container } = render(<PlaceholderMascot id="wraith-director" />);
    const widths = [...container.querySelectorAll('g[data-plate="ink"] path[stroke-width]')].map((p) => p.getAttribute("stroke-width"));
    expect(new Set(widths).size).toBeGreaterThan(2);
  });
});

describe("inkPath", () => {
  it("is deterministic and finite, and the seed changes the wobble", () => {
    const pts = [[0, 0], [10, 0, 1], [10, 10], [0, 10]] as const;
    expect(inkPath(pts, { seed: 3 })).toBe(inkPath(pts, { seed: 3 }));
    expect(inkPath(pts, { seed: 3 })).not.toBe(inkPath(pts, { seed: 4 }));
    expect(inkPath(pts)).not.toMatch(/NaN|Infinity/);
    expect(inkPath([])).toBe("");
  });
});
