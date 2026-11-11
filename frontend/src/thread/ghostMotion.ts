import type { ThreadModel } from "./geometry";

/**
 * Mini Ghost companion maths (pure). The ghost travels beside the thread: its viewport y is a spring chasing a
 * band target (60% of the viewport, leaning ahead of the scroll direction, always inside 20% to 82%), its x is the
 * thread's x at the page y it is level with, plus an offset, so the thread visibly leads it.
 */

export const GHOST_BAND = { rest: 0.6, top: 0.2, bottom: 0.82 } as const;
export const GHOST_OFFSET_PX = { regular: 40, compact: 22 } as const;
export const GHOST_COMPACT_X = { min: 28, max: 60 } as const;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** How far ahead of the scroll direction the ghost drifts, px. */
export function ghostLean(scrollVelocity: number): number {
  return clamp(scrollVelocity * 0.03, -70, 70);
}

/** Target viewport y of the ghost for a viewport height and scroll velocity (px/s, down is positive). */
export function ghostTargetY(viewportH: number, scrollVelocity: number): number {
  return clamp(GHOST_BAND.rest * viewportH + ghostLean(scrollVelocity), GHOST_BAND.top * viewportH, GHOST_BAND.bottom * viewportH);
}

/** Squash and stretch for a speed (px/s): taller and thinner the faster it moves, volume kept. */
export function ghostSquash(velocity: number): { readonly sx: number; readonly sy: number } {
  const sy = 1 + clamp(Math.abs(velocity) / 2600, 0, 0.2);
  return { sx: 1 / Math.sqrt(sy), sy };
}

/** Tilt toward the direction of travel, in degrees (smaller on compact). */
export function ghostTilt(velocity: number, compact: boolean): number {
  const max = compact ? 6 : 12;
  return clamp(velocity * 0.012, -max, max);
}

/** Skew of the hem: it lags behind the direction of travel. */
export function hemSkew(velocity: number): number {
  return clamp(-velocity * 0.006, -14, 14);
}

/** Pupil offset in px, up to `max`, from the scroll direction (y) and the direction of the next node (x, y). */
export function ghostLook(scrollVelocity: number, toNode: { readonly dx: number; readonly dy: number } | null, max = 3): { readonly x: number; readonly y: number } {
  const fast = clamp(scrollVelocity / 700, -1, 1);
  const nx = toNode ? clamp(toNode.dx / 220, -1, 1) : 0;
  const ny = toNode ? clamp(toNode.dy / 400, -1, 1) : 0;
  return {
    x: Math.round(clamp(nx * 0.8, -1, 1) * max * 10) / 10,
    y: Math.round(clamp(fast * 0.9 + ny * 0.5, -1, 1) * max * 10) / 10,
  };
}

export interface CompanionInput {
  readonly model: ThreadModel;
  /** Spring value: the ghost's viewport y. */
  readonly viewportY: number;
  readonly scrollY: number;
  readonly mainLeft: number;
  readonly mainTop: number;
  readonly compact: boolean;
}

/** Viewport point of the ghost. y is the spring value, so it is always where the spring says; x follows the thread. */
export function companionPoint({ model, viewportY, scrollY, mainLeft, mainTop, compact }: CompanionInput): { readonly x: number; readonly y: number } | null {
  const first = model.samples[0];
  const last = model.samples[model.samples.length - 1];
  if (!first || !last) return null;
  const pageY = clamp(scrollY + viewportY - mainTop, first.y, last.y);
  const threadX = mainLeft + model.atY(pageY).x;
  if (compact) return { x: clamp(threadX + GHOST_OFFSET_PX.compact, GHOST_COMPACT_X.min, GHOST_COMPACT_X.max), y: viewportY };
  return { x: threadX + GHOST_OFFSET_PX.regular, y: viewportY };
}
