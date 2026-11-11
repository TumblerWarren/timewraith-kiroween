import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { playActor, settleAndFade, settleReveal, tween } from "./region-shared";
import { defineEffect, fadeFallback } from "./shared";

const MAX_MS = 900;
const LAND_AT_MS = 140;
const LAND_MS = 360;
const UNDERLINE_AT_MS = 520;
const UNDERLINE_MS = 300;

/**
 * P1 scene (task 14.9): the Raven thumps "Filed 06:58" onto the Closing sheet. The stamp (`targets[0]`, DOM text)
 * comes down from above the paper and lands with a squash; the sheet (`targets[2]`) takes the knock; then
 * Skeleton Scribe's ink underline (`targets[1]`, scaleX from the left) runs under the "Open a case" prompt.
 * `actors[0]` (the Raven) plays from the start, the rest (the Scribe's hand) as the underline draws.
 * Reduce Motion: the stamp and the underline are shown, with a 120 ms fade.
 */
export const ravenStamp = defineEffect({
  id: "raven.stamp",
  priority: 1,
  kind: "scene",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const [stamp, underline, sheet] = p.targets ?? [];
    const [raven, ...helpers] = p.actors ?? [];
    if (raven) playActor(ctx, run, raven.actor, raven.pose, 420);
    if (stamp) ctx.services.animator.set(stamp, { opacity: 0, scale: 2.1 });
    if (underline) ctx.services.animator.set(underline, { scaleX: 0 });
    tween(
      ctx,
      run,
      stamp,
      { scale: [2.1, 0.88, 1.05, 1], opacity: [0, 1, 1, 1], rotate: [-10, 1.5, -0.5, 0], y: [-36, 2, 0, 0] },
      { durationMs: LAND_MS, delayMs: LAND_AT_MS, ease: "easeOut", times: [0, 0.5, 0.78, 1] },
    );
    tween(ctx, run, sheet, { y: [0, 4, -1, 0] }, { durationMs: 240, delayMs: LAND_AT_MS + LAND_MS * 0.45, ease: "easeOut" });
    tween(ctx, run, underline, { scaleX: [0, 1] }, { durationMs: UNDERLINE_MS, delayMs: UNDERLINE_AT_MS, ease: "easeInOut" });
    for (const h of helpers) run.after(UNDERLINE_AT_MS - 100, () => playActor(ctx, run, h.actor, h.pose, MAX_MS - UNDERLINE_AT_MS + 40));
    return run.seal();
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: fadeFallback<ParamsOf<"raven.stamp">>((ctx, p) => settleAndFade(ctx, p, (p.targets ?? []).slice(0, 2))),
});
