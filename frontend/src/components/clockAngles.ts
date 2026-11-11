/**
 * Pure hand geometry for the Clock. Angles are degrees clockwise from 12 o'clock.
 * The hour hand moves half a degree per minute, so `minute === (hour % 30) * 12` always holds.
 */
export interface ClockHandAngles {
  readonly hour: number;
  readonly minute: number;
}

export function clockHandAngles(hours: number, minutes: number): ClockHandAngles {
  const h = ((hours % 12) + 12) % 12;
  const m = ((minutes % 60) + 60) % 60;
  return { hour: h * 30 + m * 0.5, minute: m * 6 };
}

export function formatClockTime(hours: number, minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}`;
}
