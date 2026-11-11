import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createFakeClock, flushMicrotasks, type FakeClock } from "../../../test/fakeClock";
import { createActorRegistry, type ActorController } from "../../actors";
import { MotionDirector } from "../../director/director";
import type { EnvPatch } from "../../director/types";
import type { BatPool, BatSprite, EffectServices } from "../../services";
import { instantAnimator, type Animator, type Keyframes } from "../animator";
import { EFFECTS, type EffectParamsMap } from "../registry";
import { SCATTER_BATS } from "../problem-scatter";

interface Anim {
  el: Element;
  kf: Keyframes;
  durationMs: number;
  delayMs: number;
}

function harness(env: EnvPatch = {}, actorIds: readonly string[] = []) {
  const clock: FakeClock = createFakeClock();
  const anims: Anim[] = [];
  const plays: { actor: string; pose: string; at: number; durationMs: number }[] = [];
  const animator: Animator = {
    animate(el, kf, opts) {
      anims.push({ el, kf, durationMs: opts.durationMs, delayMs: opts.delayMs ?? 0 });
      return instantAnimator.animate(el, kf, opts);
    },
    set: instantAnimator.set,
  };
  const actors = createActorRegistry();
  for (const id of actorIds) {
    const c: ActorController = {
      element: document.createElement("div"),
      play: (pose, o) => {
        plays.push({ actor: id, pose, at: clock.now(), durationMs: o?.durationMs ?? 0 });
        return Promise.resolve();
      },
      settle: () => {},
    };
    actors.register(id, c);
  }
  const free: BatSprite[] = Array.from({ length: 14 }, () => ({ element: document.createElement("div"), show() {}, hide() {} }));
  const bats: BatPool = { capacity: 14, acquire: (n) => free.splice(0, Math.max(0, n)), release: (b) => void free.push(...b) };
  const services: EffectServices = { actors, bats, overlay: { mark: () => {} }, animator, root: null };
  const director = new MotionDirector<EffectParamsMap>(EFFECTS, clock, {}, services);
  director.setEnv(env);
  return { clock, anims, plays, director, free, services };
}

const els = (n: number) => Array.from({ length: n }, () => document.createElement("div"));
const end = (a: Anim) => a.delayMs + a.durationMs;
const style = (el: Element) => (el as HTMLElement).style;

describe("crew.rollcall (task 14.8)", () => {
  const ids = Array.from({ length: 14 }, (_, i) => `crew:m${i}`);
  const actors = ids.map((actor) => ({ actor, pose: "wave" }));

  it("checks the 14 in one after another, 80 ms apart, everything inside 1.5 s", async () => {
    const h = harness({}, ids);
    const tags = els(14);
    expect(h.director.request("crew.rollcall", { actors, targets: tags }).status).toBe("started");
    h.clock.runAll();
    await flushMicrotasks(8);
    expect(h.plays.map((p) => p.actor)).toEqual(ids);
    expect(h.plays.map((p) => p.at)).toEqual(ids.map((_, i) => i * 80));
    for (const p of h.plays) expect(p.at + p.durationMs).toBeLessThanOrEqual(1500);
    expect(h.anims).toHaveLength(14);
    for (const a of h.anims) expect(end(a)).toBeLessThanOrEqual(1500);
    expect(h.director.snapshot().running).toEqual([]);
  });

  it("has no stagger when compact", () => {
    const h = harness({ compact: true }, ids);
    h.director.request("crew.rollcall", { actors, targets: els(14) });
    h.clock.runAll();
    expect(new Set(h.plays.map((p) => p.at))).toEqual(new Set([0]));
    expect(new Set(h.anims.map((a) => a.delayMs))).toEqual(new Set([0]));
  });
});

