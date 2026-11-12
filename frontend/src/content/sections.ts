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
export const OPEN_FORM_NOTE =
  "The Crew clones the pinned commit, finds the time-sensitive code and designs experiments. Nothing from the repository runs until you approve the plan, and then only inside a Docker sandbox with no network.";
/** Heading of the five-step flow strip at the top of the board. */
export const FLOW_STRIP_HEADING = "What the Crew does with your repository";
export const FLOW_STRIP_KIRO = "Kiro agent";
export const FLOW_STRIP_CODE = "Code";
export const FLOW_STRIP_FIX_NOTE = "Then Doctor Stitch proposes a fix, and eight gates decide whether it holds.";

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
  "Three of the landings belong to Kiro agents, and two are plain code. The code ones produce the facts: the clone, and the clock sweep with its fixed rules. The agents propose, and each proposal is checked against those facts before it counts. Nothing from your repository runs until you approve the experiments.";
/** Tag on the design step, where the Crew stops for your approval and the Bat Burst plays. */
export const FLOW_GATE_TAG = "Waits for your approval";
/** Marker on the landing that is currently at the lead line (task 14.7: active step shown by text and shape). */
export const FLOW_ACTIVE_LABEL = "The Crew is here now";
/** Accessible name of a Tier 2 roster button in the Crew portrait (task 14.8). */
export const crewReactLabel = (name: string | number) => `${name}, play reaction`;

// Case library
export const LIBRARY_HEADING = "Case library";
export const LIBRARY_INTRO =
  "Investigations you open land on this shelf, together with drafts you saved while the backend was offline.";
export const LIBRARY_EMPTY = "No cases yet. Open a case above and it appears here.";
export const LIBRARY_OPEN_LABEL = "Open case";
// Case view (the selected case)
export const CASE_HEADING = "The open case file";

// Proof
export const PROOF_HEADING = "How the Crew rates a result";
export const PROOF_INTRO =
  "The Raven will not write \u201Cfixed\u201D or \u201Cclean\u201D because a run felt fine. A result goes on the lowest rung its evidence supports and stays there until somebody brings more.";
export const PROOF_LADDER_TITLE = "Evidence Ladder";
export const PROOF_LADDER_NOTE = "The lowest rung is at the top of the list. A result only ever climbs; it never slides back down.";
export const PROOF_NEGATIVE_LEAD = "If the runs turn up nothing, the report says";
export const PROOF_NEGATIVE_TAIL =
  "That sentence is about the cases that ran and nothing more. The bug may still be waiting in a case nobody tried.";
// Closing (was Final_CTA, decision D19)
export const FINAL_HEADING = "Open a case";
export const FINAL_INTRO =
  "Name a GitHub repository and the ref to pin, and the Crew goes looking for its time-sensitive code. You approve the experiments before anything runs, and the Raven files whatever comes back with its rating attached.";
/** The Raven's stamp. It is DOM text, so it stays accessible. */
export const FINAL_STAMP = "Case filed";
