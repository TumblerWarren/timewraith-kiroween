import type { DirectorClock } from "../animation/director/types";

/**
 * Deterministic clock for director and effect tests. Time moves only through `advance` / `advanceTo`;
 * due timers fire in time order (FIFO for equal times), including timers scheduled by earlier callbacks.
 */
export interface FakeClock extends DirectorClock {
  advance(ms: number): void;
  advanceTo(t: number): void;
  /** Fires every pending timer (bounded, in case callbacks keep scheduling). */
  runAll(maxSteps?: number): void;
  pending(): number;
}

export function createFakeClock(start = 0): FakeClock {
  let now = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; seq: number; fn: () => void }>();
  let seq = 0;

  const nextDue = (limit: number) => {
    let best: { id: number; at: number; seq: number } | null = null;
    for (const [id, t] of timers) {
      if (t.at > limit) continue;
      if (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq)) best = { id, at: t.at, seq: t.seq };
    }
    return best;
  };

  const clock: FakeClock = {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + Math.max(0, Number.isFinite(ms) ? ms : 0), seq: seq++, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advanceTo(t) {
      for (;;) {
        const due = nextDue(t);
        if (!due) break;
        const timer = timers.get(due.id);
        timers.delete(due.id);
        now = Math.max(now, due.at);
        timer?.fn();
      }
      now = Math.max(now, t);
    },
    advance(ms) {
      clock.advanceTo(now + Math.max(0, ms));
    },
    runAll(maxSteps = 10_000) {
      for (let i = 0; i < maxSteps && timers.size > 0; i++) {
        const due = nextDue(Number.POSITIVE_INFINITY);
        if (!due) break;
        clock.advanceTo(due.at);
      }
    },
    pending: () => timers.size,
  };
  return clock;
}

/** Lets pending promise callbacks (effect `finished` handlers) run. */
export async function flushMicrotasks(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
