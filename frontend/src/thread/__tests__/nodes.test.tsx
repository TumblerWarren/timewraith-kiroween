import { render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { CLOCK_ENTRY_MS } from "../../animation/constants";
import { SECTION_NODES } from "../../content/nodes";
import { buildThread } from "../geometry";
import { SectionNode } from "../SectionNode";
import { writeDash } from "../ThreadLayer";

const SRC = join(__dirname, "..", "..");
const css = (file: string) => readFileSync(join(SRC, "styles", file), "utf8");

describe("Section_Nodes", () => {
  it("are native anchors to their region, with aria-current only on the active one", () => {
    render(
      <ol>
        {SECTION_NODES.map((n, i) => (
          <li key={n.id}>
            <SectionNode node={n} x={40} y={100 * (i + 1)} active={n.id === "library"} />
          </li>
        ))}
      </ol>,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(SECTION_NODES.length);
    SECTION_NODES.forEach((n, i) => expect(links[i]).toHaveAttribute("href", `#${n.id}`));
    const current = links.filter((l) => l.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "#library");
    expect(screen.getByRole("link", { name: /Region 2 of 7: The lost hour/ })).toBeInTheDocument();
  });
});

describe("stacking and overlay", () => {
  it("orders overlay 40 < ledge 45 < node 46 < nav 50 in the tokens", () => {
    const tokens = css("tokens.css");
    const z = (name: string) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(tokens)?.[1]);
    expect(z("overlay")).toBe(40);
    expect(z("ledge")).toBeGreaterThan(z("overlay"));
    expect(z("node")).toBeGreaterThan(z("ledge"));
    expect(z("nav")).toBeGreaterThan(z("node"));
  });

  it("keeps the Overlay_Layer fixed and out of pointer events, and <main> free of a stacking context", () => {
    const motion = css("motion.css");
    const overlay = /\.overlay-layer\s*\{([^}]*)\}/.exec(motion)?.[1] ?? "";
    expect(overlay).toMatch(/position:\s*fixed/);
    expect(overlay).toMatch(/pointer-events:\s*none/);
    expect(overlay).toMatch(/z-index:\s*var\(--z-overlay\)/);
    const main = /#main\s*\{([^}]*)\}/.exec(css("layout.css"))?.[1] ?? "";
    expect(main).toMatch(/position:\s*relative/);
    expect(main).not.toMatch(/z-index|transform/);
  });
});

describe("thread draw", () => {
  it("is fully drawn at the last anchor (Reduce Motion) and hidden above the first", () => {
    const model = buildThread(
      [
        { x: 40, y: 100 },
        { x: 44, y: 900 },
        { x: 40, y: 2000 },
      ],
      7998,
    );
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    writeDash(model, [path], [model.totalLength], 2000);
    expect(Number(path.style.strokeDashoffset)).toBe(0);
    writeDash(model, [path], [model.totalLength], 0);
    expect(Number(path.style.strokeDashoffset)).toBeCloseTo(model.totalLength, 1);
  });
});

describe("motion boundaries", () => {
  it("clock entry lasts 580 ms, within 500 to 650", () => {
    expect(CLOCK_ENTRY_MS).toBe(580);
    expect(CLOCK_ENTRY_MS).toBeGreaterThanOrEqual(500);
    expect(CLOCK_ENTRY_MS).toBeLessThanOrEqual(650);
  });

  it("imports gsap only inside src/animation/", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== "__tests__") walk(p);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const rel = relative(SRC, p).split(sep).join("/");
          if (!rel.startsWith("animation/") && /from\s+["']gsap(\/[^"']*)?["']|import\(\s*["']gsap/.test(readFileSync(p, "utf8"))) offenders.push(rel);
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
