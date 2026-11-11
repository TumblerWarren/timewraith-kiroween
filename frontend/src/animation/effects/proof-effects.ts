import type { EffectContext } from "../director/types";
import { EASE_SNAP, playActors, rest, tween } from "./caseFx";
import { createRun } from "./handles";
import type { ParamsOf } from "./ids";
import { defineEffect, settleActors, staticFallback } from "./shared";

/**
 * Proof animations (task 14.6): the Raven unrolls the Evidence Ladder (`proof.ladder`), the Mummy winds a bandage
 * across the hash tag (`proof.hash`) and Two-Faced Jack hinges between the browser and server faces (`proof.jack`).
 * All P2 micro effects: they run side by side when several parts of the proof are on screen. Each starts from an
 * "armed" state (the Case view sets `data-armed` on the part so it is hidden before the first paint); the run
 * writes the start values and removes the attribute, so nothing flashes. `settle` and the Reduce Motion fallback end
 * in the same final state: parts shown at rest.
 */

type Maybe = Element | null | undefined;

/** Removes the armed marker (`data-armed` on the part's block: the ladder scroll, the hash row). */
export function unarm(el: Maybe): void {
  el?.removeAttribute("data-armed");
}

/** The ladder rung stagger: rungs stamp in this far apart. */
export const RUNG_STEP_MS = 100;
/** The most rungs that are staggered (the ladder has five; extra rungs share the last slot). */
const MAX_RUNGS = 8;

/** Start time of rung `i` after the run starts, in ms. */
export function rungStartMs(i: number): number {
  return 80 + Math.min(i, MAX_RUNGS - 1) * RUNG_STEP_MS;
}

// ---------------------------------------------------------------- proof.ladder

type Ladder = ParamsOf<"proof.ladder">;

function ladderParts(p: Ladder): Element[] {
  return [...p.rungs, ...(p.shapes ?? []), ...(p.ranks ?? [])];
}

function settleLadder(ctx: EffectContext, p: Ladder): void {
  rest(ctx, ladderParts(p));
  if (p.rod) ctx.services.animator.set(p.rod, { x: 0, y: 0, opacity: 0, scaleX: 1, scaleY: 1 });
  settleActors(ctx, p.actors);
  unarm(p.armed);
}

export const proofLadder = defineEffect({
  id: "proof.ladder",
  priority: 2,
  kind: "micro",
  maxDurationMs: 1500,
  allowCompact: true,
  key: (p) => `proof.ladder:${p.caseId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    const n = Math.min(p.rungs.length, MAX_RUNGS);
    const travelMs = rungStartMs(n) + 180;
    // Start state first, then un-arm, so the hidden parts never flash.
    p.rungs.forEach((el) => a.set(el, { opacity: 0, x: -14, scaleX: 0.97 }));
    (p.shapes ?? []).forEach((el) => a.set(el, { scale: 0.5 }));
    if (p.rod) a.set(p.rod, { y: 0, opacity: 0 });
    unarm(p.armed);

    // The rod unrolls down the scroll while the rungs stamp in behind it.
    if (p.rod) tween(ctx, run, p.rod, { y: [0, p.travel ?? 240], opacity: [1, 1, 0] }, { durationMs: travelMs, ease: "linear", times: [0, 0.9, 1] });
    p.rungs.forEach((el, i) => {
      const at = rungStartMs(i);
      tween(ctx, run, el, { opacity: [0, 1], x: [-14, 0], scaleX: [0.97, 1] }, { durationMs: 220, delayMs: at, ease: EASE_SNAP });
      tween(ctx, run, p.shapes?.[i], { scale: [0.5, 1.18, 1] }, { durationMs: 300, delayMs: at + 40, times: [0, 0.6, 1] });
      tween(ctx, run, p.ranks?.[i], { rotate: [-1, 1.4, 0] }, { durationMs: 260, delayMs: at + 120 });
    });
    // The Raven sweeps its wing as the first rung lands, then hops a little with each stamp.
    playActors(ctx, run, p.actors);
    return run.seal();
  },
  settle: settleLadder,
  fallback: staticFallback(settleLadder),
});

// ---------------------------------------------------------------- proof.hash

type Hash = ParamsOf<"proof.hash">;

function settleHash(ctx: EffectContext, p: Hash): void {
  const a = ctx.services.animator;
  rest(ctx, [p.strip, ...(p.turns ?? []), p.end, p.tag, p.value]);
  if (p.strip) a.set(p.strip, { scaleX: 1, y: 0, opacity: 1 });
  settleActors(ctx, p.actors);
  unarm(p.armed);
}

export const proofHash = defineEffect({
  id: "proof.hash",
  priority: 2,
  kind: "micro",
  maxDurationMs: 1400,
  allowCompact: true,
  key: (p) => `proof.hash:${p.caseId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    if (p.strip) a.set(p.strip, { scaleX: 0, opacity: 1 });
    (p.turns ?? []).forEach((el) => a.set(el, { scaleY: 0.2, opacity: 0 }));
    if (p.end) a.set(p.end, { rotate: -18, opacity: 0 });
    unarm(p.armed);

    // The Mummy crouches, raises the strip and bows once the tag is sealed.
    playActors(ctx, run, p.actors);
    // The strip unwinds across the tag from the Mummy's hand and lifts in the middle.
    tween(ctx, run, p.strip, { scaleX: [0, 0.7, 1.03, 1], y: [0, -6, -2, 0] }, { durationMs: 540, delayMs: 80, ease: EASE_SNAP, times: [0, 0.45, 0.8, 1] });
    (p.turns ?? []).forEach((el, i) => {
      tween(ctx, run, el, { scaleY: [0.2, 1.08, 1], opacity: [0, 1, 1] }, { durationMs: 260, delayMs: 520 + i * 140, times: [0, 0.6, 1] });
    });
    tween(ctx, run, p.end, { rotate: [-18, 8, -3, 0], opacity: [0, 1, 1, 1] }, { durationMs: 340, delayMs: 760, times: [0, 0.4, 0.75, 1] });
    tween(ctx, run, p.tag, { scale: [1, 1.03, 1] }, { durationMs: 300, delayMs: 900 });
    tween(ctx, run, p.value, { x: [0, 2, -1, 0] }, { durationMs: 300, delayMs: 920 });
    return run.seal();
  },
  settle: settleHash,
  fallback: staticFallback(settleHash),
});

