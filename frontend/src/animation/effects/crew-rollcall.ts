import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { fitStagger, playActor, settleReveal, tween } from "./region-shared";
import { defineEffect, staticFallback } from "./shared";

const MAX_MS = 1500;
const STAGGER_MS = 80;
/** Each check-in: the figure's pose, and its number tag popping. */
export const ROLLCALL_POSE_MS = 400;
const TAG_MS = 300;
/** Ends this far before the watchdog. */
const MARGIN_MS = 60;

/**
 * P2 scene (task 14.8): the Crew roll-call. The 14 mascots check in one after another (80 ms apart, no stagger when
 * compact), each playing its own short pose while its number tag on the portrait pops, all inside 1.5 s.
 * `actors[i]` is the i-th figure; `targets[i]`, when present, is that figure's number tag.
 * Reduce Motion: everyone visible in the final pose.
 */
export const crewRollcall = defineEffect({
  id: "crew.rollcall",
  priority: 2,
  kind: "scene",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const actors = p.actors ?? [];
    const tags = p.targets ?? [];
    const n = Math.max(actors.length, tags.length);
    const step = fitStagger(n, STAGGER_MS, ROLLCALL_POSE_MS, MAX_MS - MARGIN_MS, ctx.env.compact);
    for (let i = 0; i < n; i++) {
      const delayMs = Math.round(i * step);
      tween(ctx, run, tags[i], { scale: [1, 1.4, 0.94, 1], rotate: [0, -8, 4, 0] }, { durationMs: TAG_MS, delayMs, ease: "easeOut" });
      const a = actors[i];
      if (a) run.after(delayMs, () => playActor(ctx, run, a.actor, a.pose, ROLLCALL_POSE_MS));
    }
    return run.seal();
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: staticFallback<ParamsOf<"crew.rollcall">>((ctx, p) => settleReveal(ctx, p)),
});
