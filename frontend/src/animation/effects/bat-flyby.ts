import { mulberry32, between } from "../paths/random";
import { flyBat, releaseBats } from "./bat-flight";
import { completedHandle, createRun } from "./handles";
import { defineEffect, noopFallback } from "./shared";

/** P3 ambient: a rare Mini Bat fly-by along the top beam. Reduce Motion: nothing. */
export const batFlyby = defineEffect({
  id: "bat.flyby",
  priority: 3,
  kind: "ambient",
  maxDurationMs: 2400,
  allowCompact: false,
  region: () => "overlay",
  bats: () => 1,
  run(ctx, p) {
    const bats = ctx.services.bats.acquire(1);
    const bat = bats[0];
    if (!bat) return completedHandle();
    const rand = mulberry32(p.seed);
    const { x, y, w } = p.bounds;
    const top = y + between(rand, 36, 84);
    const leftToRight = rand() < 0.5;
    const a = { x: x - 40, y: top };
    const b = { x: x + w + 40, y: top + between(rand, -12, 12) };
    const [p0, p3] = leftToRight ? [a, b] : [b, a];
    const run = createRun(ctx.clock, () => releaseBats(ctx, bats));
    flyBat(
      ctx,
      run,
      bat,
      { p0, p1: { x: p0.x + (p3.x - p0.x) / 3, y: top - 24 }, p2: { x: p0.x + ((p3.x - p0.x) * 2) / 3, y: top + 24 }, p3 },
      { durationMs: 2000 },
    );
    const handle = run.seal();
    void handle.finished.then((s) => {
      if (s === "completed") releaseBats(ctx, bats);
    });
    return handle;
  },
  settle() {},
  fallback: noopFallback(),
});