describe("cases.enter, case.draft-create and case.open (task 14.2)", () => {
  it("deals the cards in 70 ms apart and leaves each at rest inside 900 ms", () => {
    const h = harness();
    const cards = els(4);
    h.director.request("cases.enter", { targets: cards });
    expect(h.anims.map((a) => a.delayMs)).toEqual([0, 70, 140, 210]);
    for (const a of h.anims) expect(end(a)).toBeLessThanOrEqual(900);
    h.clock.runAll();
    for (const c of cards) expect(style(c).opacity).toBe("1");
  });

  it("property: any number of cards fits the 900 ms scene", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.boolean(), (n, compact) => {
        const h = harness({ compact });
        h.director.request("cases.enter", { targets: els(n) });
        return h.anims.length === n && h.anims.every((a) => end(a) <= 900) && (!compact || h.anims.every((a) => a.delayMs === 0));
      }),
      { numRuns: 60 },
    );
  });

  it("drops the new draft card in (y -32, scaleY .96) and draws its underline from the left, keyed by draft id", async () => {
    const h = harness({}, ["library:skeleton-scribe"]);
    const [card, line] = els(2) as unknown as [HTMLElement, HTMLElement];
    const p = { draftId: "d-1", targets: [card, line], actors: [{ actor: "library:skeleton-scribe", pose: "write" }] };
    expect(h.director.request("case.draft-create", p).status).toBe("started");
    expect(h.director.request("case.draft-create", p)).toEqual({ status: "dropped", reason: "duplicate" });
    const drop = h.anims.find((a) => a.el === card)!;
    expect(drop.kf.y).toEqual([-32, 4, 0]);
    expect((drop.kf.scaleY as number[])[0]).toBe(0.96);
    expect(h.anims.find((a) => a.el === line)?.kf.scaleX).toEqual([0, 1]);
    for (const a of h.anims) expect(end(a)).toBeLessThanOrEqual(900);
    h.clock.runAll();
    await flushMicrotasks(8);
    expect(h.plays.map((x) => x.actor)).toEqual(["library:skeleton-scribe"]);
    expect(style(card).opacity).toBe("1");
  });

  it("unfolds the case sheet from .94 in 480 ms; Reduce Motion shows it with an opacity fade of at most 120 ms", () => {
    const h = harness();
    const [sheet, tab] = els(2) as unknown as [HTMLElement, HTMLElement];
    h.director.request("case.open", { targets: [sheet, tab] });
    const unfold = h.anims.find((a) => a.el === sheet)!;
    expect(unfold.durationMs).toBe(480);
    expect((unfold.kf.scaleY as number[])[0]).toBe(0.94);
    expect(h.anims.find((a) => a.el === tab)?.kf.x).toEqual([12, -2, 0]);

    const r = harness({ reducedMotion: true });
    r.director.request("case.open", { targets: [sheet, tab] });
    expect(r.anims.every((a) => Object.keys(a.kf).join() === "opacity" && end(a) <= 120)).toBe(true);
    expect(style(sheet).opacity).toBe("1");
  });
});

describe("flow.step (task 14.7)", () => {
  it("rocks the sign, stamps the active marker and plays each landing mascot's act pose, inside 900 ms", async () => {
    const h = harness({}, ["flow:pumpkin-mechanic", "flow:cauldron-cat", "flow:spider-weaver"]);
    const [sign, marker] = els(2) as unknown as [HTMLElement, HTMLElement];
    const actors = ["flow:pumpkin-mechanic", "flow:cauldron-cat", "flow:spider-weaver"].map((actor) => ({ actor, pose: "act" }));
    expect(EFFECTS["flow.step"].key?.({ step: "run" })).toBe("flow.step:run");
    h.director.request("flow.step", { step: "run", targets: [sign, marker], actors });
    h.clock.runAll();
    await flushMicrotasks(8);
    expect(h.plays.map((p) => p.actor)).toEqual(actors.map((a) => a.actor));
    for (const p of h.plays) expect(p.at + p.durationMs).toBeLessThanOrEqual(900);
    expect(h.anims.map((a) => a.el)).toEqual([sign, marker]);
    expect(style(marker).opacity).toBe("1");
    expect(style(sign).transform).toMatch(/rotate\(0deg\)|^$/);
  });
});

