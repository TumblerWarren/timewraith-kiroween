import { REDUCED_FADE_MS } from "../constants";
import type { EffectContext } from "../director/types";
import type { RevealParams } from "./ids";
import type { RunBuilder } from "./handles";
import type { AnimOptions, Keyframes } from "./animator";
import { settleActors } from "./shared";

/**
 * Helpers for the region effects of task 14 (Lost Hour, library, case open, crew, flow, closing).
 * Every helper writes transforms and opacity only, through `ctx.services.animator`.
 */

/** Identity transform and full opacity, every channel the region effects animate (scaleX/scaleY included). */
export const REST_VALUES = { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 } as const;

/** Elements end visible and untransformed. */
export function restElements(ctx: EffectContext, els: readonly (Element | null | undefined)[] | undefined): void {
  for (const el of els ?? []) {
    if (!el) continue;
    try {
      ctx.services.animator.set(el, REST_VALUES);
    } catch {
      // A detached element must not stop the others from settling.
    }
  }
}

/** Final state of a region effect: targets at rest, actors in their final pose. */
export function settleReveal(ctx: EffectContext, p: RevealParams): void {
  restElements(ctx, p.targets);
  settleActors(ctx, p.actors);
}

/** Reduce Motion "fade" path: the final state, then an opacity-only fade in of at most 120 ms. */
export function settleAndFade(ctx: EffectContext, p: RevealParams, fadeEls: readonly (Element | null | undefined)[] = p.targets ?? []): void {
  settleReveal(ctx, p);
  for (const el of fadeEls) {
    if (!el) continue;
    ctx.services.animator.set(el, { opacity: 0 });
    ctx.services.animator.animate(el, { opacity: [0, 1] }, { durationMs: REDUCED_FADE_MS, ease: "linear" });
  }
}

/** Animates one element and tracks it in the run. Missing elements are skipped. */
export function tween(ctx: EffectContext, run: RunBuilder, el: Element | null | undefined, kf: Keyframes, opts: AnimOptions): void {
  if (!el) return;
  run.track(ctx.services.animator.animate(el, kf, opts));
}

/** Plays an actor's pose (bounded) and tracks it. Missing actors are skipped. */
export function playActor(ctx: EffectContext, run: RunBuilder, actor: string, pose: string, durationMs: number): void {
  const c = ctx.services.actors.get(actor);
  if (!c) return;
  try {
    run.wait(c.play(pose, { durationMs }) ?? undefined);
  } catch {
    // An actor that throws is skipped; settle puts it at rest.
  }
}

/**
 * A stagger that keeps `n` items, each lasting `itemMs`, inside `budgetMs`: the preferred step, shrunk if needed,
 * and 0 when compact (the design's "no stagger when compact").
 */
export function fitStagger(n: number, preferredMs: number, itemMs: number, budgetMs: number, compact: boolean): number {
  if (compact || n <= 1) return 0;
  return Math.max(0, Math.min(preferredMs, (budgetMs - itemMs) / (n - 1)));
}

/** First element of `root` (or `root` itself) matching `selector`. */
export function find(root: Element | null | undefined, selector: string): Element | null {
  if (!root) return null;
  if (typeof root.matches === "function" && root.matches(selector)) return root;
  return typeof root.querySelector === "function" ? root.querySelector(selector) : null;
}
