import type { EvidenceShapeId } from "../content/evidence";
import { inkPath, type InkPoint } from "../mascots/placeholder/inkPath";

/**
 * One hand-inked shape per evidence status, so status is never color-only (Requirement 8.6):
 * dashed circle, triangle, square with a crack, diamond, hexagon with a check, dotted octagon with "?".
 * Fills are sage-700 or brick-700 only, and the marks inside them are paper-100 (5.17 / 6.29). Strokes are
 * ink-900. All shapes share one 48 x 48 box so a row of them lines up.
 */

const INK = "var(--ink-900)";
const PAPER = "var(--paper-100)";
const SAGE = "var(--sage-700)";
const BRICK = "var(--brick-700)";

const ring = (cx: number, cy: number, r: number, n: number): InkPoint[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });

/** Corner points stay sharp so the outline reads as a cut shape, with a little crooked wobble. */
const corners = (pts: readonly (readonly [number, number])[]): InkPoint[] => pts.map(([x, y]) => [x, y, 1] as const);

const PATHS = {
  circle: inkPath(ring(24, 24, 17, 10), { seed: 71, amp: 1.2 }),
  triangle: inkPath(corners([[24, 6], [43, 40], [5, 41]]), { seed: 72, amp: 1.4 }),
  square: inkPath(corners([[8, 9], [40, 7], [41, 40], [7, 41]]), { seed: 73, amp: 1 }),
  diamond: inkPath(corners([[24, 4], [43, 24], [25, 44], [5, 23]]), { seed: 74, amp: 1.2 }),
  hexagon: inkPath(corners([[24, 4], [41, 14], [41, 34], [24, 44], [7, 34], [7, 14]]), { seed: 75, amp: 1 }),
  octagon: inkPath(corners([[17, 5], [31, 5], [43, 17], [43, 31], [31, 43], [17, 43], [5, 31], [5, 17]]), { seed: 76, amp: 1 }),
  crack: inkPath(
    [
      [28, 9],
      [22, 20],
      [30, 27],
      [21, 38],
    ],
    { seed: 77, amp: 0.8, closed: false },
  ),
  bang: inkPath(
    [
      [24, 16],
      [24.6, 28],
    ],
    { seed: 78, amp: 0.4, closed: false },
  ),
  check: inkPath(
    [
      [15, 24],
      [21, 31],
      [33, 16],
    ],
    { seed: 79, amp: 0.6, closed: false },
  ),
  question: "M18 19 C18 11 30 11 30 19 C30 25 24 25 24 31",
  /** Rungs 4: a small "#" mark in the diamond (the issue number). */
  hashA: inkPath(
    [
      [20, 17],
      [18, 31],
    ],
    { seed: 80, amp: 0.4, closed: false },
  ),
  hashB: inkPath(
    [
      [29, 17],
      [27, 31],
    ],
    { seed: 81, amp: 0.4, closed: false },
  ),
  hashC: inkPath(
    [
      [15, 21],
      [33, 20],
    ],
    { seed: 82, amp: 0.4, closed: false },
  ),
  hashD: inkPath(
    [
      [14, 28],
      [32, 27],
    ],
    { seed: 83, amp: 0.4, closed: false },
  ),
};

const mark = { fill: "none", stroke: PAPER, strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const outline = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" } as const;

export interface EvidenceShapeProps {
  readonly shape: EvidenceShapeId;
  /** Rendered size in CSS px (the box is square). */
  readonly size?: number;
  /** Outline-only (not reached yet) instead of the filled state. */
  readonly hollow?: boolean;
  readonly className?: string;
}

/** Decorative: the status name is always printed next to the shape. */
export function EvidenceShape({ shape, size = 40, hollow = false, className }: EvidenceShapeProps) {
  const fill = (color: string) => (hollow ? "none" : color);
  return (
    <svg
      className={className ? `evidence-shape ${className}` : "evidence-shape"}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      focusable="false"
      aria-hidden="true"
      data-shape={shape}
    >
      {shape === "dashed-circle" ? (
        <path d={PATHS.circle} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeDasharray="6 5" />
      ) : null}

      {shape === "triangle" ? (
        <>
          <path d={PATHS.triangle} fill={fill(BRICK)} {...outline} />
          {hollow ? null : <path d={PATHS.bang} {...mark} />}
          {hollow ? null : <circle cx={24.6} cy={34} r={2.1} fill={PAPER} />}
        </>
      ) : null}

      {shape === "cracked-square" ? (
        <>
          <path d={PATHS.square} fill={fill(BRICK)} {...outline} />
          <path d={PATHS.crack} {...(hollow ? { ...mark, stroke: INK } : mark)} />
        </>
      ) : null}

      {shape === "diamond" ? (
        <>
          <path d={PATHS.diamond} fill={fill(SAGE)} {...outline} />
          {[PATHS.hashA, PATHS.hashB, PATHS.hashC, PATHS.hashD].map((d) => (
            <path key={d} d={d} {...(hollow ? { ...mark, stroke: INK, strokeWidth: 2.4 } : { ...mark, strokeWidth: 2.4 })} />
          ))}
        </>
      ) : null}

      {shape === "hexagon-check" ? (
        <>
          <path d={PATHS.hexagon} fill={fill(SAGE)} {...outline} />
          <path d={PATHS.check} {...(hollow ? { ...mark, stroke: INK } : mark)} />
        </>
      ) : null}

      {shape === "dotted-octagon-question" ? (
        <>
          <path d={PATHS.octagon} fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" strokeDasharray="0.5 5.5" />
          <path d={PATHS.question} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <circle cx={24} cy={36} r={2.2} fill={INK} />
        </>
      ) : null}
    </svg>
  );
}
