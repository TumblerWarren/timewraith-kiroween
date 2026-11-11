import { REDUCED_FADE_MS } from "../constants";
import type { EffectContext, EffectDef, ReducedFallback } from "../director/types";
import type { ActorPose, EffectId, ParamsOf, RevealParams } from "./ids";
import { completedHandle } from "./handles";

/** Typed constructor: the def's `id` must be the registry key and the params must match the map. */
export function defineEffect<K extends EffectId>(def: EffectDef<ParamsOf<K>> & { id: K }): EffectDef<ParamsOf<K>> & { id: K } {
  return def;
}

/** Moves actors to their final pose at once. Missing actors are skipped. */
export function settleActors(ctx: EffectContext, actors: readonly ActorPose[] | undefined): void {
  for (const { actor, pose } of actors ?? []) {
    try {
      ctx.services.actors.get(actor)?.settle(pose);
    } catch {
      // A broken actor must not stop the others from settling.
    }
  }
}

/** Elements end visible and untransformed. */
export function showElements(ctx: EffectContext, els: readonly (Element | null | undefined)[] | undefined): void {
  for (const el of els ?? []) if (el) ctx.services.animator.set(el, { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 });
}

/** Opacity-only fade in, used by "fade" fallbacks (never longer than REDUCED_FADE_MS). */
export function fadeIn(ctx: EffectContext, els: readonly (Element | null | undefined)[] | undefined, ms = REDUCED_FADE_MS): void {
  for (const el of els ?? []) {
    if (!el) continue;
    ctx.services.animator.set(el, { opacity: 0 });
    ctx.services.animator.animate(el, { opacity: [0, 1] }, { durationMs: Math.min(ms, REDUCED_FADE_MS), ease: "linear" });
  }
}

/** Final state of a region effect: targets shown, actors in their final pose. */
export function revealStatic(ctx: EffectContext, p: RevealParams): void {
  showElements(ctx, p.targets);
  settleActors(ctx, p.actors);
}

export const staticFallback = <P>(apply: (ctx: EffectContext, p: P) => void): ReducedFallback<P> => ({ kind: "static", apply });

export const fadeFallback = <P>(apply: (ctx: EffectContext, p: P) => void, fadeMs = REDUCED_FADE_MS): ReducedFallback<P> => ({
  kind: "fade",
  fadeMs,
  apply,
});

/** Ambient effects do nothing under Reduce Motion: the director returns `reduced`. */
export const noopFallback = <P>(): ReducedFallback<P> => ({ kind: "static", apply: () => {} });

type StubMeta<K extends EffectId> = Pick<EffectDef<ParamsOf<K>>, "priority" | "kind" | "maxDurationMs" | "allowCompact" | "key"> & {
  id: K;
  /** "fade" for the table rows that say "120 ms fade". */
  fade?: boolean;
};

/**
 * Registry stub for a region effect implemented later: `run` settles and completes at once, and the
 * fallback is real (the final state, plus a 120 ms fade where the table asks for one).
 */
export function stubRevealEffect<K extends EffectId>(meta: StubMeta<K>): EffectDef<ParamsOf<K>> & { id: K } {
  const settle = (ctx: EffectContext, p: ParamsOf<K>) => revealStatic(ctx, p as RevealParams);
  const { fade, ...rest } = meta;
  return {
    ...rest,
    run(ctx, p) {
      settle(ctx, p);
      return completedHandle();
    },
    settle,
    fallback: fade
      ? fadeFallback((ctx, p: ParamsOf<K>) => {
          settle(ctx, p);
          fadeIn(ctx, (p as RevealParams).targets);
        })
      : staticFallback(settle),
  };
}
