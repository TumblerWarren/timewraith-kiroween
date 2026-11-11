import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { createFakeClock, flushMicrotasks } from "../../../test/fakeClock";
import { createActorRegistry, type ActorController } from "../../actors";
import { MAX_REDUCED_FADE_MS } from "../../constants";
import { MotionDirector } from "../../director/director";
import type { EffectContext, EffectDef, EnvPatch } from "../../director/types";
import type { BatPool, BatSprite, EffectServices, MarkKind } from "../../services";
import { instantAnimator, type AnimOptions, type Animator, type Keyframes } from "../animator";
import { EFFECTS, EFFECT_IDS, STUB_EFFECT_IDS, type EffectId, type EffectParamsMap, type EffectRegistry, type ParamsOf } from "../registry";

// ------------------------------------------------------------------ fixtures

const el = () => document.createElement("div");
const rect = { x: 100, y: 500, w: 160, h: 48 };
const bounds = { x: 0, y: 0, w: 1440, h: 900 };

/** One valid params object per effect id (fresh elements on every call). */
function sampleParams(): { [K in EffectId]: ParamsOf<K> } {
  const reveal = () => ({ targets: [el(), el()], actors: [{ actor: "raven-archivist", pose: "nod" }] });
  return {
    "ui.reduce-motion-ack": { mark: el() },
    "focus.yield": { elements: [el()] },
    "hero.clock-entry": { hour: el(), minute: el(), face: el() },
    "replay.event": { ...reveal(), eventId: "e1" },
    "clock.crack": reveal(),
    "raven.stamp": reveal(),
    "ladder.rung": { ...reveal(), rung: 2 },
    "replay.fixed-pass": { ...reveal(), caseId: "fullcalendar-7998", eventId: "e9" },
    "replay.reveal": { ...reveal(), caseId: "calcom-30021", eventId: "e7" },
    "timeline.milestone": { ...reveal(), caseId: "calcom-30021", kind: "reproduced", ring: el(), stamp: el(), segment: el() },
    "bats.burst": { origin: rect, bounds, seed: 7 },
    "problem.scatter": reveal(),
    "bat.travel": { from: { x: 10, y: 10 }, to: { x: 400, y: 300 }, onScreen: true },
    "bat.to-point": { from: { x: 10, y: 10 }, to: { x: 300, y: 200 } },
    "section.reaction": { region: "open", actors: [{ actor: "wraith-director", pose: "enter" }, { actor: "mini-bat", pose: "roost" }] },
    "crew.rollcall": reveal(),
    "cases.enter": reveal(),
    "case.draft-create": { ...reveal(), draftId: "d1" },
    "case.open": reveal(),
    "stitch.sew": { ...reveal(), caseId: "fullcalendar-7998" },
    "proof.ladder": { caseId: "fullcalendar-7998", armed: el(), rod: el(), travel: 240, rungs: [el(), el(), el(), el(), el()], shapes: [el(), el(), el(), el(), el()], ranks: [el(), el(), el(), el(), el()], actors: [{ actor: "raven-archivist", pose: "unroll" }] },
    "proof.hash": { caseId: "fullcalendar-7998", armed: el(), strip: el(), turns: [el(), el()], end: el(), tag: el(), value: el(), actors: [{ actor: "raven-archivist", pose: "bandage" }] },
    "proof.jack": { caseId: "fullcalendar-7998", armed: el(), browserFace: el(), serverFace: el(), browserUnderline: el(), serverUnderline: el(), browserCaption: el(), serverCaption: el(), actors: [{ actor: "raven-archivist", pose: "flip" }] },
    "ghost.arrive": { region: "library", actor: "mini-ghost", at: { x: 200, y: 300 } },
    "flow.step": { ...reveal(), step: "approve" },
    "mascot.hover": { actor: "cauldron-cat", pose: "hiss" },
    "scroll.to": { target: el() },
    "idle.beat": { actor: "wraith-director", pose: "lantern", region: "open" },
    "ghost.look": { at: { x: 200, y: 300 } },
    "bat.flyby": { bounds, seed: 3 },
  };
}

interface Recorded {
  services: EffectServices;
  animations: { keys: string[]; durationMs: number; delayMs: number }[];
  marks: { kind: MarkKind; fadeMs: number }[];
  plays: string[];
  settles: string[];
}

