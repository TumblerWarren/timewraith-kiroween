import type { BrowserReplayEvent } from "../types";

/**
 * Mock_Event_Stream (Requirements 7.3, 16.5; design decision D1).
 *
 * A hand-authored, illustrative sample modelled on FullCalendar issue #7998, a time-zone
 * date-boundary case (not a DST case): local system zone Asia/Kolkata, calendar zone
 * Pacific/Honolulu, and the `nowIndicator` shows the wrong date. It is a Recorded replay of
 * sample data, not a real finding, and claims no new finding.
 *
 * 2024-09-12T09:00:00Z is 14:30 in Asia/Kolkata (UTC+5:30) and 2024-09-11 23:00 in
 * Pacific/Honolulu (UTC-10), so a calendar in Honolulu should show 2024-09-11 but shows 2024-09-12.
 * (The issue text states 22:00 for Honolulu, which does not match UTC-10 for 14:30 IST; this
 * sample uses 23:00.)
 *
 * Events e01 to e03 and e11 to e14 happen while the browser clock is not controlled; their
 * instant is the sample's recorded wall clock (2024-09-10T07:41:00Z plus the event offset).
 * Events e04 to e10 happen with the Crew controlling the browser clock. The server clock is
 * never controlled. Every event ran against @fullcalendar/core 6.1.10, the version named in the
 * report. Issue #7998 was still open and no FullCalendar release notes named it when this sample
 * was written, so there is no fixed-version event (decision D16).
 */
export const SYSTEM_ZONE = "Asia/Kolkata";
export const CALENDAR_ZONE = "Pacific/Honolulu";
export const CONTROLLED_INSTANT = "2024-09-12T09:00:00.000Z";
/** The only version of this case: @fullcalendar/core 6.1.10, from the public report. */
export const FC_VERSION_ID = "fc-6.1.10";

const NOT_CONTROLLED = "not controlled" as const;

