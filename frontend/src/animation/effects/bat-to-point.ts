import type { ParamsOf } from "./ids";
import { REDUCED_FADE_MS } from "../constants";
import { arcPath, flyBat, releaseBats, travelScale } from "./bat-flight";
import { completedHandle, createRun } from "./handles";
import { defineEffect, fadeFallback } from "./shared";

/** P2 burst: a background click flies the Mini Bat to the click point. Reduce Motion: a 120 ms ink dot. */
export const batToPoint = defineEffect({
  id: "bat.to-point",
  priority: 2,
  kind: "burst",
  maxDurationMs: 1300,
  allowCompact: true,
  bats: () => 1,
  run(ctx, p) {
    const bats = ctx.services.bats.acquire(1);
    const bat = bats[0];
    if (!bat) {
      ctx.services.overlay.mark("ink-dot", p.to, REDUCED_FADE_MS);
      return completedHandle();
    }
    const run = createRun(ctx.clock, () => releaseBats(ctx, bats));
    flyBat(ctx, run, bat, arcPath(p.from, p.to, 50), { durationMs: 600, scale: travelScale(ctx.env.compact), landing: true });
    const handle = run.seal();
    void handle.finished.then((s) => {
      if (s === "completed") releaseBats(ctx, bats);
    });
    return handle;
  },
  settle() {},
  fallback: fadeFallback<ParamsOf<"bat.to-point">>((ctx, p) => ctx.services.overlay.mark("ink-dot", p.to, REDUCED_FADE_MS)),
});
