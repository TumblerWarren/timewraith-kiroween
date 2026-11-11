/**
 * Replay state machine (design: Case view, "State machine"; Requirements 7.5 to 7.8, 7.13, 15.4).
 *
 * The scrubber works in event-index space: events are equally spaced, so clustered events stay easy to hit.
 * Every action is a pure function of the state and the event count `n`; the index is always an integer in
 * [0, n - 1] (Property 8), whatever number a pointer, a key or a caller hands in.
 */
export interface ReplayState {
  readonly index: number;
  readonly playing: boolean;
}

export type ReplayAction =
  /** Any number, including NaN and +-Infinity. */
  | { readonly type: "seek"; readonly value: number }
  /** Pointer position 0..1 along the track (clamped too). */
  | { readonly type: "fraction"; readonly f: number }
  | { readonly type: "step"; readonly dir: 1 | -1 }
  | { readonly type: "first" }
  | { readonly type: "last" }
  | { readonly type: "play" }
  | { readonly type: "pause" }
  /** One Play step (every PLAY_STEP_MS while playing). */
  | { readonly type: "tick" };

/** Play is user-started only and steps this often (design: "Play steps every 1400 ms"). */
export const PLAY_STEP_MS = 1400;

export const INITIAL_REPLAY_STATE: ReplayState = { index: 0, playing: false };

/** An integer in [0, n - 1]; NaN maps to 0. `n` below 1 is treated as 1. */
export function clampIndex(v: number, n: number): number {
  const max = Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)) - 1;
  if (Number.isNaN(v)) return 0;
  return Math.min(Math.max(Math.round(v), 0), max);
}

/** Pointer fraction (0 = first peg, 1 = last peg) to the nearest event index. Monotone non-decreasing in `f`. */
export function fractionToIndex(f: number, n: number): number {
  if (Number.isNaN(f)) return 0;
  const clamped = Math.min(Math.max(f, 0), 1);
  return clampIndex(clamped * (Math.max(1, n) - 1), n);
}

/** Where index `i` sits along the track, 0 to 1. */
export function indexToFraction(i: number, n: number): number {
  return n > 1 ? clampIndex(i, n) / (n - 1) : 0;
}

export function stepIndex(i: number, dir: 1 | -1, n: number): number {
  return clampIndex(clampIndex(i, n) + dir, n);
}

/** The reducer. `n` is the event count of the selected case. */
export function reduceReplay(state: ReplayState, action: ReplayAction, n: number): ReplayState {
  const index = clampIndex(state.index, n);
  const last = clampIndex(Infinity, n);
  switch (action.type) {
    case "seek":
      return { index: clampIndex(action.value, n), playing: false };
    case "fraction":
      return { index: fractionToIndex(action.f, n), playing: false };
    case "step":
      return { index: stepIndex(index, action.dir, n), playing: false };
    case "first":
      return { index: 0, playing: false };
    case "last":
      return { index: last, playing: false };
    case "play":
      // From the last event, Play starts over at the first.
      if (last === 0) return { index: 0, playing: false };
      return { index: index >= last ? 0 : index, playing: true };
    case "pause":
      return { index, playing: false };
    case "tick": {
      if (!state.playing) return { index, playing: false };
      const next = stepIndex(index, 1, n);
      return { index: next, playing: next < last };
    }
    default:
      return state;
  }
}

/**
 * Key map (design): ArrowRight and ArrowUp step +1, ArrowLeft and ArrowDown step -1, Home first, End last.
 * Any other key returns null and must leave the state unchanged.
 */
export function keyAction(key: string): ReplayAction | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return { type: "step", dir: 1 };
    case "ArrowLeft":
    case "ArrowDown":
      return { type: "step", dir: -1 };
    case "Home":
      return { type: "first" };
    case "End":
      return { type: "last" };
    default:
      return null;
  }
}

/** The Previous and Next buttons dispatch exactly the arrow keys' actions. */
export const PREV_ACTION: ReplayAction = { type: "step", dir: -1 };
export const NEXT_ACTION: ReplayAction = { type: "step", dir: 1 };
