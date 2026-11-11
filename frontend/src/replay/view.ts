import type { SampleCase, VersionEntry } from "../cases/model";
import { EVIDENCE_BY_ID } from "../content/evidence";
import type { EvidenceStatus, ReplayEvent } from "../data/types";
import { formatOffset, parseLocal } from "./format";
import { clampIndex } from "./replayMachine";

/**
 * The replay view (design: `view(state, case)`; Requirements 7.1, 7.5, 7.12, 22.2 to 22.4, 23.2). A pure function
 * of the index and the case: the displayed event, its timestamp, its version and clock reading, the ladder rung,
 * whether a Blind hunt's report is revealed yet, and the slider's `aria-valuetext`.
 *
 * Nothing here names the hidden issue before the reveal: the value text is built from the event number, the
 * evidence status and the clock reading only.
 */

export type ClockScope = "browser" | "server" | "none";

export interface ClockReadout {
  readonly scope: ClockScope;
  /** Short mono value: "2024-09-12T09:00Z, Pacific/Honolulu", "TZ=UTC · 2026-03-08", or "no clock set". */
  readonly value: string;
  /** Full words for the track chip and assistive text. */
  readonly label: string;
  /** True when the Crew set the browser clock for this event. */
  readonly controlled: boolean;
}

export interface ReplayView {
  readonly index: number;
  readonly total: number;
  readonly event: ReplayEvent;
  /** "t+00:12". */
  readonly timestamp: string;
  readonly version: VersionEntry | undefined;
  readonly clock: ClockReadout;
  readonly ladderRung: EvidenceStatus;
  /** Blind hunt: index >= revealIndex. Other modes: always true. */
  readonly revealed: boolean;
  readonly ariaValueText: string;
}

/** "2024-09-12T09:00:00.000Z" -> "2024-09-12T09:00Z" (seconds kept only when they are not zero). */
export function shortInstant(instant: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/.exec(instant);
  if (!m) return instant;
  return m[2] && m[2] !== "00" ? `${m[1]}:${m[2]}Z` : `${m[1]}Z`;
}

export function clockReadout(event: ReplayEvent): ClockReadout {
  const b = event.browserClock;
  if (b) {
    const value = `${shortInstant(b.instant)}, ${b.tz}`;
    return {
      scope: "browser",
      value,
      label: `${b.controlled ? "Browser clock controlled" : "Browser clock not controlled"}: ${value}`,
      controlled: b.controlled,
    };
  }
  const s = event.serverClock;
  if (s !== "not controlled") {
    return { scope: "server", value: `TZ=${s.tz} · ${s.dateUnderTest}`, label: `${s.label}, date under test ${s.dateUnderTest}`, controlled: false };
  }
  return { scope: "none", value: "no clock set", label: "No clock set for this event", controlled: false };
}

/** Index of the Blind hunt reveal event, or -1 when the case has none (Known issue, Open hunt). */
export function revealIndexOf(c: SampleCase): number {
  if (c.mode !== "blind-hunt") return -1;
  const byId = c.reveal ? c.stream.findIndex((e) => e.id === c.reveal?.eventId) : -1;
  return byId >= 0 ? byId : c.stream.findIndex((e) => e.kind === "reveal");
}

/** True when the hidden report may be shown at this index. A Blind hunt without a reveal event never reveals. */
export function isRevealed(c: SampleCase, index: number): boolean {
  if (c.mode !== "blind-hunt") return true;
  const at = revealIndexOf(c);
  return at >= 0 && clampIndex(index, c.stream.length) >= at;
}

/** Index of the first observed anomaly, or -1. */
export function anomalyIndexOf(stream: readonly ReplayEvent[]): number {
  return stream.findIndex((e) => e.status === "observed-anomaly");
}

function clockForValueText(clock: ClockReadout, event: ReplayEvent): string {
  if (clock.scope === "browser" && event.browserClock) {
    const local = parseLocal(event.browserClock.local);
    return local.time ? `, ${local.time.slice(0, 5)} ${local.offset}` : "";
  }
  if (clock.scope === "server") return `, ${clock.value}`;
  return "";
}

/** "Event 6 of 14: Observed anomaly, 23:00 UTC-10". */
export function ariaValueTextFor(event: ReplayEvent, index: number, total: number): string {
  const status = EVIDENCE_BY_ID[event.status]?.label ?? event.status;
  return `Event ${index + 1} of ${total}: ${status}${clockForValueText(clockReadout(event), event)}`;
}

export function replayView(c: SampleCase, rawIndex: number): ReplayView {
  const total = c.stream.length;
  const index = clampIndex(rawIndex, total);
  const event = c.stream[index] as ReplayEvent;
  return {
    index,
    total,
    event,
    timestamp: formatOffset(event.tOffsetMs),
    version: c.versions.find((v) => v.id === event.versionId),
    clock: clockReadout(event),
    ladderRung: event.status,
    revealed: isRevealed(c, index),
    ariaValueText: ariaValueTextFor(event, index, total),
  };
}
