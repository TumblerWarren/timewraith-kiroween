import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MotionValue } from "motion/react";
import { useEffect } from "react";
import { LEAD_LINE_RATIO } from "../constants";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Scroll sync for the Timeline_Thread (task 11.2, design "Draw and progress"). Loaded only through
 * `loadScroll()` (dynamic import after first paint), so GSAP never sits in the main bundle.
 *
 * One scrubbed proxy drives `leadY` (a Motion value in `<main>` coordinates): the smoothed scroll position plus
 * 60% of the viewport height. The ThreadLayer, the Section_Nodes and the Mini Ghost read `leadY`; nothing here
 * renders. Reduce Motion: no ScrollTrigger, `leadY` is pinned to the end so the thread is fully drawn.
 */
export interface ThreadScrollProps {
  readonly leadY: MotionValue<number>;
  readonly reduceMotion: boolean;
  readonly compact: boolean;
  /** `<main>`'s top in page coordinates. */
  readonly mainTop: number;
  /** Lead value that draws the whole thread (the last anchor). */
  readonly fullLead: number;
  /** Bumped by every re-measure; triggers `ScrollTrigger.refresh()`. */
  readonly version: number;
}

export function useThreadScroll({ leadY, reduceMotion, compact, mainTop, fullLead, version }: ThreadScrollProps): void {
  useGSAP(
    () => {
      if (reduceMotion) return;
      const root = document.documentElement;
      let maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
      let vh = window.innerHeight;
      const lead = (p: number) => p * maxScroll + vh * LEAD_LINE_RATIO - mainTop;
      const proxy = { p: maxScroll > 0 ? window.scrollY / maxScroll : 0 };
      leadY.set(lead(proxy.p));
      gsap.to(proxy, {
        p: 1,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: compact ? 0.3 : 0.5,
          invalidateOnRefresh: true,
          onRefresh: () => {
            maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
            vh = window.innerHeight;
          },
        },
        onUpdate: () => leadY.set(lead(proxy.p)),
      });
    },
    { dependencies: [reduceMotion, compact, mainTop], revertOnUpdate: true },
  );

  // Reduce Motion (and toggling into it): fully drawn, no scrub.
  useEffect(() => {
    if (reduceMotion) leadY.set(fullLead);
  }, [reduceMotion, fullLead, leadY]);

  // Layout changed (fonts, images, the library growing): recompute trigger positions.
  useEffect(() => {
    if (!reduceMotion && version > 0) ScrollTrigger.refresh();
  }, [version, reduceMotion]);
}

/** Renders nothing; mounts the scroll sync once the module has loaded. */
export function ThreadScrollDriver(props: ThreadScrollProps): null {
  useThreadScroll(props);
  return null;
}
