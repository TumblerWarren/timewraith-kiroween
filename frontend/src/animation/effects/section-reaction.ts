import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { defineEffect, settleActors, staticFallback } from "./shared";

const MAX_MS = 1200;
const DEFAULT_STAGGER_MS = 80;
/** Time left for the last actor's pose after the stagger. */
const LAST_POSE_MS = 500;

/**
 * P2 scene: a region's mascots play their enter pose once, staggered. Keyed per region, so two regions
 * can queue their reactions. A dropped or cancelled reaction settles every actor in its final pose.
 */
export const sectionReaction = defineEffect({
  id: "section.reaction",
  priority: 2,
  kind: "scene",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  key: (p) => `section.reaction:${p.region}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const n = p.actors.length;
    const budget = MAX_MS - LAST_POSE_MS - 50;
    const stagger = n > 1 ? Math.min(p.staggerMs ?? DEFAULT_STAGGER_MS, budget / (n - 1)) : 0;
    const step = ctx.env.compact ? 0 : stagger;
    p.actors.forEach(({ actor, pose }, i) => {
      run.after(i * step, () => {
        const c = ctx.services.actors.get(actor);
        if (c) run.wait(c.play(pose, { durationMs: LAST_POSE_MS }) ?? undefined);
      });
    });
    return run.seal();
  },
  settle: (ctx, p) => settleActors(ctx, p.actors),
  fallback: staticFallback<ParamsOf<"section.reaction">>((ctx, p) => settleActors(ctx, p.actors)),
});
