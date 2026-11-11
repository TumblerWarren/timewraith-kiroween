import { EFFECTS } from "../effects/registry";
import type { EffectServices } from "../services";
import { createBrowserClock } from "./clock";
import { MotionDirector } from "./director";
import type { DirectorClock, DirectorConfig } from "./types";

export { MotionDirector, DEFAULT_CONFIG, DEFAULT_ENV } from "./director";
export { createBrowserClock } from "./clock";
export type * from "./types";

/** The app's director: the full registry, the browser clock, dev logging in dev builds. */
export function createAppDirector(
  services?: Partial<EffectServices>,
  opts?: { clock?: DirectorClock; config?: Partial<DirectorConfig> },
): MotionDirector {
  return new MotionDirector(EFFECTS, opts?.clock ?? createBrowserClock(), { dev: import.meta.env.DEV, ...opts?.config }, services);
}
