import { MotionConfig } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Reduce_Motion_Mode state (Requirements 10.1 to 10.3).
 *
 * Initial value: the stored user choice (localStorage["tw.reduceMotion"], "on" or "off") if present,
 * else the `prefers-reduced-motion: reduce` media query. The inline script in index.html applies the same
 * rule before first paint; keep both in sync. The provider mirrors the state to `html[data-reduce-motion]`
 * ("true" or "false") and configures Motion with `reducedMotion` "always" or "never", so the site toggle
 * overrides the OS setting in both directions.
 */
export const REDUCE_MOTION_STORAGE_KEY = "tw.reduceMotion";
export const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type ReduceMotionChoice = "on" | "off";

export function readStoredChoice(): ReduceMotionChoice | null {
  try {
    const value = window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredChoice(choice: ReduceMotionChoice): void {
  try {
    window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked (private mode, policy). The choice then lasts for this visit only.
  }
}

function systemPrefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCE_MOTION_QUERY).matches;
}

/** Stored choice first, else the media query. */
export function resolveInitialReduceMotion(): boolean {
  const stored = readStoredChoice();
  if (stored !== null) return stored === "on";
  return systemPrefersReducedMotion();
}

/** Where the current mode came from: the user's stored choice, or the `prefers-reduced-motion` media query. */
export type ReduceMotionSource = "user" | "system";

export interface ReduceMotionContextValue {
  readonly reduceMotion: boolean;
  /** "system" until the user picks a mode on this site (Requirement 10.10: the toggle says so). */
  readonly source: ReduceMotionSource;
  /** Flips the mode, stores the choice, and returns the new value. */
  readonly toggle: () => boolean;
  /** Sets the mode explicitly and stores the choice. */
  readonly setReduceMotion: (value: boolean) => void;
}

const ReduceMotionContext = createContext<ReduceMotionContextValue | null>(null);

export function ReduceMotionProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setState] = useState<boolean>(resolveInitialReduceMotion);
  const [source, setSource] = useState<ReduceMotionSource>(() => (readStoredChoice() === null ? "system" : "user"));

  // Mirror to the document so CSS (`html[data-reduce-motion="true"]`) and the bootstrap script agree.
  useEffect(() => {
    document.documentElement.setAttribute("data-reduce-motion", reduceMotion ? "true" : "false");
  }, [reduceMotion]);

  // Without a stored choice, follow OS changes made while the page is open.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCE_MOTION_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (readStoredChoice() === null) setState(event.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const setReduceMotion = useCallback((value: boolean) => {
    writeStoredChoice(value ? "on" : "off");
    setState(value);
    setSource("user");
  }, []);

  const toggle = useCallback(() => {
    const next = !reduceMotion;
    setReduceMotion(next);
    return next;
  }, [reduceMotion, setReduceMotion]);

  const value = useMemo<ReduceMotionContextValue>(
    () => ({ reduceMotion, source, toggle, setReduceMotion }),
    [reduceMotion, source, toggle, setReduceMotion],
  );

  return (
    <ReduceMotionContext.Provider value={value}>
      <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>{children}</MotionConfig>
    </ReduceMotionContext.Provider>
  );
}

export function useReduceMotion(): ReduceMotionContextValue {
  const value = useContext(ReduceMotionContext);
  if (value === null) throw new Error("useReduceMotion must be used inside <ReduceMotionProvider>");
  return value;
}
