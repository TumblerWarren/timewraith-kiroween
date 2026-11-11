import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { playActor, settleAndFade, settleReveal, tween } from "./region-shared";
import { defineEffect, fadeFallback } from "./shared";

const MAX_MS = 600;
export const CASE_OPEN_MS = 480;

/**
 * P2 scene (task 14.2): the selected case opens. The case-file sheet (`targets[0]`) unfolds from its top edge
 * (scaleY .94 to 1, opacity .6 to 1, 480 ms; transform-origin top in CSS) and the opened card's folder tab
 * (`targets[1]`) slides 12 px back into place. The content was already swapped, focused and announced.
 * Keyed by its id (`case.open`), so a second selection while one opens is dropped and the state is still right.
 * Reduce Motion: the sheet is shown, with a 120 ms fade.
 */
export const caseOpen = defineEffect({
  id: "case.open",
  priority: 2,
  kind: "scene",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const [sheet, tab] = p.targets ?? [];
    tween(ctx, run, sheet, { scaleY: [0.94, 1.008, 1], opacity: [0.6, 1, 1] }, { durationMs: CASE_OPEN_MS, ease: "easeOut", times: [0, 0.75, 1] });
    tween(ctx, run, tab, { x: [12, -2, 0] }, { durationMs: 320, ease: "easeOut" });
    for (const a of p.actors ?? []) playActor(ctx, run, a.actor, a.pose, 420);
    return run.seal();
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: fadeFallback<ParamsOf<"case.open">>((ctx, p) => settleAndFade(ctx, p, (p.targets ?? []).slice(0, 1))),
});
