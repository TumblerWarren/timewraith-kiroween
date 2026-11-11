import { inkPath, type InkPoint } from "../mascots/placeholder/inkPath";
import { clockHandAngles, formatClockTime } from "./clockAngles";

/**
 * The Clock: a hand-inked placeholder face plus SEPARATE SVG hands (Requirement 3.2, design "signature
 * moments"). The painted face art arrives in a later phase and replaces `.clock__face`; the hands stay
 * as they are, in their own `<svg>` stacked above the face, so the hand-entry animation can drive them.
 *
 * Hooks for the animation layer:
 * - each hand is a `<g data-clock-hand="hour|minute" id="{id}-hand-hour|minute">` that points straight up
 *   when un-rotated and rotates about the viewBox center (100,100); its resting angle is in `data-angle`
 *   and in its inline `transform`.
 * - the root carries `data-clock-time` ("HH:MM") and a stable `id`.
 * Pages with two Clocks pass distinct `id`s.
 */

export interface ClockProps {
  /** 24-hour reading. Defaults to 23:59 (the Hero). */
  readonly hours?: number;
  readonly minutes?: number;
  /** Stable id of the root; the hand ids derive from it. */
  readonly id?: string;
  readonly className?: string;
  /** Accessible name. Defaults to "Tower clock reading HH:MM". */
  readonly label?: string;
}

const C = 100;

/** Points on a circle, so the inked outline can be wobbled by `inkPath`. */
function ringPoints(cx: number, cy: number, r: number, n: number): InkPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
}

const polar = (r: number, deg: number): InkPoint => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};

/** The face never changes, so it is drawn once. */
const FACE = {
  shadow: inkPath(ringPoints(108, 108, 92, 14), { seed: 3, amp: 2.2 }),
  bezel: inkPath(ringPoints(C, C, 92, 14), { seed: 5, amp: 2.2 }),
  dial: inkPath(ringPoints(C, C, 72, 12), { seed: 9, amp: 1.8 }),
  ticks: Array.from({ length: 12 }, (_, i) => ({
    d: inkPath([polar(62, i * 30), polar(i % 3 === 0 ? 46 : 54, i * 30)], { seed: 20 + i, amp: 0.9, closed: false }),
    major: i % 3 === 0,
  })),
  rivets: [0, 90, 180, 270].map((deg) => polar(82, deg)),
  bat: inkPath(
    [
      [-14, 2, 1],
      [-8, -7],
      [-3, -2],
      [0, -5, 1],
      [3, -2],
      [8, -7],
      [14, 2, 1],
      [7, 0],
      [0, 7, 1],
      [-7, 0],
    ],
    { seed: 31, amp: 0.5 },
  ),
};

/** Hands point straight up from the center; the crooked corners are sharp points. */
const HOUR_HAND = inkPath(
  [
    [100, 52, 1],
    [108, 70, 1],
    [104, 76],
    [103, 114],
    [97, 114],
    [96, 76],
    [92, 70, 1],
  ],
  { seed: 41, amp: 0.5 },
);
const MINUTE_HAND = inkPath(
  [
    [100, 24, 1],
    [104, 42, 1],
    [103, 114],
    [97, 114],
    [96, 42, 1],
  ],
  { seed: 43, amp: 0.5 },
);

export function Clock({ hours = 23, minutes = 59, id = "clock", className, label }: ClockProps) {
  const time = formatClockTime(hours, minutes);
  const angles = clockHandAngles(hours, minutes);
  const hands = [
    { name: "hour", angle: angles.hour, d: HOUR_HAND, fill: "var(--pumpkin-600)" },
    { name: "minute", angle: angles.minute, d: MINUTE_HAND, fill: "var(--ink-900)" },
  ] as const;

  return (
    <div
      id={id}
      className={className ? `clock ${className}` : "clock"}
      role="img"
      aria-label={label ?? `Tower clock reading ${time}`}
      data-clock-time={time}
    >
      <svg className="clock__face" viewBox="0 0 200 200" width={200} height={200} focusable="false" aria-hidden="true">
        <path d={FACE.shadow} fill="var(--walnut-700)" />
        <path d={FACE.bezel} fill="var(--gold-500)" stroke="var(--ink-900)" strokeWidth={4} strokeLinejoin="round" />
        <path d={FACE.dial} fill="var(--paper-100)" stroke="var(--ink-900)" strokeWidth={3} strokeLinejoin="round" />
        {FACE.rivets.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4.5} fill="var(--pumpkin-600)" stroke="var(--ink-900)" strokeWidth={2} />
        ))}
        {FACE.ticks.map((t, i) => (
          <path
            key={i}
            d={t.d}
            fill="none"
            stroke="var(--ink-900)"
            strokeWidth={t.major ? 4 : 2.5}
            strokeLinecap="round"
          />
        ))}
        <g transform={`translate(${C} 134)`}>
          <path d={FACE.bat} fill="var(--walnut-700)" stroke="var(--ink-900)" strokeWidth={1.5} strokeLinejoin="round" />
        </g>
      </svg>
      <svg className="clock__hands" viewBox="0 0 200 200" width={200} height={200} focusable="false" aria-hidden="true">
        {hands.map((h) => (
          <g
            key={h.name}
            id={`${id}-hand-${h.name}`}
            className={`clock__hand clock__hand--${h.name}`}
            data-clock-hand={h.name}
            data-angle={h.angle}
            style={{ transform: `rotate(${h.angle}deg)` }}
          >
            <path d={h.d} fill={h.fill} stroke="var(--ink-900)" strokeWidth={3} strokeLinejoin="round" />
          </g>
        ))}
        <circle cx={C} cy={C} r={7} fill="var(--gold-500)" stroke="var(--ink-900)" strokeWidth={3} data-clock-hub="" />
      </svg>
    </div>
  );
}
