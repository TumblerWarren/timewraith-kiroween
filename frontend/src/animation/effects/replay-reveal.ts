import type { EffectContext } from "../director/types";
import { playActors, rest, stampKeyframes, tween } from "./caseFx";
import { createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, fadeFallback, fadeIn, settleActors } from "./shared";

type P = ParamsOf<"replay.reveal">;

/** Face up: the card untransformed, the back hidden, the report and its stamp visible. */
function settle(ctx: EffectContext, p: P): void {
  rest(ctx, [p.card, p.front, p.stamp, ...(p.targets ?? [])]);
  if (p.back) ctx.services.animator.set(p.back, { opacity: 0 });
  settleActors(ctx, p.actors);
}

const HALF_MS = 260;

/**
 * P1 scene, at most 1200 ms (task 14.4): the Blind hunt report card turns face up. The card lifts and narrows to
 * edge-on showing its face-down back; at the midpoint the content is swapped (back hidden, report shown) and the
 * card opens out with a small overshoot; then the match stamp lands. The report is in the DOM from the start of
 * the reveal event, so state never waits for this. Reduce Motion: face up at once, report and stamp fade in 120 ms.
 */
export const replayReveal = defineEffect({
  id: "replay.reveal",
  priority: 1,
  kind: "scene",
  maxDurationMs: 1200,
  allowCompact: true,
  key: (p) => `replay.reveal:${p.caseId}:${p.eventId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    if (p.back) a.set(p.back, { opacity: 1 });
    if (p.front) a.set(p.front, { opacity: 0 });
    if (p.stamp) a.set(p.stamp, { opacity: 0 });
    tween(ctx, run, p.card, { scaleX: [1, 0.02], y: [0, -12], rotate: [0, -1.5] }, { durationMs: HALF_MS, ease: "easeIn" });
    run.after(HALF_MS, () => {
      if (p.back) a.set(p.back, { opacity: 0 });
      if (p.front) a.set(p.front, { opacity: 1 });
      tween(ctx, run, p.card, { scaleX: [0.02, 1.04, 1], y: [-12, -4, 0], rotate: [1.5, -0.4, 0] }, { durationMs: 360, times: [0, 0.7, 1], ease: "easeOut" });
    });
    run.after(HALF_MS + 380, () => {
      tween(ctx, run, p.stamp, stampKeyframes(-20), { durationMs: 320, times: [0, 0.6, 1] });
      playActors(ctx, run, p.actors, 520);
    });
    return run.seal();
  },
  settle,
  fallback: fadeFallback<P>((ctx, p) => {
    settle(ctx, p);
    fadeIn(ctx, [p.front, p.stamp]);
  }),
});
