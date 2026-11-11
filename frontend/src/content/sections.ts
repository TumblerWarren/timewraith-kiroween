import type { MascotKind } from "./crew";

/**
 * Region prose. The fixed, honesty-critical strings (headline, positioning line, checklist label, illustration
 * label, draft labels, the #7998 note, "Browser time ≠ server time", "No anomaly observed in tested cases") stay in
 * `copy.ts`; this file holds the remaining headings and intros so components do not retype copy.
 *
 * Voice (visual revision R1): the Wraith Director showing a visitor round the clocktower at night. Plain and
 * specific, a little dry, sentences of different lengths. No slogans, no "from X to Y", no "every X", no lists
 * of three, no rhetorical questions, no em-dashes. Headings say what is on the page.
 * None of these strings claims a live system or a new finding.
 */

// Open-a-case panel: the form sheet (the form itself is mounted in task 7.4)
export const OPEN_FORM_HEADING = "Open a new case";
export const OPEN_FORM_NOTE_TAIL =
  "TimeWraith checks the shape of what you enter and stores a draft in this browser.";

// Lost Hour (a generic daylight-saving illustration; the label itself is PROBLEM_ILLUSTRATION_LABEL)
export const PROBLEM_HEADING = "The missing hour on a daylight-saving night";
export const PROBLEM_INTRO =
  "Where clocks change for summer, there is one night in spring when the tower reads 01:59 and then, a minute later, 03:00. The hour in between is never shown. A calendar that adds time by counting on the clock face, instead of asking the time-zone rules, can slide an event onto the next day or lose it without saying a word.";
export const PROBLEM_STAMP_BEFORE = { time: "01:59", label: "Last reading before the jump" } as const;
export const PROBLEM_STAMP_AFTER = { time: "03:00", label: "The next reading" } as const;

// Crew
export const CREW_HEADING = "Who works in the tower";
export const CREW_INTRO =
  "Fourteen of us keep the place running, and we stood still long enough for one picture. I am the tall one with the lantern. I write the plans and the Warden hands out the work. The other agents go and poke at your app until the Raven is satisfied with what they bring back, and then Doctor Stitch sews up a fix for somebody to review. The middling ones are system components. They are the plumbing that keeps each run inside a sandbox and writes down what happened. The two little ones are companions, which mostly means they follow you down the page. The numbers match the key under the picture.";

export interface CrewTierDef {
  readonly kind: MascotKind;
  /** CSS hook (`data-tier`) on the key group. */
  readonly tier: "agents" | "system" | "companions";
  readonly title: string;
  /** One short line under the group title that says where to find them in the picture. */
  readonly note: string;
}

/** The three groups of the portrait key, large to small (Requirement 3.5). */
export const CREW_TIERS: readonly CrewTierDef[] = [
  { kind: "agent", tier: "agents", title: "The agents", note: "The big ones, mostly on the floor." },
  { kind: "system", tier: "system", title: "System components", note: "Middling, mostly up on the ledges." },
  { kind: "companion", tier: "companions", title: "Companions", note: "Small enough to miss." },
];

// Flow
export const FLOW_HEADING = "How a case runs";
export const FLOW_INTRO =
  "Nothing touches your app until you have read the plan and agreed to it. After that the Crew takes the tower stairs down one landing at a time. Whatever comes back is marked with how far its evidence actually goes, and the fix comes last, as a suggestion.";
/** Tag on the approve step, where the Bat Burst plays later. */
export const FLOW_GATE_TAG = "Waits for you";
/** Marker on the landing that is currently at the lead line (task 14.7: active step shown by text and shape). */
export const FLOW_ACTIVE_LABEL = "The Crew is here now";
/** Accessible name of a Tier 2 roster button in the Crew portrait (task 14.8). */
export const crewReactLabel = (name: string | number) => `${name}, play reaction`;

// Case library
export const LIBRARY_HEADING = "Case library";
export const LIBRARY_INTRO =
  "The sample cases sit on this shelf with illustrative data in their folders. When you open a case of your own, its draft lands here too. A draft stays a draft in this demo, because nothing runs it.";
export const LIBRARY_SAMPLE_LABEL = "Sample case, illustrative data";
export const LIBRARY_OPEN_LABEL = "Open case";
/** Target of the FullCalendar sample case, as printed on its card (mono). */
export const FULLCALENDAR_TARGET = "fullcalendar/fullcalendar @ v6.1.10";
export const FULLCALENDAR_CASE_TITLE = "FullCalendar #7998: the header date is one day ahead";

// Case view (the selected case: Replay Lab, ladder, time note and fix)
export const CASE_HEADING = "The open case file";
export const REPLAY_HEADING = CASE_HEADING;
export function replayIntro(eventCount: number): string {
  return `This folder holds one sample investigation. It was recorded beforehand and ships inside the page, so the ${eventCount} events below come out the same way each time you look, in the order the Crew logged them.`;
}
export const CASE_FIX_NOTE =
  "Doctor Stitch drafts a suggested fix and the regression test that proves it. A fix is called verified only after it passes on a fixed version.";
export const CASE_FIX_STATUS = "Suggested fix · not verified";
export const REPLAY_CASE_TITLE = "Case file: the header date is one day ahead";
/** Leads into the #7998 link after REPLAY_SOURCE_NOTE. */
export const REPLAY_SOURCE_LEAD = "The original report is";
export const REPLAY_EVENT_NO_EVIDENCE = "none recorded yet";
export const REPLAY_PREV_LABEL = "Previous event";
export const REPLAY_NEXT_LABEL = "Next event";
export const REPLAY_SCRUBBER_LABEL = "Replay events";
export const REPLAY_NOT_CONTROLLED = "Browser clock not controlled yet";

// Proof
export const PROOF_HEADING = "How the Crew rates a result";
export const PROOF_INTRO =
  "The Raven will not write \u201Cfixed\u201D or \u201Cclean\u201D because a run felt fine. A result goes on the lowest rung its evidence supports and stays there until somebody brings more.";
export const PROOF_LADDER_TITLE = "Evidence Ladder";
export const PROOF_LADDER_NOTE = "The lowest rung is at the top of the list. A result only ever climbs; it never slides back down.";
export const PROOF_NEGATIVE_LEAD = "If the runs turn up nothing, the report says";
export const PROOF_NEGATIVE_TAIL =
  "That sentence is about the cases that ran and nothing more. The bug may still be waiting in a case nobody tried.";
export const PROOF_BROWSER_FACE = {
  title: "Browser clock",
  text: "Set by the Crew inside the test browser, and paused or moved on when a test needs it.",
} as const;
export const PROOF_SERVER_FACE = {
  title: "Server clock",
  text: "Not controlled. Server code still reads the real time.",
} as const;
export const PROOF_HASH_LABEL = "Sample artifact hash (illustrative)";
export const PROOF_HASH_VALUE = "sha256:7f3a\u20269c1e";

// Closing (was Final_CTA, decision D19)
export const FINAL_HEADING = "Open a case";
export const FINAL_INTRO =
  "Name a repository and the date boundary that worries you, and the Crew opens a draft for it. In this demo the draft stays in your browser and nothing runs. Later you approve the plan first, and the Raven files whatever comes back with its rating attached, usually a little before the sun comes up.";
/** The Raven's stamp. It is DOM text, so it stays accessible; the stamp node is 06:58. */
export const FINAL_STAMP = "Filed 06:58";
