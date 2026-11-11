import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { defineEffect, staticFallback } from "./shared";
import type { EffectContext } from "../director/types";

const hide = (ctx: EffectContext, els: readonly Element[]) => {
  for (const el of els) ctx.services.animator.set(el, { opacity: 0 });
};

/**
 * P0: overlay mascots that overlap a focused control fade out within 150 ms, so focus is never covered.
 * The overlay restores them (opacity 1) when focus leaves; this effect only yields.
 */
export const focusYield = defineEffect({
  id: "focus.yield",
  priority: 0,
  kind: "micro",
  maxDurationMs: 150,
  allowCompact: true,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    for (const el of p.elements) run.track(ctx.services.animator.animate(el, { opacity: 0 }, { durationMs: 120, ease: "linear" }));
    return run.seal();
  },
  settle: (ctx, p) => hide(ctx, p.elements),
  fallback: staticFallback<ParamsOf<"focus.yield">>((ctx, p) => hide(ctx, p.elements)),
});
