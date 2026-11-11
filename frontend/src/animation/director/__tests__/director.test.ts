import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createFakeClock, flushMicrotasks, type FakeClock } from "../../../test/fakeClock";
import { P2_QUEUE_TIMEOUT_MS, P3_COOLDOWN_MS } from "../../constants";
import { MotionDirector } from "../director";
import type { DirectorEvent, EnvPatch, RequestResult } from "../types";
import { FAKE_IDS, FAKE_SPECS, makeFakeRegistry, type FakeId, type FakeParamsMap } from "./fakeEffects";

// ------------------------------------------------------------------ harness

type Cmd =
  | { t: "req"; id: FakeId; sameKey: boolean }
  | { t: "finish"; i: number }
  | { t: "tick"; ms: number }
  | { t: "env"; patch: EnvPatch };

const envPatch: fc.Arbitrary<EnvPatch> = fc.oneof(
  fc.record({ hidden: fc.boolean() }),
  fc.record({ compact: fc.boolean() }),
  fc.record({ suppressed: fc.record({ input: fc.boolean() }) }),
  fc.record({ suppressed: fc.record({ scrubber: fc.boolean() }) }),
);

const cmdArb = (opts: { env?: boolean } = {}): fc.Arbitrary<Cmd> =>
  fc.oneof(
    { weight: 5, arbitrary: fc.record({ t: fc.constant("req" as const), id: fc.constantFrom(...FAKE_IDS), sameKey: fc.boolean() }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant("finish" as const), i: fc.nat(12) }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant("tick" as const), ms: fc.integer({ min: 0, max: 5000 }) }) },
    { weight: opts.env === false ? 0 : 1, arbitrary: fc.record({ t: fc.constant("env" as const), patch: envPatch }) },
  );

interface Harness {
  clock: FakeClock;
  director: MotionDirector<FakeParamsMap>;
  fakes: ReturnType<typeof makeFakeRegistry<FakeId>>;
  events: DirectorEvent[];
  /** request results by n */
  results: Map<number, RequestResult>;
  step(cmd: Cmd): Promise<{ n: number; result: RequestResult } | null>;
}

function harness(): Harness {
  const clock = createFakeClock(10_000);
  const fakes = makeFakeRegistry(FAKE_SPECS);
  const director = new MotionDirector<FakeParamsMap>(fakes.registry, clock);
  const events: DirectorEvent[] = [];
  director.onEvent((e) => events.push(e));
  const results = new Map<number, RequestResult>();
  let n = 0;
  return {
    clock,
    director,
    fakes,
    events,
    results,
    async step(cmd) {
      let out: { n: number; result: RequestResult } | null = null;
      if (cmd.t === "req") {
        const id = n++;
        const result = director.request(cmd.id, { n: id }, cmd.sameKey ? undefined : { key: `u${id}` });
        results.set(id, result);
        out = { n: id, result };
      } else if (cmd.t === "finish") {
        fakes.finishNth(cmd.i);
      } else if (cmd.t === "tick") {
        clock.advance(cmd.ms);
      } else {
        director.setEnv(cmd.patch);
      }
      await flushMicrotasks();
      return out;
    },
  };
}

const priorityOf = (id: string) => FAKE_SPECS[id as FakeId].priority;

// ------------------------------------------------------------------ properties

