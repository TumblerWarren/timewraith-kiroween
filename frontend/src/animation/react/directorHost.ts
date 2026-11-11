import { createContext, useContext } from "react";
import { createActorRegistry, type ActorRegistry } from "../actors";
import { COMPACT_MAX_WIDTH_PX } from "../constants";
import { createAppDirector, type MotionDirector } from "../director";
import type { DirectorEnv, EnvPatch, RequestOptions, RequestResult } from "../director/types";
import { motionAnimator, type Animator } from "../effects/animator";
import type { EffectId, ParamsOf } from "../effects/ids";
import { createDomBatPool, createDomOverlayMarks, type DomBatPool, type DomOverlayMarks } from "./domServices";

/**
 * The app's single director, wrapped so React can use it safely (task 12.4).
 *
 * The host owns the stable services (actor registry, bat pool, overlay marks) and creates the `MotionDirector`
 * lazily on the first request. `stop()` (provider unmount) disposes it; the next request after a remount (React
 * StrictMode mounts twice in development) creates a fresh one with the last known environment. Child components
 * run their effects before the provider's, so lazy creation also lets them request on mount.
 */

export type RequestFn = <K extends EffectId>(id: K, params: ParamsOf<K>, opts?: RequestOptions) => RequestResult;

export interface DirectorHost {
  readonly actors: ActorRegistry;
  readonly bats: DomBatPool;
  readonly overlay: DomOverlayMarks;
  readonly animator: Animator;
  readonly request: RequestFn;
  setEnv(patch: EnvPatch): void;
  getEnv(): DirectorEnv;
  /** The live director, created on demand. */
  director(): MotionDirector;
  /** Disposes the current director (provider unmount). */
  stop(): void;
  /** Per-region latch for `useOnceOnEnter`: true the first time a key is claimed. */
  claimOnce(key: string): boolean;
}

export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH_PX}px)`;

function initialEnv(reducedMotion: boolean): EnvPatch {
  const hasDoc = typeof document !== "undefined";
  const compact = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COMPACT_QUERY).matches;
  return { reducedMotion, hidden: hasDoc && document.visibilityState === "hidden", compact, suppressed: { input: false, scrubber: false } };
}

export function createDirectorHost(opts: { reducedMotion: boolean; animator?: Animator }): DirectorHost {
  const actors = createActorRegistry();
  const bats = createDomBatPool();
  const overlay = createDomOverlayMarks();
  const animator = opts.animator ?? motionAnimator;
  let env: EnvPatch = initialEnv(opts.reducedMotion);
  let current: MotionDirector | null = null;
  const latches = new Set<string>();

  const director = (): MotionDirector => {
    if (current) return current;
    const d = createAppDirector({
      actors,
      bats,
      overlay,
      animator,
      root: typeof document !== "undefined" ? document.documentElement : null,
    });
    d.setEnv(env);
    current = d;
    return d;
  };

  const request: RequestFn = (id, params, o) => director().request(id, params, o);

  return {
    actors,
    bats,
    overlay,
    animator,
    request,
    setEnv(patch) {
      env = { ...env, ...patch, suppressed: { ...env.suppressed, ...patch.suppressed } };
      director().setEnv(patch);
    },
    getEnv: () => director().getEnv(),
    director,
    stop() {
      current?.dispose();
      current = null;
    },
    claimOnce(key) {
      if (latches.has(key)) return false;
      latches.add(key);
      return true;
    },
  };
}

export const DirectorContext = createContext<DirectorHost | null>(null);

/** The director host, or null outside a DirectorProvider (unit tests of single components). */
export function useDirectorHost(): DirectorHost | null {
  return useContext(DirectorContext);
}
