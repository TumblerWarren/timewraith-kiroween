import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestResult } from "../../director/types";
import { createDirectorHost, type RequestFn } from "../directorHost";
import { hasEntered, observeOnce } from "../useOnceOnEnter";

/** A controllable IntersectionObserver: each instance remembers the region it observes. */
class FakeIO {
  static live = new Set<FakeIO>();
  region = "";
  constructor(private readonly cb: IntersectionObserverCallback) {
    FakeIO.live.add(this);
  }
  observe(el: Element) {
    this.region = el.id;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  disconnect() {
    FakeIO.live.delete(this);
  }
  fire(ratio: number, visibleH: number) {
    const entry = {
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
      intersectionRect: { height: visibleH } as DOMRectReadOnly,
      rootBounds: { height: VIEWPORT_H } as DOMRectReadOnly,
    } as IntersectionObserverEntry;
    this.cb([entry], this as unknown as IntersectionObserver);
  }
}

const VIEWPORT_H = 800;
const REGIONS = ["open", "lost-hour", "library", "case", "crew", "flow", "close"] as const;

function fireFor(region: string, ratio: number, visible: number): void {
  for (const io of [...FakeIO.live]) if (io.region === region) io.fire(ratio, visible);
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIO);
  document.body.innerHTML = REGIONS.map((id) => `<section id="${id}"></section>`).join("");
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeIO.live.clear();
  document.body.innerHTML = "";
});

describe("hasEntered", () => {
  it("needs 35% of the region, or a region filling 35% of the viewport", () => {
    const e = (ratio: number, h: number) =>
      ({ isIntersecting: ratio > 0, intersectionRatio: ratio, intersectionRect: { height: h }, rootBounds: { height: 1000 } }) as IntersectionObserverEntry;
    expect(hasEntered(e(0, 0))).toBe(false);
    expect(hasEntered(e(0.2, 100))).toBe(false);
    expect(hasEntered(e(0.35, 100))).toBe(true);
    expect(hasEntered(e(0.1, 400))).toBe(true);
  });
});

describe("section reactions", () => {
  /** Feature: timewraith, Property 7: Section reactions play once. **Validates: Requirements 2.4, 3.11** */
  it("Property 7: each region requests its reaction at most once, and exactly once if it was ever entered", () => {
    const event = fc.record({
      region: fc.constantFrom(...REGIONS),
      ratio: fc.double({ min: 0, max: 1, noNaN: true }),
      visible: fc.double({ min: 0, max: 900, noNaN: true }),
      remount: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(event, { maxLength: 60 }), (events) => {
        const host = createDirectorHost({ reducedMotion: true });
        const calls: string[] = [];
        const request = ((_id: string, p: { region: string }) => {
          calls.push(p.region);
          return { status: "reduced", ticket: 1 } as RequestResult;
        }) as unknown as RequestFn;
        const fake = { request, claimOnce: host.claimOnce };
        const mount = (region: string) => observeOnce(fake, region, "section.reaction", () => ({ region, actors: [] }));
        const offs = new Map<string, () => void>(REGIONS.map((r) => [r, mount(r)]));
        const entered = new Set<string>();
        for (const ev of events) {
          // A remount (StrictMode, HMR) must not replay a reaction that already played.
          if (ev.remount) {
            offs.get(ev.region)?.();
            offs.set(ev.region, mount(ev.region));
          }
          if (ev.ratio > 0 && (ev.ratio >= 0.35 || ev.visible >= 0.35 * VIEWPORT_H)) entered.add(ev.region);
          fireFor(ev.region, ev.ratio, ev.visible);
        }
        for (const r of REGIONS) {
          const n = calls.filter((c) => c === r).length;
          expect(n).toBe(entered.has(r) ? 1 : 0);
        }
        offs.forEach((off) => off());
        host.stop();
      }),
    );
  });
});
