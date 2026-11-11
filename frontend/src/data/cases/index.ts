import type { SampleCase } from "../../cases/model";
import { validateStream } from "../../replay/validateStream";
import { CALCOM_CASE } from "./calcom-30021.case";
import { FULLCALENDAR_CASE } from "./fullcalendar-7998.case";

/**
 * The two bundled Sample_Cases, in their fixed library order (Requirement 21.1): FullCalendar #7998 first (also the
 * case shown on load, Requirement 21.5), then the Cal.com Blind hunt. Sample cases are never written to storage.
 */
export const SAMPLE_CASES: readonly SampleCase[] = [FULLCALENDAR_CASE, CALCOM_CASE];

export const DEFAULT_CASE_ID = FULLCALENDAR_CASE.id;

// Dev check: a stream that breaks a rule is reported in the console (the unit tests fail on it too).
if (import.meta.env.DEV) {
  for (const c of SAMPLE_CASES) {
    const result = validateStream(c.stream, c);
    if (!result.ok) console.error(`Sample case ${c.id} has an invalid stream:`, result.errors);
  }
}

export { CALCOM_CASE, CALCOM_CASE_ID, CALCOM_HIDDEN_TITLE } from "./calcom-30021.case";
export { CALCOM_STREAM } from "./calcom-30021.stream";
export { FULLCALENDAR_CASE, FULLCALENDAR_CASE_ID } from "./fullcalendar-7998.case";
export { FULLCALENDAR_STREAM } from "./fullcalendar-7998.stream";
