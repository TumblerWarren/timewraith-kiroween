import { useCallback } from "react";
import type { Pt, Rect } from "../paths/cubic";
import { useEffectTrigger } from "./useEffectTrigger";

/** The Mini Bat perched on the header is where single-bat flights start. */
const PERCH_SELECTOR = '[data-perch="nav-bat"]';
/** Flight arcs lift up to 70 px above their start (bat.travel), so starting this far below the header keeps them in view. */
const ARC_CLEARANCE_PX = 90;

function centerOf(el: Element): Pt {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Viewport point of the perched bat, or a point under the wordmark if the perch is hidden. */
export function perchPoint(): Pt {
  // The header (z 50) sits above the Overlay_Layer (z 40), so flights start just below its bottom edge.
  const headerBottom = document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 64;
  const el = document.querySelector(PERCH_SELECTOR);
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: Math.max(r.bottom, headerBottom + ARC_CLEARANCE_PX) };
  }
  return { x: 120, y: headerBottom + ARC_CLEARANCE_PX };
}

export function viewportRect(): Rect {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

function toRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function onScreen(p: Pt): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= window.innerWidth && p.y <= window.innerHeight;
}

/**
 * Hook point for the Open-a-case form (task 7.5): returns `(originEl) => void`, which requests the submit Bat Burst
 * (`bats.burst`, P2) from the given element, usually the submit button. It never blocks: call it after the draft
 * is saved and focus has moved; the director drops or reduces it as needed.
 */
export function useBatBurst(): (originEl: Element | null) => void {
  const request = useEffectTrigger();
  return useCallback(
    (originEl) => {
      if (!originEl) return;
      request("bats.burst", { origin: toRect(originEl), bounds: viewportRect(), seed: (Date.now() & 0x7fffffff) >>> 0 });
    },
    [request],
  );
}

/**
 * Node and clock-stamp clicks: the Mini Bat travels from its perch to `targetEl` (`bat.travel`, P2), or flutters
 * at the perch when the target is off screen.
 */
export function useBatTravel(): (targetEl: Element | null) => void {
  const request = useEffectTrigger();
  return useCallback(
    (targetEl) => {
      const from = perchPoint();
      const to = targetEl ? centerOf(targetEl) : from;
      request("bat.travel", { from, to, onScreen: targetEl !== null && onScreen(to) });
    },
    [request],
  );
}
