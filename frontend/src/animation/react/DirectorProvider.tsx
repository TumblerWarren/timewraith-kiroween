import { useEffect, useState, type ReactNode } from "react";
import { useReduceMotion } from "../../a11y/ReduceMotionProvider";
import type { Animator } from "../effects/animator";
import { createDirectorHost, DirectorContext } from "./directorHost";
import { useCompact } from "./useCompact";

/** Text inputs inside a form suppress ambient effects while focused (Requirement 9.8). */
const INPUT_SELECTOR = "form input, form textarea, form select";
/** The replay scrubber marks its root with `data-scrubber` (Requirement 9.9). */
const SCRUBBER_SELECTOR = "[data-scrubber]";

function focusState(el: Element | null): { input: boolean; scrubber: boolean } {
  if (!el || typeof el.closest !== "function") return { input: false, scrubber: false };
  return { input: el.matches(INPUT_SELECTOR), scrubber: el.closest(SCRUBBER_SELECTOR) !== null };
}

/**
 * Creates the app's MotionDirector with the real services (actor registry, bat pool, overlay marks,
 * `motionAnimator`, `document.documentElement` for `data-ambient`) and keeps its environment in sync:
 * Reduce Motion from the site toggle, `hidden` from `visibilitychange`, `compact` from the 768 px query, and
 * ambient suppression while a form input or the scrubber has focus. Disposes the director on unmount.
 */
export function DirectorProvider({ children, animator }: { children: ReactNode; animator?: Animator }) {
  const { reduceMotion } = useReduceMotion();
  const [host] = useState(() => createDirectorHost({ reducedMotion: reduceMotion, animator }));
  const compact = useCompact();

  useEffect(() => () => host.stop(), [host]);

  useEffect(() => {
    host.setEnv({ reducedMotion: reduceMotion });
  }, [host, reduceMotion]);

  useEffect(() => {
    host.setEnv({ compact });
  }, [host, compact]);

  useEffect(() => {
    const onVisibility = () => host.setEnv({ hidden: document.visibilityState === "hidden" });
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [host]);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => host.setEnv({ suppressed: focusState(e.target as Element | null) });
    // relatedTarget is the element receiving focus (null when focus leaves the page).
    const onFocusOut = (e: FocusEvent) => host.setEnv({ suppressed: focusState(e.relatedTarget as Element | null) });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [host]);

  return <DirectorContext.Provider value={host}>{children}</DirectorContext.Provider>;
}
