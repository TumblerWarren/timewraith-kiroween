import { completedHandle, createRun } from "./handles";
import { defineEffect, noopFallback } from "./shared";

/** P3 ambient: one rare idle beat (lantern swing, blink, preen). Keyed per region. Reduce Motion: nothing. */
export const idleBeat = defineEffect({
  id: "idle.beat",
  priority: 3,
  kind: "ambient",
  maxDurationMs: 1800,
  allowCompact: false,
  region: (p) => p.region,
  key: (p) => `idle.beat:${p.region}`,
  run(ctx, p) {
    const c = ctx.services.actors.get(p.actor);
    if (!c) return completedHandle();
    const run = createRun(ctx.clock);
    run.wait(c.play(p.pose, { durationMs: 1500 }) ?? undefined);
    return run.seal();
  },
  // An ambient beat ends at rest.
  settle(ctx, p) {
    ctx.services.actors.get(p.actor)?.settle();
  },
  fallback: noopFallback(),
});