function recordingServices(): Recorded {
  const rec: Recorded = { services: undefined as unknown as EffectServices, animations: [], marks: [], plays: [], settles: [] };
  const animator: Animator = {
    animate(target, kf, opts) {
      rec.animations.push({ keys: Object.keys(kf), durationMs: opts.durationMs, delayMs: opts.delayMs ?? 0 });
      return instantAnimator.animate(target, kf, opts);
    },
    set: instantAnimator.set,
  };
  const actors = createActorRegistry();
  for (const id of ["raven-archivist", "wraith-director", "mini-bat", "cauldron-cat", "mini-ghost"]) {
    const c: ActorController = {
      element: el(),
      play: (pose) => {
        rec.plays.push(`${id}:${pose}`);
        return Promise.resolve();
      },
      settle: (pose) => void rec.settles.push(`${id}:${pose ?? "rest"}`),
      look: () => {},
    };
    actors.register(id, c);
  }
  const free: BatSprite[] = Array.from({ length: 14 }, () => ({ element: el(), show() {}, hide() {} }));
  const bats: BatPool = {
    capacity: 14,
    acquire: (n) => free.splice(0, Math.max(0, n)),
    release: (b) => void free.push(...b),
  };
  rec.services = {
    actors,
    bats,
    overlay: { mark: (kind, _at, fadeMs) => void rec.marks.push({ kind, fadeMs }) },
    animator,
    root: null,
  };
  return rec;
}

const ctxOf = (services: EffectServices): EffectContext => ({
  env: { reducedMotion: false, hidden: false, compact: false, suppressed: { input: false, scrubber: false } },
  clock: createFakeClock(),
  services,
  batBudget: 7,
});

// ------------------------------------------------------------------ registry shape

describe("effect registry", () => {
  it("holds exactly the design's effect ids, each under its own id", () => {
    expect(Object.keys(EFFECTS).sort()).toEqual([...EFFECT_IDS].sort());
    for (const id of EFFECT_IDS) expect(EFFECTS[id].id).toBe(id);
  });

  it("matches the design table's priority and kind for every id", () => {
    const table: Record<EffectId, [number, string, number, boolean]> = {
      "ui.reduce-motion-ack": [0, "micro", 300, true],
      "focus.yield": [0, "micro", 150, true],
      "hero.clock-entry": [1, "scene", 650, true],
      "replay.event": [1, "micro", 600, true],
      "clock.crack": [1, "micro", 700, true],
      "raven.stamp": [1, "scene", 900, true],
      "ladder.rung": [1, "micro", 400, true],
      "replay.fixed-pass": [1, "micro", 900, true],
      "replay.reveal": [1, "scene", 1200, true],
      "timeline.milestone": [1, "micro", 500, true],
      "bats.burst": [2, "burst", 1200, true],
      "problem.scatter": [2, "burst", 1200, true],
      "bat.travel": [2, "burst", 1400, true],
      "bat.to-point": [2, "burst", 1300, true],
      "section.reaction": [2, "scene", 1200, true],
      "crew.rollcall": [2, "scene", 1500, true],
      "cases.enter": [2, "scene", 900, true],
      "case.draft-create": [2, "scene", 900, true],
      "case.open": [2, "scene", 600, true],
      "stitch.sew": [2, "scene", 1400, true],
      "proof.ladder": [2, "micro", 1500, true],
      "proof.hash": [2, "micro", 1400, true],
      "proof.jack": [2, "micro", 1100, true],
      "ghost.arrive": [2, "micro", 900, true],
      "flow.step": [2, "scene", 900, true],
      "mascot.hover": [2, "micro", 450, true],
      "scroll.to": [2, "micro", 1200, true],
      "idle.beat": [3, "ambient", 1800, false],
      "ghost.look": [3, "ambient", 1200, false],
      "bat.flyby": [3, "ambient", 2400, false],
    };
    for (const id of EFFECT_IDS) {
      const d = EFFECTS[id];
      expect([d.priority, d.kind, d.maxDurationMs, d.allowCompact], id).toEqual(table[id]);
    }
  });

  it("stubs settle and complete at once", async () => {
    for (const id of STUB_EFFECT_IDS) {
      const rec = recordingServices();
      const def = EFFECTS[id] as EffectDef<unknown>;
      const handle = def.run(ctxOf(rec.services), sampleParams()[id]);
      await expect(handle.finished).resolves.toBe("completed");
      expect(rec.settles.length, id).toBeGreaterThan(0);
    }
  });

  it("uses the design's duplicate keys for case and replay effects", () => {
    const p = sampleParams();
    expect(EFFECTS["case.open"].key).toBeUndefined();
    expect(EFFECTS["case.draft-create"].key?.(p["case.draft-create"])).toContain("d1");
    expect(EFFECTS["stitch.sew"].key?.(p["stitch.sew"])).toContain("fullcalendar-7998");
    expect(EFFECTS["replay.fixed-pass"].key?.(p["replay.fixed-pass"])).toContain("e9");
    expect(EFFECTS["replay.reveal"].key?.(p["replay.reveal"])).toContain("calcom-30021:e7");
  });
});

