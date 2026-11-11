/** Small pure formatters for the Replay_Lab. Values are shown in JetBrains Mono (Requirement 7.11). */

/** "t+00:12" from milliseconds since replay start. */
export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `t+${mm}:${ss}`;
}

export interface LocalParts {
  readonly date: string;
  /** "HH:MM:SS" */
  readonly time: string;
  readonly hours: number;
  readonly minutes: number;
  /** "UTC-10" */
  readonly offset: string;
}

/** Splits a stream `local` value such as "2024-09-11 23:00:00 UTC-10". Falls back to zeros on a bad value. */
export function parseLocal(local: string): LocalParts {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}) (UTC[+-][\d:]+)$/.exec(local);
  if (!m) return { date: local, time: "", hours: 0, minutes: 0, offset: "" };
  return { date: m[1] as string, time: `${m[2]}:${m[3]}:${m[4]}`, hours: Number(m[2]), minutes: Number(m[3]), offset: m[5] as string };
}
