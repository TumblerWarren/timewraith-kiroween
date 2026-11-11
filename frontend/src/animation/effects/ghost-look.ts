import { completedHandle, createRun } from "./handles";
import { defineEffect, noopFallback } from "./shared";

const GHOST = "mini-ghost";

/** P3 ambient: when scrolling stops, the Mini Ghost looks at a point (the Lost Hour gap, a node). Reduce Motion: nothing. */
export const ghostLook = defineEffect({
  id: "ghost.look",
  priority: 3,
  kind: "ambient",
  maxDurationMs: 1200,
  allowCompact: false,
  region: () => "overlay",
  run(ctx, p) {
    const c = ctx.services.actors.get(p.actor ?? GHOST);
    if (!c) return completedHandle();
    c.look?.(p.at.x, p.at.y);
    const run = createRun(ctx.clock);
    run.wait(c.play("look", { durationMs: 1000 }) ?? undefined);
    return run.seal();
  },
  settle(ctx, p) {
    ctx.services.actors.get(p.actor ?? GHOST)?.settle();
  },
  fallback: noopFallback(),
});
