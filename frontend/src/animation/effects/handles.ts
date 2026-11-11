import type { DirectorClock, EffectHandle, FinishStatus } from "../director/types";
import type { Animation } from "./animator";

/** A handle that has already completed (stub effects, effects with nothing to animate). */
export function completedHandle(): EffectHandle {
  return { cancel() {}, pause() {}, resume() {}, finished: Promise.resolve("completed") };
}

export interface RunBuilder {
  readonly handle: EffectHandle;
  /** True once the run completed or was cancelled. */
  readonly done: boolean;
  /** Tracks an animation; the run completes after every tracked piece. */
  track(anim: Animation): Animation;
  /** Tracks a promise (for example an actor's `play`). */
  wait(p: Promise<unknown> | void): void;
  /** Runs `fn` after `ms` on the director clock, unless the run was cancelled. */
  after(ms: number, fn: () => void): void;
  /** Call after scheduling everything; the run completes when the pending count reaches zero. */
  seal(): EffectHandle;
}

/**
 * Collects the animations, promises and timers of one effect run into a single `EffectHandle`.
 * Timers use the director clock, so effects stay deterministic under the fake clock.
 */
export function createRun(clock: DirectorClock, onCancel?: () => void): RunBuilder {
  let pending = 0;
  let sealed = false;
  let done = false;
  let resolve!: (s: FinishStatus) => void;
  const finished = new Promise<FinishStatus>((r) => (resolve = r));
  const anims = new Set<Animation>();
  const timers = new Set<number>();

  const end = (s: FinishStatus) => {
    if (done) return;
    done = true;
    resolve(s);
  };
  const release = () => {
    pending--;
    if (sealed && pending <= 0) end("completed");
  };

  const handle: EffectHandle = {
    cancel() {
      if (done) return;
      for (const a of anims) a.stop();
      for (const t of timers) clock.clearTimeout(t);
      anims.clear();
      timers.clear();
      try {
        onCancel?.();
      } finally {
        end("cancelled");
      }
    },
    pause() {
      for (const a of anims) a.pause();
    },
    resume() {
      for (const a of anims) a.play();
    },
    finished,
  };

  return {
    handle,
    get done() {
      return done;
    },
    track(anim) {
      pending++;
      anims.add(anim);
      anim.finished.then(
        () => {
          anims.delete(anim);
          release();
        },
        () => {
          anims.delete(anim);
          release();
        },
      );
      return anim;
    },
    wait(p) {
      if (!p) return;
      pending++;
      p.then(release, release);
    },
    after(ms, fn) {
      pending++;
      const id = clock.setTimeout(() => {
        timers.delete(id);
        if (!done) {
          try {
            fn();
          } catch {
            // An effect step failing must not stall the run; the director settles on watchdog.
          }
        }
        release();
      }, Math.max(0, ms));
      timers.add(id);
    },
    seal() {
      sealed = true;
      if (pending <= 0) end("completed");
      return handle;
    },
  };
}
