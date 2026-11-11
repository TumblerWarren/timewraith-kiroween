import type { SampleCase } from "../../cases/model";
import { LINKS } from "../../config/links";
import { CALCOM_REPLAY_LABEL, ILLUSTRATIVE_REPLAY } from "../../content/copy";
import { CAL_AFFECTED, CAL_PATCHED, CALCOM_STREAM } from "./calcom-30021.stream";

/**
 * Cal.com Blind hunt sample (Requirements 23, 24, 26.2 to 26.5, 16.6, 16.9). Modelled on a public third-party
 * report of a server-side DST failure in `processWorkingHours`. Before the reveal event (e12) the board shows only
 * the target-based `hiddenTitle`; the issue label, link and number belong to the reveal.
 *
 * Both pins are illustrative (no commit hash is shown). The passing check runs on the fix described in the report
 * (`cal-patched`, `includesSuggestedFix: false`), so Doctor Stitch's own suggestion stays "not verified".
 * The diffs are written from the report's description, not copied from Cal.com's source.
 */
export const CALCOM_CASE_ID = "calcom-30021";
export const CALCOM_HIDDEN_TITLE = "cal.com: booking availability around DST";

export const CALCOM_CASE: SampleCase = {
  kind: "sample",
  id: CALCOM_CASE_ID,
  mode: "blind-hunt",
  target: {
    kind: "repository",
    repoUrl: "https://github.com/calcom/cal.com",
    version: { kind: "ref", value: "illustrative pin before the fix" },
  },
  area: "booking availability around DST",
  title: "Cal.com #30021: availability shifts by an hour on a DST day",
  hiddenTitle: CALCOM_HIDDEN_TITLE,
  issue: { href: LINKS.issue30021.href, label: "Cal.com #30021", source: "third-party-report" },
  sampleLabel: CALCOM_REPLAY_LABEL,
  replayModeLabel: ILLUSTRATIVE_REPLAY,
  versions: [
    {
      id: CAL_AFFECTED,
      label: "cal.com before the fix",
      role: "affected",
      source: "illustrative-pin",
      result: "fails",
      includesSuggestedFix: false,
    },
    {
      id: CAL_PATCHED,
      label: "same pin + the report's fix",
      role: "patched",
      source: "illustrative-pin",
      result: "passes",
      includesSuggestedFix: false,
    },
  ],
  stream: CALCOM_STREAM,
  reveal: { eventId: "e12", outcome: "match" },
  // The issue date is shown only from the reveal (e12). The pins are illustrative, so "released" has no date.
  // The fixed-version milestone names the fix described in the report, not Doctor Stitch's patch.
  timeline: [
    { kind: "released", label: "Version before the fix", versionId: CAL_AFFECTED, date: null, eventId: null, illustrativePin: true },
    {
      kind: "reported",
      label: "Cal.com #30021 reported",
      versionId: CAL_AFFECTED,
      date: { value: "2026-08-21", source: "issue-tracker", href: LINKS.issue30021.href },
      eventId: null,
      illustrativePin: false,
    },
    { kind: "reproduced", label: "Reproduced on the affected version", versionId: CAL_AFFECTED, date: null, eventId: "e11", illustrativePin: false },
    { kind: "fix-suggested", label: "Fix suggested", versionId: CAL_AFFECTED, date: null, eventId: "e13", illustrativePin: false },
    { kind: "fixed-verified", label: "Fixed version verified", versionId: CAL_PATCHED, date: null, eventId: "e15", illustrativePin: false },
  ],
  timeControl:
    "The browser clock cannot reach this bug: availability is computed on the server. Server time zone set to UTC, and the dates were passed to a unit-level test of processWorkingHours.",
  fix: {
    author: "doctor-stitch",
    summary: "Probe the zone offset with a 24-hour start time, so an afternoon start is probed on the correct side of the transition.",
    change: {
      file: "packages/features/schedules/lib/date-ranges.ts (illustrative)",
      lines: [
        { type: "context", text: "// processWorkingHours: find the zone offset that applies at the start time" },
        { type: "remove", text: 'const probe = timestampAt(date, startTime, { hourCycle: "h12" }); // 13:00 probed as 01:00' },
        { type: "add", text: 'const probe = timestampAt(date, startTime, { hourCycle: "h23" }); // 13:00 probed as 13:00' },
        { type: "context", text: "const offset = offsetIn(timeZone, probe);" },
      ],
    },
    regressionTest: {
      file: "packages/features/schedules/lib/date-ranges.test.ts (illustrative)",
      lines: [
        { type: "add", text: 'it("keeps a 1 PM to 6 PM New York day at 17:00 to 22:00 UTC on 2026-03-08", () => {' },
        { type: "add", text: "  const [range] = processWorkingHours({" },
        { type: "add", text: "    item: { days: [0], startTime: at(13, 0), endTime: at(18, 0) }," },
        { type: "add", text: '    timeZone: "America/New_York",' },
        { type: "add", text: '    dateFrom: "2026-03-08",' },
        { type: "add", text: '    dateTo: "2026-03-08",' },
        { type: "add", text: "  });" },
        { type: "add", text: '  expect(range.start.toISOString()).toBe("2026-03-08T17:00:00.000Z");' },
        { type: "add", text: '  expect(range.end.toISOString()).toBe("2026-03-08T22:00:00.000Z");' },
        { type: "add", text: "});" },
      ],
    },
    illustrative: true,
    upstream: {
      kind: "described-in-report",
      label: "Fix described in the public report",
      href: LINKS.issue30021.href,
      reportedResult: "192 tests green",
    },
  },
};