// ------------------------------------------------------------------ Property 6

const ALLOWED_PRIORITIES = [0, 1, 2, 3];
const ALLOWED_KINDS = ["scene", "burst", "micro", "ambient"];

describe("Reduce Motion fallback coverage", () => {
  /** Feature: timewraith, Property 6: Every effect has a bounded Reduce Motion fallback. **Validates: Requirements 9.2, 10.4, 10.6, 10.7, 10.9, 15.5** */
  it("Property 6: every registry effect has settle and a bounded fallback; Reduce Motion calls only the fallback", async () => {
    const envArb: fc.Arbitrary<EnvPatch> = fc.record({
      hidden: fc.boolean(),
      compact: fc.boolean(),
      suppressed: fc.record({ input: fc.boolean(), scrubber: fc.boolean() }),
    });
    await fc.assert(
      fc.asyncProperty(fc.shuffledSubarray([...EFFECT_IDS], { minLength: 1 }), envArb, async (ids, env) => {
        const rec = recordingServices();
        const runs: string[] = [];
        const applies: string[] = [];
        // Wrap every entry so we can see which path the director takes.
        const spied = Object.fromEntries(
          EFFECT_IDS.map((id) => {
            const d = EFFECTS[id] as EffectDef<unknown>;
            const wrapped: EffectDef<unknown> = {
              ...d,
              run: (ctx, p) => {
                runs.push(id);
                return d.run(ctx, p);
              },
              fallback: {
                ...d.fallback,
                apply: (ctx, p) => {
                  applies.push(id);
                  d.fallback.apply(ctx, p);
                },
              },
            };
            return [id, wrapped];
          }),
        ) as unknown as EffectRegistry;
        const director = new MotionDirector<EffectParamsMap>(spied, createFakeClock(), {}, rec.services);
        director.setEnv({ ...env, reducedMotion: true });
        const params = sampleParams();
        for (const id of ids) {
          const def = EFFECTS[id];
          expect(ALLOWED_PRIORITIES).toContain(def.priority);
          expect(ALLOWED_KINDS).toContain(def.kind);
          expect(typeof def.settle).toBe("function");
          expect(typeof def.run).toBe("function");
          expect(["static", "fade"]).toContain(def.fallback.kind);
          expect(typeof def.fallback.apply).toBe("function");
          if (def.fallback.kind === "fade") expect(def.fallback.fadeMs).toBeDefined();
          expect(def.fallback.fadeMs ?? 0).toBeLessThanOrEqual(MAX_REDUCED_FADE_MS);

          const before = rec.animations.length;
          const result = director.request(id, params[id] as never);
          expect(result.status, id).toBe("reduced");
          // Only an opacity fade of at most 150 ms may animate; transforms jump to their final state.
          for (const a of rec.animations.slice(before)) {
            expect(a.keys, id).toEqual(["opacity"]);
            expect(a.durationMs + a.delayMs, id).toBeLessThanOrEqual(MAX_REDUCED_FADE_MS);
          }
        }
        await flushMicrotasks();
        expect(runs).toEqual([]);
        expect([...applies].sort()).toEqual([...ids].sort());
        for (const m of rec.marks) expect(m.fadeMs).toBeLessThanOrEqual(MAX_REDUCED_FADE_MS);
        expect(rec.plays).toEqual([]);
        expect(director.snapshot().running).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

// ------------------------------------------------------------------ real effects in normal mode

describe("shared effects (motion on)", () => {
  it("every effect runs to completion with stub services and touches only transforms and opacity", async () => {
    for (const id of EFFECT_IDS) {
      const rec = recordingServices();
      const clock = createFakeClock();
      const director = new MotionDirector<EffectParamsMap>(EFFECTS, clock, {}, rec.services);
      const result = director.request(id, sampleParams()[id] as never);
      expect(["started", "dropped"]).toContain(result.status);
      clock.runAll();
      await flushMicrotasks(8);
      clock.runAll();
      await flushMicrotasks(8);
      expect(director.snapshot().running, id).toEqual([]);
      for (const a of rec.animations) {
        for (const k of a.keys) expect(["x", "y", "rotate", "scale", "scaleX", "scaleY", "opacity"], id).toContain(k);
      }
    }
  });

  it("hero.clock-entry sweeps both hands in 580 ms to 23:59 with a minute overshoot", () => {
    const rec = recordingServices();
    const calls: { kf: Keyframes; durationMs: number }[] = [];
    const services = {
      ...rec.services,
      animator: { ...rec.services.animator, animate: vi.fn((t: Element, kf: Keyframes, o: AnimOptions) => (calls.push({ kf, durationMs: o.durationMs }), instantAnimator.animate(t, kf, o))) },
    } as EffectServices;
    const p = sampleParams()["hero.clock-entry"];
    EFFECTS["hero.clock-entry"].run(ctxOf(services), p);
    expect(calls.map((c) => c.durationMs)).toEqual([580, 580]);
    expect(calls[0]?.kf["rotate"]).toEqual([180, 359.5]);
    expect(calls[1]?.kf["rotate"]).toEqual([180, 362, 354]);
  });

  it("bats.burst flies one pooled bat per flight and returns them to the pool", async () => {
    const rec = recordingServices();
    const clock = createFakeClock();
    const director = new MotionDirector<EffectParamsMap>(EFFECTS, clock, {}, rec.services);
    expect(director.request("bats.burst", sampleParams()["bats.burst"]).status).toBe("started");
    const flights = rec.animations.length;
    expect(flights).toBeGreaterThanOrEqual(5);
    expect(flights).toBeLessThanOrEqual(7);
    for (const a of rec.animations) expect(a.durationMs + a.delayMs).toBeLessThanOrEqual(1200);
    // Each bat leaves three ink dots on the way (the trail timers run on the director clock).
    clock.runAll();
    expect(rec.marks.filter((m) => m.kind === "trail")).toHaveLength(flights * 3);
    await flushMicrotasks(8);
    expect(rec.services.bats.acquire(14)).toHaveLength(14);
  });

  it("bats.burst under Reduce Motion leaves one 120 ms ink mark", () => {
    const rec = recordingServices();
    const director = new MotionDirector<EffectParamsMap>(EFFECTS, createFakeClock(), {}, rec.services);
    director.setEnv({ reducedMotion: true });
    director.request("bats.burst", sampleParams()["bats.burst"]);
    expect(rec.marks).toEqual([{ kind: "ink-mark", fadeMs: 120 }]);
  });

  it("scroll.to scrolls smoothly, and jumps under Reduce Motion", () => {
    const target = el();
    const spy = vi.fn();
    target.scrollIntoView = spy;
    const rec = recordingServices();
    const d = new MotionDirector<EffectParamsMap>(EFFECTS, createFakeClock(), {}, rec.services);
    d.request("scroll.to", { target });
    expect(spy).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });
    d.setEnv({ reducedMotion: true });
    d.request("scroll.to", { target });
    expect(spy).toHaveBeenLastCalledWith({ behavior: "auto", block: "start" });
  });

  it("section.reaction plays every actor's pose, and settles them when dropped", async () => {
    const rec = recordingServices();
    const clock = createFakeClock();
    const d = new MotionDirector<EffectParamsMap>(EFFECTS, clock, {}, rec.services);
    const p = sampleParams()["section.reaction"];
    d.request("section.reaction", p);
    clock.advance(200);
    expect(rec.plays).toEqual(["wraith-director:enter", "mini-bat:roost"]);
    // A second region's reaction queues behind the scene; it times out and settles.
    const q = d.request("section.reaction", { ...p, region: "crew" });
    expect(q.status).toBe("queued");
    clock.advance(500);
    expect(rec.settles).toEqual(expect.arrayContaining(["wraith-director:enter", "mini-bat:roost"]));
  });
});
