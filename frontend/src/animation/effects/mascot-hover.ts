import type { ParamsOf } from "./ids";
import { completedHandle, createRun } from "./handles";
import { defineEffect, settleActors, staticFallback } from "./shared";

/** P2 micro: a hovered or focused mascot plays its reaction pose. Keyed per actor. Reduce Motion: pose swap only. */
export const mascotHover = defineEffect({
  id: "mascot.hover",
  priority: 2,
  kind: "micro",
  maxDurationMs: 450,
  allowCompact: true,
  key: (p) => `mascot.hover:${p.actor}`,
  run(ctx, p) {
    const c = ctx.services.actors.get(p.actor);
    if (!c) return completedHandle();
    const run = createRun(ctx.clock);
    run.wait(c.play(p.pose, { durationMs: 380 }) ?? undefined);
    return run.seal();
  },
  settle: (ctx, p) => settleActors(ctx, [p]),
  fallback: staticFallback<ParamsOf<"mascot.hover">>((ctx, p) => settleActors(ctx, [p])),
});
