import type { ParamsOf } from "./ids";
import { REDUCED_FADE_MS } from "../constants";
import { burstCount, burstPlan } from "../paths/burstPlan";
import { rectCenter } from "../paths/cubic";
import { ANTICIPATION_MS } from "../paths/flightPlan";
import { flyBat, releaseBats } from "./bat-flight";
import { completedHandle, createRun } from "./handles";
import { defineEffect, fadeFallback } from "./shared";

const MAX_MS = 1200;
/** Margin so the slowest, latest flight ends before the watchdog. */
const WATCHDOG_MARGIN_MS = 30;

/**
 * P2 burst: 5 to 7 Mini Bats (3 compact) burst from the origin rectangle (the submit button).
 * Reduce Motion: a 120 ms ink mark at the origin.
 */
export const batsBurst = defineEffect({
  id: "bats.burst",
  priority: 2,
  kind: "burst",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  bats: (p, env) => burstCount(p.seed, env.compact),
  run(ctx, p) {
    const plan = burstPlan(p.origin, p.bounds, p.seed, ctx.env.compact).slice(0, ctx.batBudget);
    const bats = ctx.services.bats.acquire(plan.length);
    if (bats.length === 0) {
      ctx.services.overlay.mark("ink-mark", rectCenter(p.origin), REDUCED_FADE_MS);
      return completedHandle();
    }
    const run = createRun(ctx.clock, () => releaseBats(ctx, bats));
    bats.forEach((bat, i) => {
      const f = plan[i];
      if (!f) return;
      const durationMs = Math.min(f.durationMs, MAX_MS - WATCHDOG_MARGIN_MS - f.delayMs - ANTICIPATION_MS);
      flyBat(ctx, run, bat, f, { durationMs, delayMs: f.delayMs, tilt: f.rotate });
    });
    const handle = run.seal();
    void handle.finished.then((s) => {
      if (s === "completed") releaseBats(ctx, bats);
    });
    return handle;
  },
  // Cancel releases the bats; with no bats in flight the burst has no other final state.
  settle() {},
  fallback: fadeFallback<ParamsOf<"bats.burst">>((ctx, p) => ctx.services.overlay.mark("ink-mark", rectCenter(p.origin), REDUCED_FADE_MS)),
});
