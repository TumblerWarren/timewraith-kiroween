import { useEffect, useLayoutEffect, useRef } from "react";
import { REACTION_THRESHOLD } from "../constants";
import type { EffectId, ParamsOf } from "../effects/ids";
import { useDirectorHost, type DirectorHost } from "./directorHost";

/** Thresholds at which the observer reports, so tall regions are detected by the share of the viewport they fill. */
const THRESHOLDS = [0, 0.1, 0.2, REACTION_THRESHOLD, 0.5, 0.75, 1];

/**
 * A region has been entered when 35% of it is visible, or when it fills 35% of the viewport (a region taller
 * than about 2.9 viewports can never show 35% of itself).
 */
export function hasEntered(entry: Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio" | "intersectionRect" | "rootBounds">): boolean {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= REACTION_THRESHOLD) return true;
  const vh = entry.rootBounds?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0);
  return vh > 0 && entry.intersectionRect.height >= REACTION_THRESHOLD * vh;
}

export interface OnceOnEnterOptions {
  /** Waits this long after entering before the request (lets a running scene finish first). */
  readonly delayMs?: number;
}

/**
 * Observes the region `#sectionId` with one IntersectionObserver (threshold 0.35) and requests the effect once,
 * the first time the region is entered. The latch lives in the director host, per region and effect, so a
 * remount or a second scroll past the region never replays it (Requirement 2.4, Property 7).
 * `params` is read at request time, so it may look up elements.
 */
export function useOnceOnEnter<K extends EffectId>(
  sectionId: string,
  effectId: K,
  params: () => ParamsOf<K> | null,
  opts: OnceOnEnterOptions = {},
): void {
  const host = useDirectorHost();
  const paramsRef = useRef(params);
  useLayoutEffect(() => {
    paramsRef.current = params;
  });
  const delayMs = opts.delayMs ?? 0;
  useEffect(() => {
    if (!host) return;
    return observeOnce(host, sectionId, effectId, () => paramsRef.current(), delayMs);
  }, [host, sectionId, effectId, delayMs]);
}

/** The imperative core of `useOnceOnEnter` (also used by tests). Returns a cleanup. */
export function observeOnce<K extends EffectId>(
  host: Pick<DirectorHost, "request" | "claimOnce">,
  sectionId: string,
  effectId: K,
  params: () => ParamsOf<K> | null,
  delayMs = 0,
): () => void {
  const key = `${sectionId}:${effectId}`;
  const el = document.getElementById(sectionId);
  if (!el || typeof IntersectionObserver === "undefined") return () => {};
  let timer = 0;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some(hasEntered)) return;
      io.disconnect();
      if (!host.claimOnce(key)) return;
      const fire = () => {
        const p = params();
        if (p) host.request(effectId, p);
      };
      if (delayMs > 0) timer = window.setTimeout(fire, delayMs);
      else fire();
    },
    { threshold: THRESHOLDS },
  );
  io.observe(el);
  return () => {
    io.disconnect();
    window.clearTimeout(timer);
  };
}