describe("MotionDirector properties", () => {
  /** Feature: timewraith, Property 1: Director preemption by priority. **Validates: Requirements 9.5, 9.6, 15.3** */
  it("Property 1: P0 preempts everything, nothing above P0 starts beside it, P1 clears P3", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb(), { minLength: 1, maxLength: 60 }), async (cmds) => {
        const h = harness();
        let violation: string | null = null;
        h.director.onEvent((e) => {
          if (e.type !== "started" || priorityOf(e.id) === 0) return;
          const p0 = h.director.snapshot().running.some((r) => r.priority === 0);
          if (p0) violation = `${e.id} started while a P0 runs`;
        });
        for (const cmd of cmds) {
          const r = await h.step(cmd);
          expect(violation).toBeNull();
          if (!r || cmd.t !== "req") continue;
          const running = h.director.snapshot().running;
          if (priorityOf(cmd.id) === 0 && r.result.status === "started") {
            expect(running.every((x) => x.priority === 0)).toBe(true);
          }
          if (priorityOf(cmd.id) === 1 && (r.result.status === "started" || r.result.status === "queued")) {
            expect(running.some((x) => x.priority === 3)).toBe(false);
          }
        }
      }),
      { numRuns: 150 },
    );
  });

  /** Feature: timewraith, Property 2: Director concurrency caps. **Validates: Requirements 9.3, 9.4, 11.7, 15.3** */
  it("Property 2: one scene, one ambient per region, bats within 14 / 6", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb(), { minLength: 1, maxLength: 80 }), async (cmds) => {
        const h = harness();
        for (const cmd of cmds) {
          await h.step(cmd);
          const snap = h.director.snapshot();
          expect(snap.running.filter((r) => r.kind === "scene").length).toBeLessThanOrEqual(1);
          const regions = snap.running.filter((r) => r.kind === "ambient").map((r) => r.region);
          expect(new Set(regions).size).toBe(regions.length);
          const bats = snap.running.reduce((s, r) => s + r.bats, 0);
          expect(bats).toBeLessThanOrEqual(snap.env.compact ? 6 : 14);
        }
      }),
      { numRuns: 150 },
    );
  });

  /** Feature: timewraith, Property 3: P2 queue timeout. **Validates: Requirements 9.7, 15.3** */
  it("Property 3: no queued P2 outlives 500 ms; timed-out requests never start and settle once", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb({ env: false }), { minLength: 1, maxLength: 60 }), async (cmds) => {
        const h = harness();
        for (const cmd of cmds) {
          await h.step(cmd);
          const now = h.clock.now();
          for (const q of h.director.snapshot().queued) {
            if (q.priority === 2) expect(now - q.enqueuedAt).toBeLessThan(P2_QUEUE_TIMEOUT_MS);
          }
        }
        const timedOut = h.events.filter((e) => e.type === "dropped" && e.reason === "queue-timeout").map((e) => e.ticket);
        for (const ticket of timedOut) {
          expect(h.events.some((e) => e.type === "started" && e.ticket === ticket)).toBe(false);
          const n = [...h.results.entries()].find(([, r]) => r.status === "queued" && r.ticket === ticket)?.[0];
          expect(n).toBeDefined();
          expect(h.fakes.settles.get(n as number)).toBe(1);
          expect(h.fakes.runs.some((r) => r.n === n)).toBe(false);
        }
      }),
      { numRuns: 150 },
    );
  });

  /** Feature: timewraith, Property 4: P3 gating and cooldown. **Validates: Requirements 9.8, 9.9, 9.10, 15.3** */
  it("Property 4: no P3 while suppressed, none unpaused while hidden, starts spaced by the cooldown", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb(), { minLength: 1, maxLength: 80 }), async (cmds) => {
        const h = harness();
        for (const cmd of cmds) {
          const before = h.director.getEnv();
          const r = await h.step(cmd);
          const env = h.director.getEnv();
          const p3 = h.director.snapshot().running.filter((x) => x.priority === 3);
          if (env.suppressed.input || env.suppressed.scrubber) expect(p3).toHaveLength(0);
          if (env.hidden) expect(p3.every((x) => x.paused)).toBe(true);
          if (r && cmd.t === "req" && priorityOf(cmd.id) === 3) {
            if (before.hidden || before.suppressed.input || before.suppressed.scrubber) expect(r.result.status).toBe("dropped");
          }
        }
        const starts = h.events.filter((e) => e.type === "started" && priorityOf(e.id) === 3).map((e) => e.at);
        for (let i = 1; i < starts.length; i++) {
          expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(P3_COOLDOWN_MS);
        }
      }),
      { numRuns: 150 },
    );
  });

  /** Feature: timewraith, Property 5: Duplicate requests do not double-run. **Validates: Requirements 3.7, 20.1, 9.3** */
  it("Property 5: a repeat with the same key while running or queued is dropped and runs once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...FAKE_IDS.filter((id) => priorityOf(id) !== 3)),
        fc.array(cmdArb({ env: false }), { maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }),
        async (id, prelude, repeats) => {
          const h = harness();
          for (const cmd of prelude) await h.step(cmd);
          const first = h.director.request(id, { n: 1000 }, { key: "dup" });
          if (first.status !== "started" && first.status !== "queued") return;
          for (let k = 0; k < repeats; k++) {
            const again = h.director.request(id, { n: 1001 + k }, { key: "dup" });
            expect(again).toEqual({ status: "dropped", reason: "duplicate" });
          }
          await flushMicrotasks();
          expect(h.fakes.runs.filter((r) => r.n > 1000)).toHaveLength(0);
          expect(h.fakes.runs.filter((r) => r.n === 1000).length).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 150 },
    );
  });
});

// ------------------------------------------------------------------ examples

