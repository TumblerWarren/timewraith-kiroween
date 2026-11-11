import type { ParamsOf } from "./ids";
import { completedHandle, createRun } from "./handles";
import { defineEffect, staticFallback } from "./shared";

/** P0: the Reduce Motion toggle's check mark pops in. Reduce Motion: the mark is shown at once. */
export const reduceMotionAck = defineEffect({
  id: "ui.reduce-motion-ack",
  priority: 0,
  kind: "micro",
  maxDurationMs: 300,
  allowCompact: true,
  run(ctx, p) {
    if (!p.mark) return completedHandle();
    const run = createRun(ctx.clock);
    run.track(ctx.services.animator.animate(p.mark, { scale: [0.6, 1.08, 1], opacity: [0, 1, 1] }, { durationMs: 240, times: [0, 0.7, 1], ease: "easeOut" }));
    return run.seal();
  },
  settle(ctx, p) {
    if (p.mark) ctx.services.animator.set(p.mark, { scale: 1, opacity: 1 });
  },
  fallback: staticFallback<ParamsOf<"ui.reduce-motion-ack">>((ctx, p) => {
    if (p.mark) ctx.services.animator.set(p.mark, { scale: 1, opacity: 1 });
  }),
});
