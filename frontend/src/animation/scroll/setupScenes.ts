import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Scroll progress for the sticky scenes (task 14.1, design "Lost Hour scene"). Loaded only through `loadScenes()`
 * (dynamic import after first paint). The scene itself is a CSS `position: sticky` stage inside a tall track
 * (problem.css); this only reports progress 0..1 through the track. No GSAP `pin`, no pin-spacer, nothing animated
 * here: the component turns progress into a reading (`dstFrame`) and requests effects from the director.
 */
export interface SceneScrubProps {
  /** The tall track (`.problem__track[data-scene="sticky"]`). */
  readonly track: Element | null;
  readonly onProgress: (progress: number) => void;
}

export function useSceneScrub({ track, onProgress }: SceneScrubProps): void {
  const cb = useRef(onProgress);
  useLayoutEffect(() => {
    cb.current = onProgress;
  });
  useGSAP(
    () => {
      if (!track) return;
      const proxy = { p: 0 };
      gsap.to(proxy, {
        p: 1,
        ease: "none",
        scrollTrigger: {
          trigger: track,
          // The stage sticks under the 64 px header; progress runs while it is stuck.
          start: "top top+=64",
          end: "bottom bottom",
          scrub: 0.3,
          invalidateOnRefresh: true,
        },
        onUpdate: () => cb.current(proxy.p),
      });
    },
    { dependencies: [track], revertOnUpdate: true },
  );
}

/** Renders nothing; mounts the scrub once the module has loaded. */
export function SceneScrubDriver(props: SceneScrubProps): null {
  useSceneScrub(props);
  return null;
}
