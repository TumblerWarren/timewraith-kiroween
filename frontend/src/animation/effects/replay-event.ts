import type { EffectContext } from "../director/types";
import { clampNum, EASE_SNAP, playActors, rest, tween } from "./caseFx";
import { createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, settleActors, staticFallback } from "./shared";

type P = ParamsOf<"replay.event">;

function settle(ctx: EffectContext, p: P): void {
  rest(ctx, [p.card, p.thumb, p.spider, p.silk, p.peg, p.chip, p.crack, ...(p.targets ?? [])]);
  settleActors(ctx, p.actors);
}

/**
 * P1 micro, at most 600 ms (task 14.3). The newly current event arrives:
 * - Spider Weaver swings over on her silk from the previous peg, the silk paying out from the rule;
 * - the current peg and its clock chip pop together (same marker on both tracks);
 * - the event text slides in from the direction of travel, the actor's thumbnail is slapped onto the card;
 * - the current actor plays its pose (Bat Scout perches, Pumpkin Mechanic pulls, the Raven bows ...);
 * - at the first anomaly, once, the ink crack is struck across the thread.
 * Reduce Motion: everything at rest at once, actors in their final pose.
 */
export const replayEvent = defineEffect({
  id: "replay.event",
  priority: 1,
  kind: "micro",
  maxDurationMs: 600,
  allowCompact: true,
  key: (p) => `replay.event:${p.eventId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const fromX = clampNum(p.fromX ?? 0, -4000, 4000);
    // Moving forward (fromX < 0) the text enters from the right; backward, from the left.
    const enter = fromX < 0 ? 18 : fromX > 0 ? -18 : 0;
    tween(ctx, run, p.card, { x: [enter, 0], opacity: [0.15, 1] }, { durationMs: 300, ease: EASE_SNAP });

    if (p.spider && fromX !== 0) {
      // A pendulum moving right trails to the left: a clockwise lean that swings back past upright.
      const lean = clampNum(-fromX / 10, -16, 16);
      tween(
        ctx,
        run,
        p.spider,
        { x: [fromX, fromX * -0.05, 0], rotate: [lean, lean * -0.35, 0] },
        { durationMs: 460, times: [0, 0.72, 1], ease: "easeOut" },
      );
    }
    tween(ctx, run, p.silk, { scaleY: [0.2, 1] }, { durationMs: 380, ease: EASE_SNAP });
    tween(ctx, run, p.peg, { scale: [1.8, 0.88, 1] }, { durationMs: 340, times: [0, 0.6, 1] });
    tween(ctx, run, p.chip, { scale: [1.5, 0.92, 1], y: [-4, 0, 0] }, { durationMs: 340, delayMs: 50, times: [0, 0.6, 1] });
    tween(ctx, run, p.thumb, { opacity: [0, 1, 1], scale: [0.55, 1.08, 1], rotate: [-12, 4, 0] }, { durationMs: 380, times: [0, 0.65, 1] });
    tween(ctx, run, p.crack, { opacity: [0, 1, 1], scale: [0.2, 1.25, 1], rotate: [-24, 5, 0] }, { durationMs: 400, delayMs: 140, times: [0, 0.55, 1] });
    playActors(ctx, run, p.actors, 520);
    return run.seal();
  },
  settle,
  fallback: staticFallback(settle),
});
