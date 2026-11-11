import { render } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpriteStrip } from "../SpriteStrip";
import { flapDelayMs, spriteTiming } from "../timing";

const spritesCss = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../styles/sprites.css"), "utf8");

describe("sprite timing", () => {
  /** Feature: timewraith, Property 20: Sprite timing. **Validates: Requirements 4.4** */
  it("Property 20: steps equal frames and the loop lasts frames / fps seconds; the CSS steps by var(--frames)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 120 }), fc.double({ min: 0.5, max: 120, noNaN: true }), (n, fps) => {
        const t = spriteTiming(n, fps);
        expect(t.steps).toBe(n);
        expect(t.durationMs).toBeCloseTo((n / fps) * 1000, 9);
        const delay = flapDelayMs(n, t);
        expect(delay).toBeLessThanOrEqual(0);
        expect(delay).toBeGreaterThanOrEqual(-t.durationMs);
      }),
    );
    expect(spriteTiming(6, 12)).toEqual({ steps: 6, durationMs: 500 });
    expect(spritesCss).toContain("steps(var(--frames))");
    expect(spritesCss).toMatch(/translate3d\(-100%, 0, 0\)/);
    expect(spritesCss).toMatch(/html\[data-reduce-motion="true"\] \.sprite__strip \{\s*animation: none;/);
    expect(spritesCss).not.toMatch(/background-position/);
    expect(spritesCss).not.toMatch(/prefers-reduced-motion/);
  });

  it("rejects invalid input", () => {
    expect(() => spriteTiming(0, 12)).toThrow(RangeError);
    expect(() => spriteTiming(2.5, 12)).toThrow(RangeError);
    expect(() => spriteTiming(6, 0)).toThrow(RangeError);
  });
});

describe("SpriteStrip", () => {
  it("renders a decorative strip image inside a fixed-size frame", () => {
    const { container } = render(<SpriteStrip src="/bat-flap.webp" frameW={64} frameH={48} frames={6} fps={12} delayMs={-120} />);
    const frame = container.querySelector(".sprite") as HTMLElement;
    const img = container.querySelector("img.sprite__strip") as HTMLImageElement;
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.style.getPropertyValue("--fw")).toBe("64px");
    expect(frame.style.getPropertyValue("--frames")).toBe("6");
    expect(frame.style.getPropertyValue("--sprite-ms")).toBe("500ms");
    expect(frame.style.getPropertyValue("--sprite-delay")).toBe("-120ms");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("width")).toBe("384");
    expect(img.getAttribute("height")).toBe("48");
  });
});
