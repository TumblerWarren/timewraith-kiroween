import type { EffectContext } from "../director/types";
import { clampNum, playActors, rest, tween } from "./caseFx";
import { createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, settleActors, staticFallback } from "./shared";

type P = ParamsOf<"stitch.sew">;

/** At most this many diff lines are animated (design: "at most 12 animated"); the rest are simply there. */
export const MAX_SEWN_LINES = 12;
/** The needle's run down the diff, then a short pause and the return to rest. */
export const SEW_DOWN_MS = 980;
const SEW_TOTAL_MS = 1260;
const LINE_MS = 220;

function settle(ctx: EffectContext, p: P): void {
  rest(ctx, [p.needle, p.thread, ...(p.lines ?? []), ...(p.strikes ?? []), ...(p.targets ?? [])]);
  settleActors(ctx, p.actors);
}

const at = (list: readonly number[] | undefined, i: number, n: number) => clampNum(list?.[i] ?? (n > 1 ? i / (n - 1) : 0), 0, 1);

/**
 * P2 scene, at most 1400 ms (task 14.5): Doctor Stitch sews the suggested fix in. His needle arm runs down the
 * diff's margin, the stitch line is drawn behind it, and each added line is stitched in (slides in from the
 * margin) as the needle passes it, removed lines get their strike pulled through. At most 12 lines animate.
 * Compact: the lines appear at once and only the needle moves. The full diff is in the DOM from the start.
 * Reduce Motion: the full diff visible, the needle arm in its rest pose.
 */
export const stitchSew = defineEffect({
  id: "stitch.sew",
  priority: 2,
  kind: "scene",
  maxDurationMs: 1400,
  allowCompact: true,
  key: (p) => `stitch.sew:${p.caseId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    const travel = clampNum(p.travelPx ?? 0, 0, 4000);
    const lines = (p.lines ?? []).slice(0, MAX_SEWN_LINES);
    const strikes = (p.strikes ?? []).slice(0, Math.max(0, MAX_SEWN_LINES - lines.length));
    const down = SEW_DOWN_MS / SEW_TOTAL_MS;

    tween(
      ctx,
      run,
      p.needle,
      { y: [0, travel * 0.5, travel, travel, 0], rotate: [-8, 7, -7, 0, 0] },
      { durationMs: SEW_TOTAL_MS, times: [0, down / 2, down, down + 0.06, 1], ease: "easeInOut" },
    );

    if (ctx.env.compact) {
      rest(ctx, [p.thread, ...(p.lines ?? []), ...(p.strikes ?? [])]);
    } else {
      if (p.thread) a.set(p.thread, { scaleY: 0 });
      tween(ctx, run, p.thread, { scaleY: [0, 1] }, { durationMs: SEW_DOWN_MS, ease: "linear" });
      lines.forEach((el, i) => {
        a.set(el, { opacity: 0, x: -14 });
        tween(ctx, run, el, { opacity: [0, 1], x: [-14, 0] }, { durationMs: LINE_MS, delayMs: at(p.lineAt, i, lines.length) * (SEW_DOWN_MS - 80), ease: "easeOut" });
      });
      strikes.forEach((el, i) => {
        a.set(el, { scaleX: 0 });
        tween(ctx, run, el, { scaleX: [0, 1] }, { durationMs: 200, delayMs: at(p.strikeAt, i, strikes.length) * (SEW_DOWN_MS - 80), ease: "easeOut" });
      });
      // Lines past the first 12 are not animated: they are shown as they are.
      rest(ctx, (p.lines ?? []).slice(MAX_SEWN_LINES));
    }
    playActors(ctx, run, p.actors, 560);
    return run.seal();
  },
  settle,
  fallback: staticFallback(settle),
});
