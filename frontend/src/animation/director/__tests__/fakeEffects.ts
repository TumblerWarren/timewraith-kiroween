import type { EffectDef, EffectHandle, EffectKind, FinishStatus, Priority } from "../types";

/** Test helpers: fake effects whose runs finish only when a test says so. */

export interface FakeSpec {
  readonly priority: Priority;
  readonly kind: EffectKind;
  readonly maxDurationMs?: number;
  readonly allowCompact?: boolean;
  readonly bats?: number;
  readonly region?: string;
}

export interface FakeParams {
  /** Unique per request, so settle and run calls can be traced back to it. */
  readonly n: number;
}

export interface FakeRun {
  readonly id: string;
  readonly n: number;
  status: "running" | FinishStatus;
  paused: boolean;
  finish(): void;
}

export interface FakeRegistry<Ids extends string> {
  readonly registry: { readonly [K in Ids]: EffectDef<FakeParams> };
  /** Every run ever started, in start order. */
  readonly runs: FakeRun[];
  readonly settles: Map<number, number>;
  readonly fallbacks: Map<number, number>;
  running(): FakeRun[];
  /** Finishes the i-th currently running fake (modulo the count). Returns false if none run. */
  finishNth(i: number): boolean;
}

export function makeFakeRegistry<Ids extends string>(specs: { readonly [K in Ids]: FakeSpec }): FakeRegistry<Ids> {
  const runs: FakeRun[] = [];
  const settles = new Map<number, number>();
  const fallbacks = new Map<number, number>();
  const bump = (m: Map<number, number>, n: number) => m.set(n, (m.get(n) ?? 0) + 1);

  const registry = {} as { [K in Ids]: EffectDef<FakeParams> };
  for (const id of Object.keys(specs) as Ids[]) {
    const s = specs[id];
    registry[id] = {
      id,
      priority: s.priority,
      kind: s.kind,
      maxDurationMs: s.maxDurationMs ?? 1000,
      allowCompact: s.allowCompact ?? true,
      ...(s.region !== undefined ? { region: () => s.region as string } : {}),
      ...(s.bats !== undefined ? { bats: () => s.bats as number } : {}),
      run(_ctx, p): EffectHandle {
        let resolve!: (st: FinishStatus) => void;
        const finished = new Promise<FinishStatus>((r) => (resolve = r));
        const run: FakeRun = {
          id,
          n: p.n,
          status: "running",
          paused: false,
          finish() {
            if (run.status !== "running") return;
            run.status = "completed";
            resolve("completed");
          },
        };
        runs.push(run);
        return {
          cancel() {
            if (run.status !== "running") return;
            run.status = "cancelled";
            resolve("cancelled");
          },
          pause() {
            run.paused = true;
          },
          resume() {
            run.paused = false;
          },
          finished,
        };
      },
      settle: (_ctx, p) => void bump(settles, p.n),
      fallback: { kind: "static", apply: (_ctx, p) => void bump(fallbacks, p.n) },
    };
  }

  return {
    registry,
    runs,
    settles,
    fallbacks,
    running: () => runs.filter((r) => r.status === "running"),
    finishNth(i) {
      const live = runs.filter((r) => r.status === "running");
      if (live.length === 0) return false;
      live[((i % live.length) + live.length) % live.length]?.finish();
      return true;
    },
  };
}

/** The fake cast used by the director property tests. */
export const FAKE_SPECS = {
  p0: { priority: 0, kind: "micro" },
  p1micro: { priority: 1, kind: "micro" },
  p1scene: { priority: 1, kind: "scene", maxDurationMs: 1500 },
  p2scene: { priority: 2, kind: "scene", maxDurationMs: 1200 },
  p2sceneB: { priority: 2, kind: "scene", maxDurationMs: 900 },
  p2burst: { priority: 2, kind: "burst", bats: 7, maxDurationMs: 950 },
  p2burstOne: { priority: 2, kind: "burst", bats: 1, maxDurationMs: 800 },
  p2micro: { priority: 2, kind: "micro", maxDurationMs: 450 },
  p3a: { priority: 3, kind: "ambient", region: "a", allowCompact: false, maxDurationMs: 1800 },
  p3b: { priority: 3, kind: "ambient", region: "b", allowCompact: false, maxDurationMs: 1200 },
  p3bat: { priority: 3, kind: "ambient", region: "overlay", bats: 1, allowCompact: false, maxDurationMs: 2400 },
} as const satisfies Record<string, FakeSpec>;

export type FakeId = keyof typeof FAKE_SPECS;
export const FAKE_IDS = Object.keys(FAKE_SPECS) as FakeId[];
export type FakeParamsMap = { [K in FakeId]: FakeParams };
