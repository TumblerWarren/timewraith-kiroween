import { render, screen } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Clock } from "../Clock";
import { clockHandAngles, formatClockTime } from "../clockAngles";

describe("clockHandAngles", () => {
  it("puts 23:59 almost straight up for the hour hand and one minute short of 12 for the minute hand", () => {
    expect(clockHandAngles(23, 59)).toEqual({ hour: 359.5, minute: 354 });
    expect(clockHandAngles(1, 59)).toEqual({ hour: 59.5, minute: 354 });
    expect(clockHandAngles(0, 0)).toEqual({ hour: 0, minute: 0 });
  });

  it("formats HH:MM with leading zeros", () => {
    expect(formatClockTime(1, 5)).toBe("01:05");
    expect(formatClockTime(23, 59)).toBe("23:59");
  });

  it("keeps both angles in [0, 360) and the hands consistent for any time", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (h, m) => {
        const a = clockHandAngles(h, m);
        expect(a.hour).toBeGreaterThanOrEqual(0);
        expect(a.hour).toBeLessThan(360);
        expect(a.minute).toBeGreaterThanOrEqual(0);
        expect(a.minute).toBeLessThan(360);
        // The hour hand advances half a degree per minute, so the minute hand is determined by it.
        expect((a.hour % 30) * 12).toBe(a.minute);
      }),
    );
  });
});

describe("Clock", () => {
  it("is one image named with its reading, defaulting to 23:59", () => {
    render(<Clock />);
    const clock = screen.getByRole("img", { name: "Tower clock reading 23:59" });
    expect(clock).toHaveAttribute("data-clock-time", "23:59");
    expect(clock).toHaveAttribute("id", "clock");
  });

  it("draws the hour and minute hands as separate SVG elements outside the face, with stable ids", () => {
    const { container } = render(<Clock id="hero-clock" hours={23} minutes={59} />);
    const face = container.querySelector(".clock__face");
    const handsSvg = container.querySelector(".clock__hands");
    expect(face?.tagName.toLowerCase()).toBe("svg");
    expect(handsSvg?.tagName.toLowerCase()).toBe("svg");
    expect(face?.contains(handsSvg)).toBe(false);
    expect(handsSvg?.contains(face)).toBe(false);

    const hour = container.querySelector('[data-clock-hand="hour"]');
    const minute = container.querySelector('[data-clock-hand="minute"]');
    expect(hour).toHaveAttribute("id", "hero-clock-hand-hour");
    expect(minute).toHaveAttribute("id", "hero-clock-hand-minute");
    expect(handsSvg?.contains(hour)).toBe(true);
    expect(handsSvg?.contains(minute)).toBe(true);
    expect(face?.querySelector("[data-clock-hand]")).toBeNull();
    expect(hour).toHaveAttribute("data-angle", "359.5");
    expect(minute).toHaveAttribute("data-angle", "354");
    expect((hour as SVGElement).style.transform).toBe("rotate(359.5deg)");
  });

  it("shows the reading it is given", () => {
    const { container } = render(<Clock id="problem-clock" hours={1} minutes={59} />);
    expect(screen.getByRole("img", { name: "Tower clock reading 01:59" })).toBeInTheDocument();
    expect(container.querySelector('[data-clock-hand="hour"]')).toHaveAttribute("data-angle", "59.5");
  });
});
