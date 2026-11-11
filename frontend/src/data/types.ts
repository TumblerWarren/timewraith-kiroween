import type { EvidenceStatusId } from "../content/evidence";

/** Ladder state after an event (design: Mock_Event_Stream schema). */
export type EvidenceStatus = EvidenceStatusId;

export type ReplayActor =
  | "wraith-director"
  | "watchtower-warden"
  | "bat-scout"
  | "pumpkin-mechanic"
  | "spider-weaver"
  | "raven-archivist"
  | "two-faced-jack"
  | "doctor-stitch";

export type ReplayEventKind =
  | "plan"
  | "dispatch"
  | "explore"
  | "clock"
  | "step"
  | "observe"
  | "repeat"
  | "verify"
  | "note"
  | "reveal"
  | "fix"
  | "compare";

export interface BrowserClockReading {
  /** ISO-8601 UTC instant, e.g. "2024-09-12T09:00:00.000Z". */
  readonly instant: string;
  /** IANA zone of the calendar under test. */
  readonly tz: string;
  /** The instant formatted in `tz`, e.g. "2024-09-11 23:00:00 UTC-10". */
  readonly local: string;
  /** True when the Crew set the browser clock; the event text then says "Browser clock controlled". */
  readonly controlled: boolean;
}

/** A server-side time setting (Requirement 26.5, 26.6). Events with one never say "Browser clock controlled". */
export interface ServerClockReading {
  /** Server process time zone, e.g. "UTC". */
  readonly tz: string;
  /** TZ env of the server, or a unit-level call with a fixed date. */
  readonly method: "server-tz" | "unit-test";
  /** ISO date the code was asked about, e.g. "2026-03-08". */
  readonly dateUnderTest: string;
  /** "Server time zone set: TZ=UTC; unit-level test of processWorkingHours". */
  readonly label: string;
}

export interface ReplayEvidence {
  readonly label: string;
  readonly expected?: string;
  readonly observed?: string;
}

/** A version check result recorded by a `verify` or `compare` event. */
export interface ReplayCheck {
  readonly versionId: string;
  readonly result: "fails" | "passes" | "inconclusive";
}

export interface ReplayEvent {
  /** "e01".."e20". */
  readonly id: string;
  /** Equals the array index. */
  readonly seq: number;
  /** Milliseconds since replay start, strictly increasing. */
  readonly tOffsetMs: number;
  readonly actor: ReplayActor;
  readonly kind: ReplayEventKind;
  /** Announced through the live region. */
  readonly text: string;
  /** Ladder state after this event; the rank never decreases. */
  readonly status: EvidenceStatus;
  /** Id of an entry in the case's versions list (the version and clock track). */
  readonly versionId: string;
  /** Null when the event does not use a browser (server-side cases). */
  readonly browserClock: BrowserClockReading | null;
  readonly serverClock: "not controlled" | ServerClockReading;
  readonly evidence?: ReplayEvidence;
  /** Only on kind "verify" or "compare". */
  readonly check?: ReplayCheck;
}

/** A browser-side event (the FullCalendar sample): the browser clock is always read, the server clock never set. */
export interface BrowserReplayEvent extends ReplayEvent {
  readonly browserClock: BrowserClockReading;
  readonly serverClock: "not controlled";
}

/** One simulated check in the Setup_Checklist (Requirements 6.2, 6.3). */
export type SetupStateId = "ready" | "waiting" | "attention";

export interface SetupState {
  readonly id: SetupStateId;
  /** Shape id, distinct per state, so status is never color-only. */
  readonly shape: "check" | "hourglass" | "exclamation";
  /** Glyph shown before the text. */
  readonly glyph: string;
  /** Full status string. Always contains "simulated". */
  readonly text: string;
}

export interface SetupCheck {
  readonly id: string;
  readonly label: string;
  readonly state: SetupStateId;
}
