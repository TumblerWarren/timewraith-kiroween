import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { playActor, settleAndFade, settleReveal, tween } from "./region-shared";
import { defineEffect, fadeFallback } from "./shared";

const MAX_MS = 900;
/** A beat after the card comes on screen (CaseMotionHooks requests it once the card is half in view). */
const DROP_AT_MS = 60;
const DROP_MS = 400;
const UNDERLINE_AT_MS = 440;
const UNDERLINE_MS = 250;

/**
 * P2 scene (task 14.2): a new Draft_Case card drops onto the top of the library (y -32 to 0, scaleY .96 to 1),
 * Skeleton Scribe's hand (`actors`) slides in and an ink underline (`targets[1]`, scaleX from the left) is drawn
 * under the card's DOM label "Draft, not run". `targets[0]` is the card. Keyed by draft id. The draft already
 * exists, is focused and was announced before this runs; nothing waits for it.
 * Reduce Motion: the card and its underlined label are shown, with a 120 ms fade.
 */
export const caseDraftCreate = defineEffect({
  id: "case.draft-create",
  priority: 2,
  kind: "scene",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  key: (p) => `case.draft-create:${p.draftId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const [card, underline] = p.targets ?? [];
    if (card) ctx.services.animator.set(card, { y: -32, scaleY: 0.96, opacity: 0 });
    if (underline) ctx.services.animator.set(underline, { scaleX: 0 });
    tween(
      ctx,
      run,
      card,
      { y: [-32, 4, 0], scaleY: [0.96, 1.02, 1], opacity: [0, 1, 1] },
      { durationMs: DROP_MS, delayMs: DROP_AT_MS, ease: "easeOut", times: [0, 0.7, 1] },
    );
    tween(ctx, run, underline, { scaleX: [0, 1] }, { durationMs: UNDERLINE_MS, delayMs: UNDERLINE_AT_MS, ease: "easeInOut" });
    for (const a of p.actors ?? []) run.after(UNDERLINE_AT_MS - 160, () => playActor(ctx, run, a.actor, a.pose, 400));
    return run.seal();
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: fadeFallback<ParamsOf<"case.draft-create">>((ctx, p) => settleAndFade(ctx, p, (p.targets ?? []).slice(0, 1))),
});
