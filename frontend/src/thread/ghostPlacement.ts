import type { ThreadModel } from "./geometry";

/**
 * Mini Ghost placement (design "Mini Ghost", Property 17). Pure.
 *
 * Coordinates: `smoothY` and the model are in `<main>` coordinates (the ThreadLayer's SVG space);
 * `mainLeft` is main's left edge in the viewport and `mainTop` its top edge in page coordinates.
 * The result is a viewport point for the fixed Overlay_Layer.
 *
 * - Motion on: y follows the smoothed lead line, clamped to the thread's y range, and x is the thread's x at that y,
 *   so the ghost always sits on the thread.
 * - Reduce Motion: the ghost stays at the first node (Open a case) and the lead line is ignored.
 */
export interface GhostInput {
  readonly model: ThreadModel;
  readonly smoothY: number;
  readonly scrollY: number;
  readonly mainLeft: number;
  readonly mainTop: number;
  readonly reduceMotion: boolean;
}

export interface GhostPoint {
  readonly x: number;
  readonly y: number;
}

export function ghostPlacement({ model, smoothY, scrollY, mainLeft, mainTop, reduceMotion }: GhostInput): GhostPoint | null {
  const first = model.samples[0];
  const last = model.samples[model.samples.length - 1];
  if (!first || !last) return null;
  const y = reduceMotion || !Number.isFinite(smoothY) ? first.y : Math.min(last.y, Math.max(first.y, smoothY));
  const s = reduceMotion ? first : model.atY(y);
  return { x: mainLeft + s.x, y: mainTop + y - scrollY };
}