describe("MotionDirector admission rules", () => {
  it("Reduce Motion calls only the fallback and returns reduced", () => {
    const h = harness();
    h.director.setEnv({ reducedMotion: true });
    expect(h.director.request("p2burst", { n: 1 }).status).toBe("reduced");
    expect(h.director.request("p3a", { n: 2 }).status).toBe("reduced");
    expect(h.fakes.runs).toHaveLength(0);
    expect(h.fakes.fallbacks.get(1)).toBe(1);
  });

  it("drops non-compact effects on compact screens", () => {
    const h = harness();
    h.director.setEnv({ compact: true });
    expect(h.director.request("p3a", { n: 1 })).toEqual({ status: "dropped", reason: "compact-disabled" });
  });

  it("a running scene does not block a burst, but queues another scene", () => {
    const h = harness();
    expect(h.director.request("p2scene", { n: 1 }).status).toBe("started");
    expect(h.director.request("p2burst", { n: 2 }).status).toBe("started");
    expect(h.director.request("p2sceneB", { n: 3 }).status).toBe("queued");
    expect(h.director.request("p1scene", { n: 4 }).status).toBe("queued");
  });

  it("drains the queue highest priority first when a scene finishes", async () => {
    const h = harness();
    h.director.request("p2scene", { n: 1 });
    h.director.request("p2sceneB", { n: 2 });
    h.director.request("p1scene", { n: 3 });
    h.fakes.finishNth(0);
    await flushMicrotasks();
    expect(h.director.snapshot().running.map((r) => r.id)).toEqual(["p1scene"]);
    expect(h.director.snapshot().queued.map((q) => q.id)).toEqual(["p2sceneB"]);
  });

  it("expires a queued P2 after 500 ms and settles it", () => {
    const h = harness();
    h.director.request("p2scene", { n: 1 });
    h.director.request("p2sceneB", { n: 2 });
    h.clock.advance(499);
    expect(h.director.snapshot().queued).toHaveLength(1);
    h.clock.advance(1);
    expect(h.director.snapshot().queued).toHaveLength(0);
    expect(h.fakes.settles.get(2)).toBe(1);
  });

  it("P3 gates: cooldown, region busy, suppressed and hidden", () => {
    const h = harness();
    expect(h.director.request("p3a", { n: 1 }).status).toBe("started");
    expect(h.director.request("p3b", { n: 2 })).toEqual({ status: "dropped", reason: "cooldown" });
    h.clock.advance(P3_COOLDOWN_MS);
    // p3a's watchdog (1800 ms) has settled it by now; start it again and try the same region.
    expect(h.director.request("p3a", { n: 3 }).status).toBe("started");
    h.clock.advance(P3_COOLDOWN_MS - 3000);
    expect(h.director.request("p3a", { n: 4 }, { key: "other" })).toEqual({ status: "dropped", reason: "cooldown" });
    h.director.setEnv({ suppressed: { input: true } });
    expect(h.director.snapshot().running).toHaveLength(0);
    expect(h.director.request("p3b", { n: 5 })).toEqual({ status: "dropped", reason: "suppressed" });
    h.director.setEnv({ suppressed: { input: false }, hidden: true });
    expect(h.director.request("p3b", { n: 6 })).toEqual({ status: "dropped", reason: "hidden" });
  });

  it("the watchdog cancels and settles after maxDurationMs", () => {
    const h = harness();
    h.director.request("p2micro", { n: 1 });
    h.clock.advance(450);
    expect(h.director.snapshot().running).toHaveLength(0);
    expect(h.fakes.settles.get(1)).toBe(1);
    expect(h.fakes.runs[0]?.status).toBe("cancelled");
  });

  it("contains a throwing run: settles, drops as failed, keeps working", () => {
    const clock = createFakeClock();
    const fakes = makeFakeRegistry(FAKE_SPECS);
    let settled = 0;
    const registry = {
      ...fakes.registry,
      p2micro: {
        ...fakes.registry.p2micro,
        run: () => {
          throw new Error("boom");
        },
        settle: () => void settled++,
      },
    };
    const d = new MotionDirector<FakeParamsMap>(registry, clock);
    expect(d.request("p2micro", { n: 1 })).toEqual({ status: "dropped", reason: "failed" });
    expect(settled).toBe(1);
    expect(d.request("p2scene", { n: 2 }).status).toBe("started");
  });

  it("sets data-ambient from hidden and suppressed", () => {
    const attrs = new Map<string, string>();
    const root = { setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) };
    const d = new MotionDirector<FakeParamsMap>(makeFakeRegistry(FAKE_SPECS).registry, createFakeClock(), {}, { root });
    d.setEnv({ hidden: true });
    expect(attrs.get("data-ambient")).toBe("paused");
    d.setEnv({ hidden: false });
    expect(attrs.get("data-ambient")).toBe("running");
    d.setEnv({ suppressed: { scrubber: true } });
    expect(attrs.get("data-ambient")).toBe("paused");
  });

  it("turning Reduce Motion on settles running and queued effects", async () => {
    const h = harness();
    h.director.request("p2scene", { n: 1 });
    h.director.request("p2sceneB", { n: 2 });
    h.director.setEnv({ reducedMotion: true });
    await flushMicrotasks();
    expect(h.director.snapshot().running).toHaveLength(0);
    expect(h.director.snapshot().queued).toHaveLength(0);
    expect(h.fakes.settles.get(1)).toBe(1);
    expect(h.fakes.settles.get(2)).toBe(1);
  });

  it("notifies subscribers and stops after dispose", () => {
    const h = harness();
    let calls = 0;
    const off = h.director.subscribe(() => void calls++);
    h.director.request("p2micro", { n: 1 });
    expect(calls).toBeGreaterThan(0);
    off();
    h.director.dispose();
    expect(h.director.request("p2micro", { n: 2 }).status).toBe("dropped");
    expect(h.fakes.settles.get(1)).toBe(1);
  });
});
