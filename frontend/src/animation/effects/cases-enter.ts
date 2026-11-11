import type { ParamsOf } from "./ids";
import { createRun } from "./handles";
import { fitStagger, playActor, settleReveal, tween } from "./region-shared";
import { defineEffect, staticFallback } from "./shared";

const MAX_MS = 900;
const MARGIN_MS = 50;
const STAGGER_MS = 70;
const CARD_MS = 440;
/** Cards slide this far along the thread (down the shelf) before they settle with their seeded lean. */
export const DEAL_DISTANCE_PX = 24;

/**
 * P2 scene (task 14.2): the library's case cards are dealt onto the shelf along the thread. Each card
 * (`targets`, in list order) starts 24 px up the thread, turned a little and transparent, and settles into its
 * seeded lean (the lean is the CSS `rotate` property, so the transform ends at identity), 70 ms apart, all inside
 * 900 ms; no stagger when compact. Actors (the Scribe's hand) play as the first card lands.
 * Reduce Motion: every card in place.
 */
export const casesEnter = defineEffect({
  id: "cases.enter",
  priority: 2,
  kind: "scene",
  maxDurationMs: MAX_MS,
  allowCompact: true,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const cards = p.targets ?? [];
    const step = fitStagger(cards.length, STAGGER_MS, CARD_MS, MAX_MS - MARGIN_MS, ctx.env.compact);
    cards.forEach((card, i) => {
      const turn = i % 2 === 0 ? -4 : 4;
      ctx.services.animator.set(card, { y: -DEAL_DISTANCE_PX, rotate: turn, opacity: 0 });
      tween(
        ctx,
        run,
        card,
        { y: [-DEAL_DISTANCE_PX, 3, 0], rotate: [turn, -turn * 0.15, 0], opacity: [0, 1, 1] },
        { durationMs: CARD_MS, delayMs: Math.round(i * step), ease: "easeOut", times: [0, 0.7, 1] },
      );
    });
    for (const a of p.actors ?? []) run.after(CARD_MS * 0.5, () => playActor(ctx, run, a.actor, a.pose, 400));
    return run.seal();
  },
  settle: (ctx, p) => settleReveal(ctx, p),
  fallback: staticFallback<ParamsOf<"cases.enter">>((ctx, p) => settleReveal(ctx, p)),
});
