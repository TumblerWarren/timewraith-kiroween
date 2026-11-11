/**
 * Sprite strip timing (Requirement 4.4). A strip of `frames` images moves by `translateX(-100%)` with
 * `steps(frames)`; the default `jump-end` shows frames 0 to n-1 once each, so the loop takes n / fps seconds.
 */
export interface SpriteTiming {
  readonly steps: number;
  readonly durationMs: number;
}

export function spriteTiming(frames: number, fps: number): SpriteTiming {
  if (!Number.isInteger(frames) || frames < 1) throw new RangeError(`frames must be a positive integer, got ${frames}`);
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError(`fps must be > 0, got ${fps}`);
  return { steps: frames, durationMs: (frames / fps) * 1000 };
}

/**
 * Negative animation delay for one actor in a flock, so bats do not flap in unison. Deterministic per
 * index: spreads `index` over one loop with the golden-ratio step.
 */
export function flapDelayMs(index: number, timing: SpriteTiming): number {
  const phase = (Math.abs(index) * 0.6180339887) % 1;
  return -Math.round(phase * timing.durationMs);
}
