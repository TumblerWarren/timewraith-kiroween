import type { EffectContext } from "../director/types";
import { EASE_SNAP, playActors, rest, stampKeyframes, tween } from "./caseFx";
import { createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, settleActors, staticFallback } from "./shared";

type P = ParamsOf<"replay.fixed-pass">;

function settle(ctx: EffectContext, p: P): void {
  rest(ctx, [p.jack, p.band, p.stamp, ...(p.targets ?? [])]);
  settleActors(ctx, p.actors);
}

/**
 * P1 micro, at most 900 ms (task 14.4): the climax of a fixed-version check, on arrival at the passing event.
 * Two-Faced Jack flips to his fixed face (his card thumbnail turns through edge-on, his panel figure turns), the
 * version band turns over to the patched pin like a flap folding down, and the "passes" stamp lands last.
 * Reduce Motion: the patched version, the stamp and Jack's fixed face shown at once.
 */
export const replayFixedPass = defineEffect({
  id: "replay.fixed-pass",
  priority: 1,
  kind: "micro",
  maxDurationMs: 900,
  allowCompact: true,
  key: (p) => `replay.fixed-pass:${p.caseId}:${p.eventId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    tween(ctx, run, p.jack, { scaleX: [1, 0.04, 1], rotate: [0, -6, 0] }, { durationMs: 460, times: [0, 0.45, 1], ease: "easeInOut" });
    if (p.band) a.set(p.band, { scaleY: 0 });
    tween(ctx, run, p.band, { scaleY: [0, 1.1, 1], rotate: [-2.5, 0.8, 0] }, { durationMs: 380, delayMs: 160, times: [0, 0.7, 1], ease: EASE_SNAP });
    if (p.stamp) a.set(p.stamp, { opacity: 0 });
    tween(ctx, run, p.stamp, stampKeyframes(-18), { durationMs: 320, delayMs: 540, times: [0, 0.6, 1] });
    playActors(ctx, run, p.actors, 600);
    return run.seal();
  },
  settle,
  fallback: staticFallback(settle),
});
