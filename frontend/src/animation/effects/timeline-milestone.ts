import type { EffectContext } from "../director/types";
import { rest, stampKeyframes, tween } from "./caseFx";
import { createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, fadeFallback, fadeIn } from "./shared";

type P = ParamsOf<"timeline.milestone">;

function settle(ctx: EffectContext, p: P): void {
  rest(ctx, [p.segment, p.ring, p.stamp, ...(p.targets ?? [])]);
}

/**
 * P1 micro, at most 500 ms (task 14.10): the replay has reached a Version_Timeline milestone. The thread segment
 * up to it inks in from the left, the ring fills with a small pop, and the "reached" stamp lands last. The state
 * text, the ring's shape and the list order are already in the DOM and never wait for this. Keyed by case and
 * milestone kind, so each arrival plays once. Reduce Motion: the reached mark at rest with a fade of at most
 * 120 ms on the stamp.
 */
export const timelineMilestone = defineEffect({
  id: "timeline.milestone",
  priority: 1,
  kind: "micro",
  maxDurationMs: 500,
  allowCompact: true,
  key: (p) => `timeline.milestone:${p.caseId}:${p.kind}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    if (p.segment) a.set(p.segment, { opacity: 0, scaleX: 0 });
    tween(ctx, run, p.segment, { opacity: [0, 1], scaleX: [0, 1] }, { durationMs: 220, ease: "easeOut" });
    tween(ctx, run, p.ring, { scale: [0.6, 1.2, 1] }, { durationMs: 260, delayMs: 140, times: [0, 0.6, 1] });
    if (p.stamp) a.set(p.stamp, { opacity: 0 });
    tween(ctx, run, p.stamp, stampKeyframes(-12), { durationMs: 240, delayMs: 260, times: [0, 0.6, 1] });
    return run.seal();
  },
  settle,
  fallback: fadeFallback((ctx, p: P) => {
    settle(ctx, p);
    fadeIn(ctx, [p.stamp]);
  }),
});
