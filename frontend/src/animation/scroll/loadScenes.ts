import type { ComponentType } from "react";
import { afterFirstPaint } from "./loadScroll";
import type { SceneScrubProps } from "./setupScenes";

/**
 * Loads the sticky-scene scrub (GSAP + ScrollTrigger) with a dynamic `import()` after first paint, like the thread's
 * `loadScroll()`. Rejects if the chunk cannot be loaded; the scene then stays in its static layout.
 */
export type SceneScrubDriverComponent = ComponentType<SceneScrubProps>;

let pending: Promise<SceneScrubDriverComponent> | null = null;

export function loadScenes(): Promise<SceneScrubDriverComponent> {
  pending ??= afterFirstPaint()
    .then(() => import("./setupScenes"))
    .then((m) => m.SceneScrubDriver)
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}
