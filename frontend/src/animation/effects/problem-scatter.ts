import { REDUCED_FADE_MS } from "../constants";
import { burstPlan } from "../paths/burstPlan";
import { rectCenter } from "../paths/cubic";
import type { EffectContext } from "../director/types";
import { ANTICIPATION_MS } from "../paths/flightPlan";
import { flyBat, releaseBats } from "./bat-flight";
import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { playActor, settleReveal } from "./region-shared";
import { defineEffect, fadeFallback } from "./shared";

const MAX_MS = 1200;
const WATCHDOG_MARGIN_MS = 40;
/** Design table: Mini Bat x5 (3 when compact). */
export const SCATTER_BATS = { regular: 5, compact: 3 } as const;

type Params = ParamsOf<"problem.scatter">;

function markGap(ctx: EffectContext, p: Params): void {
  if (p.origin) ctx.services.overlay.mark("ink-mark", rectCenter(p.origin), REDUCED_FADE_MS);
}

/**
 * P2 burst (task 14.1): Mini Bats scatter out of the 01:59 to 03:00 gap in the Lost Hour Clock. Pooled overlay
 * bats fly the seeded burst plan from `origin` (the crack's box, viewport coordinates) within `bounds`. `targets`
 * (the crack) end visible; `actors` (the bat clinging to the crack) play their pose as the others take off.
 * Reduce Motion: the crack is shown and a 120 ms ink mark appears at the gap.
 */
export const problemScatter = defineEffect({
  id: "problem.scatter",
  priority: 2,
  kind: "burst",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  bats: (p, env) => (p.origin ? (env.compact ? SCATTER_BATS.compact : SCATTER_BATS.regular) : 0),
  run(ctx, p) {
    settleReveal(ctx, { targets: p.targets });
    const run = createRun(ctx.clock);
    for (const a of p.actors ?? []) playActor(ctx, run, a.actor, a.pose, 520);
    if (!p.origin) return run.seal();
    const bounds = p.bounds ?? p.origin;
    const want = ctx.env.compact ? SCATTER_BATS.compact : SCATTER_BATS.regular;
    const plan = burstPlan(p.origin, bounds, p.seed ?? 1959, ctx.env.compact).slice(0, Math.min(want, ctx.batBudget));
    const bats = ctx.services.bats.acquire(plan.length);
    if (bats.length === 0) {
      markGap(ctx, p);
      return run.seal();
    }
    const flying = createRun(ctx.clock, () => releaseBats(ctx, bats));
    bats.forEach((bat, i) => {
      const f = plan[i];
      if (!f) return;
      flyBat(ctx, flying, bat, f, { durationMs: Math.min(f.durationMs, MAX_MS - WATCHDOG_MARGIN_MS - f.delayMs - ANTICIPATION_MS), delayMs: f.delayMs, tilt: f.rotate });
    });
    const flights = flying.seal();
    run.wait(flights.finished);
    void flights.finished.then((s) => {
      if (s === "completed") releaseBats(ctx, bats);
    });
    const handle = run.seal();
    return {
      ...handle,
      cancel() {
        flights.cancel();
        handle.cancel();
      },
      pause() {
        flights.pause();
        handle.pause();
      },
      resume() {
        flights.resume();
        handle.resume();
      },
    };
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: fadeFallback<Params>((ctx, p) => {
    settleReveal(ctx, p);
    markGap(ctx, p);
  }),
});
