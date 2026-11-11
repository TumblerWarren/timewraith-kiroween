import { useSyncExternalStore } from "react";
import { COMPACT_QUERY } from "./directorHost";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const q = window.matchMedia(COMPACT_QUERY);
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COMPACT_QUERY).matches;
}

/** True below 768 px (the director's `compact`); follows resizes. */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