// ---------------------------------------------------------------- proof.jack

type Jack = ParamsOf<"proof.jack">;

function settleJack(ctx: EffectContext, p: Jack): void {
  const a = ctx.services.animator;
  rest(ctx, [p.browserFace, p.serverFace]);
  for (const u of [p.browserUnderline, p.serverUnderline]) if (u) a.set(u, { scaleX: 0 });
  if (p.browserCaption) a.set(p.browserCaption, { opacity: 1 });
  if (p.serverCaption) a.set(p.serverCaption, { opacity: 0 });
  settleActors(ctx, p.actors);
  unarm(p.armed);
}

/** Hinge instants of Jack's `flip` pose (see mascots/poses.ts): the first swap at 170 ms and the return swap at 660 ms. */
const FLIP_TO_SERVER_MS = 170;
const FLIP_BACK_MS = 660;

export const proofJack = defineEffect({
  id: "proof.jack",
  priority: 2,
  kind: "micro",
  maxDurationMs: 1100,
  allowCompact: true,
  key: (p) => `proof.jack:${p.caseId}`,
  run(ctx, p) {
    const run = createRun(ctx.clock);
    const a = ctx.services.animator;
    unarm(p.armed);
    // The hinge flip itself is Jack's `flip` pose.
    playActors(ctx, run, p.actors);
    // At the first hinge the captions cross-fade and the server half lights; at the second the browser half does.
    const light = (on: Maybe, off: Maybe, onLine: Maybe, offLine: Maybe, onCap: Maybe, offCap: Maybe) => {
      tween(ctx, run, on, { y: [0, -4] }, { durationMs: 160 });
      tween(ctx, run, off, { y: [-4, 0] }, { durationMs: 160 });
      tween(ctx, run, onLine, { scaleX: [0, 1] }, { durationMs: 220 });
      tween(ctx, run, offLine, { scaleX: [1, 0] }, { durationMs: 160 });
      tween(ctx, run, onCap, { opacity: [0, 1] }, { durationMs: 120, ease: "linear" });
      tween(ctx, run, offCap, { opacity: [1, 0] }, { durationMs: 120, ease: "linear" });
    };
    run.after(FLIP_TO_SERVER_MS, () => light(p.serverFace, p.browserFace, p.serverUnderline, p.browserUnderline, p.serverCaption, p.browserCaption));
    run.after(FLIP_BACK_MS, () => light(p.browserFace, p.serverFace, p.browserUnderline, p.serverUnderline, p.browserCaption, p.serverCaption));
    // Everything ends at rest after the second swap.
    run.after(FLIP_BACK_MS + 240, () => {
      rest(ctx, [p.browserFace, p.serverFace]);
      for (const u of [p.browserUnderline, p.serverUnderline]) if (u) a.set(u, { scaleX: 0 });
    });
    return run.seal();
  },
  settle: settleJack,
  fallback: staticFallback(settleJack),
});