describe("raven.stamp (task 14.9)", () => {
  it("lands the stamp, knocks the sheet and draws the Scribe's underline after it, inside 900 ms", async () => {
    const h = harness({}, ["close:raven-archivist", "close:skeleton-scribe"]);
    const [stamp, line, sheet] = els(3) as unknown as [HTMLElement, HTMLElement, HTMLElement];
    stamp.textContent = "Filed 06:58";
    h.director.request("raven.stamp", {
      targets: [stamp, line, sheet],
      actors: [
        { actor: "close:raven-archivist", pose: "bow" },
        { actor: "close:skeleton-scribe", pose: "write" },
      ],
    });
    const land = h.anims.find((a) => a.el === stamp)!;
    const draw = h.anims.find((a) => a.el === line)!;
    expect(draw.delayMs).toBeGreaterThan(land.delayMs + land.durationMs * 0.9);
    for (const a of h.anims) expect(end(a)).toBeLessThanOrEqual(900);
    h.clock.runAll();
    await flushMicrotasks(8);
    expect(h.plays.map((p) => p.actor)).toEqual(["close:raven-archivist", "close:skeleton-scribe"]);
    expect(stamp.textContent).toBe("Filed 06:58");
    expect(style(stamp).opacity).toBe("1");
  });
});

describe("Lost Hour: clock.crack and problem.scatter (task 14.1)", () => {
  const origin = { x: 600, y: 400, w: 56, h: 56 };
  const bounds = { x: 0, y: 0, w: 1440, h: 900 };

  it("draws the crack down from the top and jolts the Clock", () => {
    const h = harness();
    const [crack, clock] = els(2) as unknown as [HTMLElement, HTMLElement];
    h.director.request("clock.crack", { targets: [crack, clock] });
    expect(h.anims.find((a) => a.el === crack)?.kf.scaleY).toEqual([0, 1.06, 1]);
    expect(h.anims.find((a) => a.el === clock)?.kf.x).toBeDefined();
    for (const a of h.anims) expect(end(a)).toBeLessThanOrEqual(700);
  });

  it("scatters five Mini Bats (three compact) out of the gap and returns them to the pool", async () => {
    for (const compact of [false, true]) {
      const h = harness({ compact });
      const crack = document.createElement("div");
      expect(h.director.request("problem.scatter", { targets: [crack], origin, bounds, seed: 7 }).status).toBe("started");
      const flights = h.anims.length;
      expect(flights).toBe(compact ? SCATTER_BATS.compact : SCATTER_BATS.regular);
      for (const a of h.anims) expect(end(a)).toBeLessThanOrEqual(1200);
      expect(style(crack).opacity).toBe("1");
      h.clock.runAll();
      await flushMicrotasks(8);
      expect(h.free).toHaveLength(14);
    }
  });

  it("Reduce Motion: the crack is shown and nothing flies", () => {
    const h = harness({ reducedMotion: true });
    const crack = document.createElement("div");
    expect(h.director.request("problem.scatter", { targets: [crack], origin, bounds, seed: 7 }).status).toBe("reduced");
    expect(h.anims.every((a) => Object.keys(a.kf).join() === "opacity")).toBe(true);
    expect(h.free).toHaveLength(14);
    expect(style(crack).opacity).toBe("1");
  });
});

describe("cancel settles to rest", () => {
  it("a region scene cancelled by a P1 scene leaves its targets visible and untransformed", () => {
    const h = harness();
    const cards = els(3) as HTMLElement[];
    h.director.request("cases.enter", { targets: cards });
    h.clock.advance(100);
    h.director.request("raven.stamp", { targets: els(1) });
    for (const c of cards) {
      expect(style(c).opacity).toBe("1");
      expect(style(c).transform).not.toMatch(/translate\(0px, -24px\)/);
    }
  });
});