export const FULLCALENDAR_STREAM: readonly BrowserReplayEvent[] = [
  {
    id: "e01",
    seq: 0,
    tOffsetMs: 0,
    actor: "wraith-director",
    kind: "plan",
    text: "Plan: compare the calendar's current date in Pacific/Honolulu with the expected date.",
    status: "planned",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-10T07:41:00.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-09 21:41:00 UTC-10",
      controlled: false,
    },
    serverClock: NOT_CONTROLLED,
  },
  {
    id: "e02",
    seq: 1,
    tOffsetMs: 1000,
    actor: "watchtower-warden",
    kind: "dispatch",
    text: "Dispatch: 1 experiment. The browser clock will be set by the Crew; the server clock is not controlled.",
    status: "planned",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-10T07:41:01.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-09 21:41:01 UTC-10",
      controlled: false,
    },
    serverClock: NOT_CONTROLLED,
  },
  {
    id: "e03",
    seq: 2,
    tOffsetMs: 3000,
    actor: "bat-scout",
    kind: "explore",
    text: "Route found: the timeGridWeek view with nowIndicator.",
    status: "planned",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-10T07:41:03.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-09 21:41:03 UTC-10",
      controlled: false,
    },
    serverClock: NOT_CONTROLLED,
  },
  {
    id: "e04",
    seq: 3,
    tOffsetMs: 5000,
    actor: "pumpkin-mechanic",
    kind: "clock",
    text: "Browser clock controlled: set to 2024-09-12T09:00:00Z before the page loads.",
    status: "planned",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: CONTROLLED_INSTANT,
      tz: CALENDAR_ZONE,
      local: "2024-09-11 23:00:00 UTC-10",
      controlled: true,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Browser clock instant", observed: "2024-09-12T09:00:00Z" },
  },
  {
    id: "e05",
    seq: 4,
    tOffsetMs: 6000,
    actor: "pumpkin-mechanic",
    kind: "step",
    text: "Browser clock controlled. System zone Asia/Kolkata (UTC+5:30), calendar zone Pacific/Honolulu (UTC-10).",
    status: "planned",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: CONTROLLED_INSTANT,
      tz: CALENDAR_ZONE,
      local: "2024-09-11 23:00:00 UTC-10",
      controlled: true,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Zones", expected: "Pacific/Honolulu", observed: "Asia/Kolkata system zone" },
  },
  {
    id: "e06",
    seq: 5,
    tOffsetMs: 9000,
    actor: "pumpkin-mechanic",
    kind: "observe",
    text: "Browser clock controlled. Read the header date: observed 2024-09-12, expected 2024-09-11.",
    status: "observed-anomaly",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-12T09:00:01.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-11 23:00:01 UTC-10",
      controlled: true,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Header date", expected: "2024-09-11", observed: "2024-09-12" },
  },
  {
    id: "e07",
    seq: 6,
    tOffsetMs: 10000,
    actor: "bat-scout",
    kind: "observe",
    text: "Browser clock controlled. Observed anomaly: the header date is one day ahead.",
    status: "observed-anomaly",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-12T09:00:01.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-11 23:00:01 UTC-10",
      controlled: true,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Date offset", expected: "0 days", observed: "+1 day" },
  },
  {
    id: "e08",
    seq: 7,
    tOffsetMs: 12000,
    actor: "spider-weaver",
    kind: "note",
    text: "Browser clock controlled. Trace recorded (14 steps).",
    status: "observed-anomaly",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-12T09:00:02.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-11 23:00:02 UTC-10",
      controlled: true,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Trace steps", observed: "14" },
  },
  {
    id: "e09",
    seq: 8,
    tOffsetMs: 15000,
    actor: "pumpkin-mechanic",
    kind: "repeat",
    text: "Browser clock controlled. Repeat 2 of 3: same mismatch.",
    status: "observed-anomaly",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-12T09:00:01.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-11 23:00:01 UTC-10",
      controlled: true,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Header date", expected: "2024-09-11", observed: "2024-09-12" },
  },
  {
    id: "e10",
    seq: 9,
    tOffsetMs: 19000,
    actor: "pumpkin-mechanic",
    kind: "repeat",
    text: "Browser clock controlled. Repeat 3 of 3: same mismatch.",
    status: "observed-anomaly",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-12T09:00:01.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-11 23:00:01 UTC-10",
      controlled: true,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Header date", expected: "2024-09-11", observed: "2024-09-12" },
  },
  {
    id: "e11",
    seq: 10,
    tOffsetMs: 20000,
    actor: "raven-archivist",
    kind: "verify",
    text: "Reproduced in 3 of 3 attempts.",
    status: "reproduced",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-10T07:41:20.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-09 21:41:20 UTC-10",
      controlled: false,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Attempts reproduced", observed: "3 of 3" },
  },
  {
    id: "e12",
    seq: 11,
    tOffsetMs: 22000,
    actor: "raven-archivist",
    kind: "verify",
    text: "Matches published issue #7998, the source of this sample scenario.",
    status: "known-issue-match",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-10T07:41:22.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-09 21:41:22 UTC-10",
      controlled: false,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Known issue", observed: "fullcalendar/fullcalendar#7998" },
  },
  {
    id: "e13",
    seq: 12,
    tOffsetMs: 24000,
    actor: "raven-archivist",
    kind: "note",
    text: "Fixed-version check not run in this sample: no fixed release identified.",
    status: "known-issue-match",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-10T07:41:24.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-09 21:41:24 UTC-10",
      controlled: false,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Fixed-version check", observed: "not run" },
  },
  {
    id: "e14",
    seq: 13,
    tOffsetMs: 27000,
    actor: "doctor-stitch",
    kind: "fix",
    text: "Suggested fix drafted with a regression test; not verified.",
    status: "known-issue-match",
    versionId: FC_VERSION_ID,
    browserClock: {
      instant: "2024-09-10T07:41:27.000Z",
      tz: CALENDAR_ZONE,
      local: "2024-09-09 21:41:27 UTC-10",
      controlled: false,
    },
    serverClock: NOT_CONTROLLED,
    evidence: { label: "Suggested fix", observed: "not verified" },
  },
];
