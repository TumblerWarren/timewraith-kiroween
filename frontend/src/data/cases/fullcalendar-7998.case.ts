import type { SampleCase } from "../../cases/model";
import { LINKS } from "../../config/links";
import { FIXED_CHECK_NOT_RUN, RECORDED_REPLAY, REPLAY_LABEL } from "../../content/copy";
import { FULLCALENDAR_CASE_TITLE } from "../../content/sections";
import { FC_VERSION_ID, FULLCALENDAR_STREAM } from "./fullcalendar-7998.stream";

/**
 * FullCalendar #7998 sample (Known issue, browser-side time-zone date boundary; Requirements 7.2 to 7.4, 16.5,
 * 26.1, 26.7). The report names @fullcalendar/core 6.1.10, so that is the one version. When this case was written
 * the issue was still open and no FullCalendar release notes mentioned it, so there is no fixed version and the
 * case reads "Fixed-version check not run" (decision D16). The suggested fix and its Playwright regression test
 * are illustrative: written from the report's description, not taken from FullCalendar's source.
 */
export const FULLCALENDAR_CASE_ID = "fullcalendar-7998";

export const FULLCALENDAR_CASE: SampleCase = {
  kind: "sample",
  id: FULLCALENDAR_CASE_ID,
  mode: "known-issue",
  target: {
    kind: "repository",
    repoUrl: "https://github.com/fullcalendar/fullcalendar",
    version: { kind: "ref", value: "v6.1.10" },
  },
  area: "today's date when the calendar zone is far behind the system zone",
  title: FULLCALENDAR_CASE_TITLE,
  issue: { href: LINKS.issue7998.href, label: "FullCalendar #7998", source: "third-party-report" },
  sampleLabel: REPLAY_LABEL,
  replayModeLabel: RECORDED_REPLAY,
  versions: [
    {
      id: FC_VERSION_ID,
      label: "@fullcalendar/core 6.1.10",
      role: "affected",
      source: "public-report",
      result: "fails",
      includesSuggestedFix: false,
    },
  ],
  stream: FULLCALENDAR_STREAM,
  // Dates checked against the npm registry and the GitHub issue record on 2026-11 (design: "Dates for the Version_Timeline").
  // Replay milestones carry no calendar date; the fixed-version milestone is not run (D16).
  timeline: [
    {
      kind: "released",
      label: "@fullcalendar/core 6.1.10 released",
      versionId: FC_VERSION_ID,
      date: { value: "2023-11-29", source: "published-release", href: "https://www.npmjs.com/package/@fullcalendar/core/v/6.1.10" },
      eventId: null,
      illustrativePin: false,
    },
    {
      kind: "reported",
      label: "Issue #7998 reported",
      versionId: FC_VERSION_ID,
      date: { value: "2025-09-12", source: "issue-tracker", href: LINKS.issue7998.href },
      eventId: null,
      illustrativePin: false,
    },
    { kind: "reproduced", label: "Reproduced on the affected version", versionId: FC_VERSION_ID, date: null, eventId: "e11", illustrativePin: false },
    { kind: "fix-suggested", label: "Fix suggested", versionId: FC_VERSION_ID, date: null, eventId: "e14", illustrativePin: false },
    { kind: "fixed-verified", label: "Fixed version verified", versionId: null, date: null, eventId: null, illustrativePin: false, notRunText: FIXED_CHECK_NOT_RUN },
  ],
  timeControl: "Browser clock controlled with the Playwright clock; the server clock was not involved.",
  fix: {
    author: "doctor-stitch",
    summary: "Work out today's date in the calendar's time zone instead of the browser's local zone.",
    change: {
      file: "@fullcalendar/core, the today-date helper (illustrative)",
      lines: [
        { type: "context", text: "function todayStart(dateEnv) {" },
        { type: "remove", text: "  const now = new Date(); // browser's local zone" },
        { type: "remove", text: "  return startOfDay(now);" },
        { type: "add", text: "  const now = dateEnv.createMarker(Date.now()); // calendar zone" },
        { type: "add", text: "  return dateEnv.startOfDay(now);" },
        { type: "context", text: "}" },
      ],
    },
    regressionTest: {
      file: "tests/today-in-calendar-zone.spec.ts (illustrative)",
      lines: [
        { type: "add", text: 'test("today is the Honolulu date when the system zone is ahead", async ({ browser }) => {' },
        { type: "add", text: '  const context = await browser.newContext({ timezoneId: "Asia/Kolkata" });' },
        { type: "add", text: "  const page = await context.newPage();" },
        { type: "add", text: '  await page.clock.setFixedTime(new Date("2024-09-12T09:00:00Z"));' },
        { type: "add", text: '  await page.goto("/week?timeZone=Pacific/Honolulu&nowIndicator=true");' },
        { type: "add", text: '  await expect(page.locator(".fc-day-today")).toHaveAttribute("data-date", "2024-09-11");' },
        { type: "add", text: "});" },
      ],
    },
    illustrative: true,
    upstream: null,
  },
};
