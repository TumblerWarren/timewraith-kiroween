import type { ActorController, PlayOptions, PoseName } from "../animation/actors";
import type { Animation, Animator } from "../animation/effects/animator";
import { phasesToKeyframes, POSES, resolvePose } from "./poses";

/**
 * Mascot actor controllers (task 12.4). Every `<Mascot>` registers one in the director's actor registry, so
 * effects can pose it by id without importing components. Until the layered rigs exist, a pose is a small
 * whole-figure tween of transform and opacity that ends at rest (identity), so a settled pose and the rest
 * pose look the same and nothing is left half-moved.
 *
 * Actor ids are scoped by where the figure stands: `"{region}:{mascot}"` (for example `"open:wraith-director"`,
 * `"crew:mini-bat"`, `"header:mini-bat"`), because the same mascot appears in several regions. The Mini Ghost
 * companion registers as plain `"mini-ghost"` (the id `ghost.look` uses).
 */

const REST_CH = { x: 0, y: 0, rotate: 0, skewX: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 } as const;

export function poseNames(): readonly string[] {
  return Object.keys(POSES);
}

/**
 * Plays phase-based poses (`poses.ts`) on a figure's root element with the pose's transform origin (feet by default).
 * Only the channels a pose has written are reset on `settle`, so a mascot's CSS `rotate`/`translate`/`scale`
 * properties (idle breathing) are untouched.
 */
export function createMascotActor(getElement: () => Element | null, animator: Animator, mascot?: string): ActorController {
  let running: Animation | null = null;
  const touched = new Set<keyof typeof REST_CH>();
  const stop = () => {
    running?.stop();
    running = null;
  };
  const rest = (el: Element) => {
    if (touched.size === 0) return;
    const values: Partial<Record<keyof typeof REST_CH, number>> = {};
    for (const k of touched) values[k] = REST_CH[k];
    animator.set(el, values);
  };
  return {
    get element() {
      return getElement();
    },
    play(pose: PoseName, opts?: PlayOptions) {
      const el = getElement();
      if (!el) return;
      stop();
      if (pose === "rest") {
        rest(el);
        return;
      }
      const spec = resolvePose(mascot, pose);
      const built = phasesToKeyframes(spec);
      for (const k of built.channels) touched.add(k);
      (el as HTMLElement).style.transformOrigin = spec.origin;
      // A requested duration shorter than the pose compresses it; a longer one is ignored.
      const durationMs = Math.max(1, Math.min(built.durationMs, opts?.durationMs ?? built.durationMs));
      const anim = animator.animate(el, built.keyframes, {
        durationMs,
        delayMs: opts?.delayMs,
        times: built.times,
        segmentEases: built.segmentEases,
      });
      running = anim;
      return anim.finished.then(() => {
        if (running === anim) running = null;
      });
    },
    settle() {
      stop();
      const el = getElement();
      if (el) rest(el);
    },
    look() {
      // The placeholder art has no separate eyes; the Mini Ghost renders its own (thread/GhostCompanion).
    },
  };
}
/** `"{region}:{mascot}"` for a figure inside `section[id]`, `"header:{mascot}"` in the header, else `"page:{mascot}"`. */
export function scopedActorId(el: Element, mascot: string): string {
  const section = el.closest("section[id]");
  if (section) return `${section.id}:${mascot}`;
  if (el.closest("header")) return `header:${mascot}`;
  if (el.closest("[data-overlay]")) return `overlay:${mascot}`;
  return `page:${mascot}`;
}
