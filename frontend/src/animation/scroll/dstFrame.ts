/**
 * The Lost Hour scene's reading for a scroll progress (task 14.1). Pure.
 *
 * Progress 0..1 through the sticky track. The Clock reads 01:58, then 01:59, then jumps straight to 03:00: the hour
 * from 02:00 to 02:59 never exists, so no 02:xx reading is ever returned.
 */
export type DstPhase = "before" | "after";

export interface DstFrame {
  readonly hours: number;
  readonly minutes: number;
  /** "HH:MM". */
  readonly label: string;
  /** "after" once the jump has happened (the crack is open). */
  readonly phase: DstPhase;
}

/** Progress at which 01:58 turns to 01:59. */
export const DST_TICK_AT = 0.28;
/** Progress at which 01:59 jumps to 03:00. */
export const DST_JUMP_AT = 0.52;

const frame = (hours: number, minutes: number, phase: DstPhase): DstFrame => ({
  hours,
  minutes,
  label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  phase,
});

const F0158 = frame(1, 58, "before");
const F0159 = frame(1, 59, "before");
const F0300 = frame(3, 0, "after");

export function dstFrame(progress: number): DstFrame {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  if (p < DST_TICK_AT) return F0158;
  if (p < DST_JUMP_AT) return F0159;
  return F0300;
}

/** The static reading (Reduce Motion, no scroll driver): 01:59 with the crack drawn. */
export const DST_STATIC_FRAME = F0159;
