import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { fitStagger, playActor, settleReveal, tween } from "./region-shared";
import { defineEffect, staticFallback } from "./shared";

const MAX_MS = 900;
const MARGIN_MS = 60;
const ACT_START_MS = 120;
const ACT_STAGGER_MS = 110;
const ACT_MS = 520;

/**
 * P2 scene (task 14.7): an Investigation_Flow landing becomes active as it crosses the lead line. The signboard
 * (`targets[0]`) rocks on its post, the "on this landing now" marker (`targets[1]`, text and shape, rendered by
 * the Flow component) is stamped on, and the landing's mascots (`actors`) play their act pose one after another.
 * The approve landing's Bat Burst is a separate `bats.burst` request. Keyed per step.
 * Reduce Motion: the step is shown marked active (the marker is DOM state, so it is already there).
 */
export const flowStep = defineEffect({
  id: "flow.step",
  priority: 2,
  kind: "scene",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  key: (p) => `flow.step:${p.step}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const [sign, marker] = p.targets ?? [];
    tween(ctx, run, sign, { rotate: [0, -3.5, 2.5, -1, 0], y: [0, -6, 0, -1, 0] }, { durationMs: 460, ease: "easeOut" });
    tween(ctx, run, marker, { scale: [1.8, 0.9, 1.05, 1], opacity: [0, 1, 1, 1], rotate: [-14, 2, 0, 0] }, { durationMs: 340, delayMs: 60, ease: "easeOut", times: [0, 0.55, 0.8, 1] });
    const actors = p.actors ?? [];
    const step = fitStagger(actors.length, ACT_STAGGER_MS, ACT_MS, MAX_MS - MARGIN_MS - ACT_START_MS, ctx.env.compact);
    actors.forEach((a, i) => {
      const at = ACT_START_MS + Math.round(i * step);
      run.after(at, () => playActor(ctx, run, a.actor, a.pose, Math.min(ACT_MS, MAX_MS - MARGIN_MS - at)));
    });
    return run.seal();
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: staticFallback<ParamsOf<"flow.step">>((ctx, p) => settleReveal(ctx, p)),
});
