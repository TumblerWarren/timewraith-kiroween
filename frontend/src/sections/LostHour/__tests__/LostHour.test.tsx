/// <reference types="node" />
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROBLEM_ILLUSTRATION_LABEL } from "../../../content/copy";
import { PROBLEM_STAMP_AFTER, PROBLEM_STAMP_BEFORE } from "../../../content/sections";
import { LostHour } from "../LostHour";

describe("Lost Hour scene (was Problem, pass B)", () => {
  it("keeps the illustration caption and never shows a 02:xx reading", () => {
    const { container } = render(<LostHour />);
    expect(container.querySelector("figcaption")).toHaveTextContent(PROBLEM_ILLUSTRATION_LABEL);
    expect(container.textContent ?? "").not.toMatch(/\b02:\d\d\b/);
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label") ?? "").not.toMatch(/\b02:\d\d\b/);
    }
  });

  it("stamps 01:59 and 03:00 as time elements at seeded slap angles", () => {
    const { container } = render(<LostHour />);
    const before = container.querySelector(".problem__stamp--before") as HTMLElement;
    const after = container.querySelector(".problem__stamp--after") as HTMLElement;
    expect(before.querySelector("time")).toHaveAttribute("dateTime", PROBLEM_STAMP_BEFORE.time);
    expect(after.querySelector("time")).toHaveAttribute("dateTime", PROBLEM_STAMP_AFTER.time);
    for (const stamp of [before, after]) {
      const tilt = Math.abs(parseFloat(stamp.style.getPropertyValue("--tilt")));
      expect(tilt).toBeGreaterThanOrEqual(4);
      expect(tilt).toBeLessThanOrEqual(10);
    }
  });

  it("keeps the animation hooks: the Clock hands, the static crack, both thread drawings and the sticky scene", () => {
    const { container } = render(<LostHour />);
    expect(screen.getByRole("img", { name: "Tower clock reading 01:59" })).toBeInTheDocument();
    expect(container.querySelector('#problem-clock [data-clock-hand="hour"]')).not.toBeNull();
    expect(container.querySelector('#problem-clock [data-clock-hand="minute"]')).not.toBeNull();
    expect(container.querySelector('[data-crack="static"]')).not.toBeNull();
    expect(container.querySelector(".problem__thread--row")).not.toBeNull();
    expect(container.querySelector(".problem__thread--column")).not.toBeNull();
    expect(container.querySelector(".problem__track")).toHaveAttribute("data-scene", "sticky");
  });

  it("scrubs over 160vh on desktop and 120vh on compact screens (decision D18)", () => {
    // A variable path: Vite rewrites `new URL("literal", import.meta.url)` into an asset URL.
    const rel = "../../../styles/sections/problem.css";
    const css = readFileSync(new URL(rel, import.meta.url), "utf8");
    expect(css).toMatch(/\.problem__track\[data-scene="sticky"\]\s*\{\s*height:\s*120vh;/);
    expect(css).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.problem__track\[data-scene="sticky"\]\s*\{\s*height:\s*160vh;/);
  });

  it("adds the Mini Bat on the crack and the peeking Mini Ghost as decoration only", () => {
    const { container } = render(<LostHour />);
    const bat = container.querySelector('[data-problem-mascot="mini-bat"]');
    const ghost = container.querySelector('[data-problem-mascot="mini-ghost"]');
    expect(bat?.closest(".problem__clock")).not.toBeNull();
    for (const el of [bat, ghost]) {
      expect(el).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.queryByRole("img", { name: "Mini Bat" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Mini Ghost" })).toBeNull();
  });
});
