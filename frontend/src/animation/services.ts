import { createActorRegistry, type ActorRegistry } from "./actors";
import { instantAnimator, type Animator } from "./effects/animator";
import type { Pt } from "./paths/cubic";

/**
 * What effects may touch, injected into the director (task 12.4 wires the real ones):
 * actors (mascot controllers), the bat pool, overlay marks, the animator and the root element for
 * `data-ambient`. Every service has a null implementation, so effects never throw before integration.
 */

/** One pooled bat sprite in the Overlay_Layer (fixed, viewport coordinates). */
export interface BatSprite {
  /** Positioned at the viewport origin; effects move it with x/y transforms. */
  readonly element: Element;
  show(): void;
  hide(): void;
}

/** Mounted once with 14 actors (6 compact); never creates nodes during play. */
export interface BatPool {
  readonly capacity: number;
  /** Returns up to `n` free bats (fewer if the pool is busy). */
  acquire(n: number): BatSprite[];
  release(bats: readonly BatSprite[]): void;
}

/** Static marks used by Reduce Motion fallbacks: an ink mark, an ink dot or a target marker. */
export type MarkKind = "ink-mark" | "ink-dot" | "marker" | "trail";

/** Options of a `trail` dot (a small ink dot left behind a flying bat or the ghost). */
export interface TrailOptions {
  /** Diameter in px. */
  readonly size?: number;
  /** Life in ms; the dot fades from `opacity` to 0 while drifting down. */
  readonly lifeMs?: number;
  readonly opacity?: number;
}

export interface OverlayMarks {
  /** Shows a mark at a viewport point, fading in over `fadeMs` (at most 150), then removes it. */
  mark(kind: MarkKind, at: Pt, fadeMs: number, trail?: TrailOptions): void;
}

/** `document.documentElement` in the browser. */
export interface AttributeTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface EffectServices {
  readonly actors: ActorRegistry;
  readonly bats: BatPool;
  readonly overlay: OverlayMarks;
  readonly animator: Animator;
  readonly root: AttributeTarget | null;
}

export const nullBatPool: BatPool = {
  capacity: 0,
  acquire: () => [],
  release: () => {},
};

export const nullOverlay: OverlayMarks = { mark: () => {} };

export function createNullServices(): EffectServices {
  return {
    actors: createActorRegistry(),
    bats: nullBatPool,
    overlay: nullOverlay,
    animator: instantAnimator,
    root: null,
  };
}
