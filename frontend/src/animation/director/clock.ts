import type { DirectorClock } from "./types";

/** The real clock: `performance.now()` and window timers. Tests inject `test/fakeClock.ts` instead. */
export function createBrowserClock(): DirectorClock {
  const perf = globalThis.performance;
  return {
    now: () => (perf ? perf.now() : Date.now()),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => globalThis.clearTimeout(id),
  };
}
