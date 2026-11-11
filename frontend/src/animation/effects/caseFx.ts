import type { EffectContext } from "../director/types";
import type { Ease, Keyframes } from "./animator";
import type { RunBuilder } from "./handles";
import type { ActorPose } from "./ids";

/**
 * Small helpers shared by the Case view effects (replay.event, ladder.rung, replay.fixed-pass, replay.reveal,
 * stitch.sew). Transforms and opacity only.
 */

/** The settled state of every channel the case effects touch. */
export const REST_VALUES = { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 } as const;

/** The house ease (tokens.css `--ease-snap`). */
export const EASE_SNAP: Ease = [0.2, 0.9, 0.25, 1];

type Maybe = Element | null | undefined;

/** Puts elements back at rest: untransformed and fully visible. */
export function rest(ctx: EffectContext, els: readonly Maybe[]): void {
  for (const el of els) if (el) ctx.services.animator.set(el, REST_VALUES);
}

/** Tracks one animation on an element that may be missing. */
export function tween(
  ctx: EffectContext,
  run: RunBuilder,
  el: Maybe,
  kf: Keyframes,
  opts: { durationMs: number; delayMs?: number; ease?: Ease; times?: readonly number[] },
): void {
  if (!el) return;
  run.track(ctx.services.animator.animate(el, kf, { ease: "easeOut", ...opts }));
}

/** A rubber stamp landing: big and tilted, then pressed flat with a small rebound. */
export function stampKeyframes(tilt = -16): Keyframes {
  return { opacity: [0, 1, 1], scale: [2.4, 0.9, 1], rotate: [tilt, tilt * -0.18, 0] };
}

/** Plays each actor's pose and waits for it; missing actors are skipped. */
export function playActors(ctx: EffectContext, run: RunBuilder, actors: readonly ActorPose[] | undefined, durationMs?: number): void {
  for (const { actor, pose } of actors ?? []) {
    try {
      run.wait(ctx.services.actors.get(actor)?.play(pose, durationMs === undefined ? undefined : { durationMs }));
    } catch {
      // One broken actor must not stop the effect.
    }
  }
}

export const clampNum = (v: number, lo: number, hi: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, lo), hi);
