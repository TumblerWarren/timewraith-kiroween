import type { ComponentType } from "react";
import type { ThreadScrollProps } from "./setupThread";

/**
 * Loads GSAP + ScrollTrigger and the thread's scroll sync with a dynamic `import()` after first paint
 * (two animation frames), so the scroll library never delays the first render (design "Stack").
 * Rejects if the chunk cannot be loaded; the ThreadLayer then draws the thread in full.
 */
export type ThreadScrollDriverComponent = ComponentType<ThreadScrollProps>;

export function afterFirstPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

let pending: Promise<ThreadScrollDriverComponent> | null = null;

export function loadScroll(): Promise<ThreadScrollDriverComponent> {
  pending ??= afterFirstPaint()
    .then(() => import("./setupThread"))
    .then((m) => m.ThreadScrollDriver)
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}
