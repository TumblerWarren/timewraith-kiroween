import type { ParamsOf } from "./ids";
import { REDUCED_FADE_MS } from "../constants";
import type { EffectContext } from "../director/types";
import type { Pt } from "../paths/cubic";
import { arcPath, flyBat, releaseBats, travelScale } from "./bat-flight";
import { completedHandle, createRun } from "./handles";
import { defineEffect, fadeFallback } from "./shared";

const marker = (ctx: EffectContext, at: Pt) => ctx.services.overlay.mark("marker", at, REDUCED_FADE_MS);

/**
 * P2 burst: the Mini Bat travels to a node or replay peg, or flutters in place when the target is off
 * screen. Reduce Motion: a marker fades in at the target.
 */
export const batTravel = defineEffect({
  id: "bat.travel",
  priority: 2,
  kind: "burst",
  maxDurationMs: 1400,
  allowCompact: true,
  bats: () => 1,
  run(ctx, p) {
    const bats = ctx.services.bats.acquire(1);
    const bat = bats[0];
    if (!bat) {
      marker(ctx, p.to);
      return completedHandle();
    }
    const run = createRun(ctx.clock, () => releaseBats(ctx, bats));
    if (p.onScreen) {
      flyBat(ctx, run, bat, arcPath(p.from, p.to, 70), { durationMs: 700, scale: travelScale(ctx.env.compact), landing: true });
    } else {
      // Flutter locally: a small loop around the start point.
      const { x, y } = p.from;
      flyBat(
        ctx,
        run,
        bat,
        { p0: { x, y }, p1: { x: x + 28, y: y - 30 }, p2: { x: x - 28, y: y - 30 }, p3: { x: x + 2, y } },
        { durationMs: 600, scale: travelScale(ctx.env.compact), landing: true },
      );
    }
    const handle = run.seal();
    void handle.finished.then((s) => {
      if (s === "completed") releaseBats(ctx, bats);
    });
    return handle;
  },
  settle() {},
  fallback: fadeFallback<ParamsOf<"bat.travel">>((ctx, p) => marker(ctx, p.to)),
});
