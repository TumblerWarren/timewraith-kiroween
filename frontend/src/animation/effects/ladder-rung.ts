import type { EffectContext } from "../director/types";
import { rest, stampKeyframes, tween } from "./caseFx";
import { createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, settleActors, staticFallback } from "./shared";

type P = ParamsOf<"ladder.rung">;

function settle(ctx: EffectContext, p: P): void {
  rest(ctx, [...(p.stamps ?? []), ...(p.shapes ?? []), ...(p.targets ?? [])]);
  settleActors(ctx, p.actors);
}

/**
 * P1 micro, at most 400 ms (task 14.3): the newly reached rung is stamped. Its "now" stamp lands tilted and is
 * pressed flat, and the rung's shape fills in with a small pop, on the rung strip and on the full ladder at once.
 * The marking itself (text, shape, aria-current) is already in the DOM. Reduce Motion: the marked rung at rest.
 */
export const ladderRung = defineEffect({
  id: "ladder.rung",
  priority: 1,
  kind: "micro",
  maxDurationMs: 400,
  allowCompact: true,
  key: (p) => `ladder.rung:${p.rung}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    (p.stamps ?? []).forEach((el, i) => tween(ctx, run, el, stampKeyframes(i % 2 ? 14 : -16), { durationMs: 300, delayMs: i * 40, times: [0, 0.6, 1] }));
    (p.shapes ?? []).forEach((el, i) => tween(ctx, run, el, { scale: [0.5, 1.18, 1] }, { durationMs: 300, delayMs: 30 + i * 40, times: [0, 0.6, 1] }));
    return run.seal();
  },
  settle,
  fallback: staticFallback(settle),
});
