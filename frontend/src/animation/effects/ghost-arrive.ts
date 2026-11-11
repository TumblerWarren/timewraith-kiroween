import { createRun } from "./handles";
import { defineEffect, staticFallback } from "./shared";

const GHOST = "mini-ghost";

/**
 * The Mini Ghost arrives in a new region: a squash-and-stretch hop with a two-beat wave of the head, and three ink
 * dots popping from the thread's nib. P2 micro (it answers the visitor's scroll), once per region per page (the
 * caller latches it). Reduce Motion: the ghost stays at the first node, so there is nothing to play.
 */
export const ghostArrive = defineEffect({
  id: "ghost.arrive",
  priority: 2,
  kind: "micro",
  maxDurationMs: 900,
  allowCompact: true,
  key: (p) => `ghost.arrive:${p.region}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const c = ctx.services.actors.get(p.actor ?? GHOST);
    run.wait(c?.play("arrive") ?? undefined);
    [-1, 0, 1].forEach((k, i) => {
      run.after(120 + i * 90, () => ctx.services.overlay.mark("ink-dot", { x: p.at.x - 40 + k * 14, y: p.at.y - 6 - i * 7 }, 120));
    });
    return run.seal();
  },
  settle(ctx, p) {
    ctx.services.actors.get(p.actor ?? GHOST)?.settle();
  },
  fallback: staticFallback(() => {}),
});
