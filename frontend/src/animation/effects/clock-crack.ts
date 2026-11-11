import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { playActor, settleReveal, tween } from "./region-shared";
import { defineEffect, staticFallback } from "./shared";

const MAX_MS = 700;
const DRAW_MS = 340;
const JOLT_MS = 300;

/**
 * P1 micro (task 14.1): the ink crack splits the Lost Hour Clock at the 01:59 to 03:00 jump.
 * `targets[0]` is the crack (it draws down from the top: scaleY 0 to 1, transform-origin top in CSS); the other
 * targets (the Clock) take a short jolt as it splits. Actors play their pose (the Mini Ghost looks at the gap).
 * Requested once, when the scrubbed scene first reaches 03:00. Reduce Motion: the crack is drawn.
 */
export const clockCrack = defineEffect({
  id: "clock.crack",
  priority: 1,
  kind: "micro",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const [crack, ...jolted] = p.targets ?? [];
    tween(ctx, run, crack, { scaleY: [0, 1.06, 1], opacity: [0, 1, 1] }, { durationMs: DRAW_MS, ease: "easeOut", times: [0, 0.8, 1] });
    for (const el of jolted) {
      tween(ctx, run, el, { x: [0, -5, 4, -2, 0], rotate: [0, -1.2, 0.8, 0, 0] }, { durationMs: JOLT_MS, delayMs: DRAW_MS * 0.6, ease: "easeOut" });
    }
    for (const a of p.actors ?? []) playActor(ctx, run, a.actor, a.pose, MAX_MS - DRAW_MS - 40);
    return run.seal();
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: staticFallback<ParamsOf<"clock.crack">>((ctx, p) => settleReveal(ctx, p)),
});
