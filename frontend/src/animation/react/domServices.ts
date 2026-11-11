import { MAX_REDUCED_FADE_MS } from "../constants";
import { motionAnimator } from "../effects/animator";
import type { Pt } from "../paths/cubic";
import { BAT_TRAIL_DOTS } from "../constants";
import type { BatPool, BatSprite, MarkKind, OverlayMarks, TrailOptions } from "../services";

/**
 * Browser implementations of the director's bat pool and overlay marks (task 12.4). Both are created once by the
 * DirectorProvider; the React layers (`overlay/BatPool.tsx`, `overlay/OverlayLayer.tsx`) attach their DOM nodes to
 * them after mount. Before that they behave like the null services (no bats, no marks), so effects never throw.
 */

export interface DomBatPool extends BatPool {
  /** Hands the mounted sprites to the pool. Returns a detach function for unmount. */
  attach(sprites: readonly BatSprite[]): () => void;
}

export function createDomBatPool(): DomBatPool {
  let sprites: readonly BatSprite[] = [];
  const busy = new Set<BatSprite>();
  return {
    get capacity() {
      return sprites.length;
    },
    acquire(n) {
      const out: BatSprite[] = [];
      for (const s of sprites) {
        if (out.length >= n) break;
        if (!busy.has(s)) {
          busy.add(s);
          out.push(s);
        }
      }
      return out;
    },
    release(bats) {
      for (const b of bats) busy.delete(b);
    },
    attach(next) {
      sprites = next;
      busy.clear();
      return () => {
        if (sprites === next) {
          sprites = [];
          busy.clear();
        }
      };
    },
  };
}

/** A bat sprite backed by one fixed element; `data-active` makes it visible (motion.css). */
export function domBatSprite(element: HTMLElement): BatSprite {
  return {
    element,
    show() {
      element.setAttribute("data-active", "");
    },
    hide() {
      element.removeAttribute("data-active");
    },
  };
}

export interface DomOverlayMarks extends OverlayMarks {
  attach(host: HTMLElement): () => void;
}

/** How long a mark stays before it fades out and is removed. */
const MARK_HOLD_MS = 900;

/**
 * Static marks for Reduce Motion fallbacks (ink mark, ink dot, target marker): a small element in the
 * Overlay_Layer that fades in over at most 150 ms, holds, fades out and is removed.
 */
export function createDomOverlayMarks(): DomOverlayMarks {
  let host: HTMLElement | null = null;
  let trailsAlive = 0;
  return {
    mark(kind: MarkKind, at: Pt, fadeMs: number, trail?: TrailOptions) {
      if (!host || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;
      if (kind === "trail") {
        // Ink-dot trail: a small dot drifts down 14 px and fades. At most BAT_TRAIL_DOTS alive at once.
        if (trailsAlive >= BAT_TRAIL_DOTS) return;
        trailsAlive++;
        const dot = document.createElement("span");
        const size = trail?.size ?? 5;
        const life = Math.max(120, trail?.lifeMs ?? 500);
        const peak = trail?.opacity ?? 0.55;
        dot.className = "overlay-mark overlay-mark--trail";
        dot.setAttribute("aria-hidden", "true");
        dot.setAttribute("data-overlay-mark", "trail");
        dot.style.left = `${Math.round(at.x)}px`;
        dot.style.top = `${Math.round(at.y)}px`;
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        host.appendChild(dot);
        void motionAnimator.animate(dot, { opacity: [peak, 0], y: [0, 14], scale: [1, 0.6] }, { durationMs: life, ease: "easeOut" }).finished.then(() => {
          trailsAlive--;
          dot.remove();
        });
        return;
      }
      const el = document.createElement("span");
      el.className = `overlay-mark overlay-mark--${kind}`;
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("data-overlay-mark", kind);
      el.style.left = `${Math.round(at.x)}px`;
      el.style.top = `${Math.round(at.y)}px`;
      host.appendChild(el);
      const ms = Math.min(Math.max(0, fadeMs), MAX_REDUCED_FADE_MS);
      motionAnimator.set(el, { opacity: 0 });
      motionAnimator.animate(el, { opacity: [0, 1] }, { durationMs: ms, ease: "linear" });
      window.setTimeout(() => {
        void motionAnimator.animate(el, { opacity: [1, 0] }, { durationMs: ms, ease: "linear" }).finished.then(() => el.remove());
      }, MARK_HOLD_MS);
    },
    attach(next) {
      host = next;
      return () => {
        if (host === next) host = null;
      };
    },
  };
}
