import { CLOCK_ENTRY_ANGLES, CLOCK_ENTRY_MS } from "../constants";
import type { EffectContext } from "../director/types";
import { completedHandle, createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, fadeFallback, fadeIn } from "./shared";

type P = ParamsOf<"hero.clock-entry">;

const target = (p: P) => p.to ?? { hour: CLOCK_ENTRY_ANGLES.hour, minute: CLOCK_ENTRY_ANGLES.minute };

function settleHands(ctx: EffectContext, p: P): void {
  const to = target(p);
  if (p.hour) ctx.services.animator.set(p.hour, { rotate: to.hour });
  if (p.minute) ctx.services.animator.set(p.minute, { rotate: to.minute });
}

/**
 * P1 scene: the Clock hands sweep from 180 deg to 23:59 in 580 ms, the minute hand overshooting by 8 deg.
 * Reduce Motion: hands at 23:59 and a 120 ms fade of the face.
 */
export const heroClockEntry = defineEffect({
  id: "hero.clock-entry",
  priority: 1,
  kind: "scene",
  maxDurationMs: 650,
  allowCompact: true,
  run(ctx, p) {
    if (!p.hour && !p.minute) return completedHandle();
    const to = target(p);
    const from = CLOCK_ENTRY_ANGLES.from;
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    // Write the start angle at once, so the frame before the animation's first tick never shows 23:59.
    if (p.hour) a.set(p.hour, { rotate: from });
    if (p.minute) a.set(p.minute, { rotate: from });
    if (p.hour) run.track(a.animate(p.hour, { rotate: [from, to.hour] }, { durationMs: CLOCK_ENTRY_MS, ease: [0.2, 0.9, 0.25, 1] }));
    if (p.minute) {
      run.track(
        a.animate(
          p.minute,
          { rotate: [from, to.minute + CLOCK_ENTRY_ANGLES.overshoot, to.minute] },
          { durationMs: CLOCK_ENTRY_MS, times: [0, 0.78, 1], ease: "easeOut" },
        ),
      );
    }
    return run.seal();
  },
  settle: settleHands,
  fallback: fadeFallback<ParamsOf<"hero.clock-entry">>((ctx, p) => {
    settleHands(ctx, p);
    if (p.face) fadeIn(ctx, [p.face]);
  }),
});
