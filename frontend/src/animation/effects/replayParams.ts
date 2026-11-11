import type { RevealParams } from "./ids";

/**
 * Params of the Case view effects (tasks 14.3 to 14.5). Every element is optional, so a caller that cannot find
 * one (a draft, a test, a missing mascot) still gets the settled state. The Case view passes the elements it
 * rendered; effects never query the page themselves.
 */

/** `replay.event` (P1 micro): the newly current event's pieces. */
export interface ReplayEventParams extends RevealParams {
  readonly eventId: string;
  /** The event card's text block: slides in from the direction of travel. */
  readonly card?: Element | null;
  /** The actor's pose thumbnail on the card (actors not standing on the sheet). */
  readonly thumb?: Element | null;
  /** Spider Weaver's hanger and her silk: she swings over from the previous peg. */
  readonly spider?: Element | null;
  readonly silk?: Element | null;
  /** Horizontal distance in px from the previous peg to the new one (negative when moving right). */
  readonly fromX?: number;
  /** The current peg and the current clock chip: both get the same "current" pop. */
  readonly peg?: Element | null;
  readonly chip?: Element | null;
  /** The ink crack at the first anomaly peg, drawn once on the first arrival. */
  readonly crack?: Element | null;
}

/** `ladder.rung` (P1 micro): the newly reached rung stamps in on the strip and on the full ladder. */
export interface LadderRungParams extends RevealParams {
  readonly rung: number;
  /** "now" stamps (strip and full ladder). */
  readonly stamps?: readonly Element[];
  /** The rung shapes that fill in. */
  readonly shapes?: readonly Element[];
}

/** `replay.fixed-pass` (P1 micro): the climax of a fixed-version check. */
export interface FixedPassParams extends RevealParams {
  readonly caseId: string;
  readonly eventId: string;
  /** The patched version band on the version track: it turns over. */
  readonly band?: Element | null;
  /** The "passes" stamp. */
  readonly stamp?: Element | null;
  /** Jack's thumbnail on the event card: flips to his fixed face. */
  readonly jack?: Element | null;
}

/** `replay.reveal` (P1 scene): the Blind hunt report card turns face up. */
export interface RevealCardParams extends RevealParams {
  readonly caseId: string;
  readonly eventId: string;
  /** The card that turns (scaleX through zero). */
  readonly card?: Element | null;
  /** The decorative face-down back, shown for the first half of the turn. */
  readonly back?: Element | null;
  /** The face-up content, shown from the midpoint. */
  readonly front?: Element | null;
  /** The match stamp, landing after the turn. */
  readonly stamp?: Element | null;
}

/** `stitch.sew` (P2 scene): Doctor Stitch's needle runs down the diff and stitches the lines in. */
export interface StitchSewParams extends RevealParams {
  readonly caseId: string;
  /** The needle arm (moves down the margin, then back to rest). */
  readonly needle?: Element | null;
  /** Distance in px the needle travels (the diff's height). */
  readonly travelPx?: number;
  /** The SVG stitch line's wrapper along the margin (drawn with scaleY from the top). */
  readonly thread?: Element | null;
  /** Lines to stitch in (at most 12 are animated); `lineAt` is each line's position 0..1 down the diff. */
  readonly lines?: readonly Element[];
  readonly lineAt?: readonly number[];
  /** Strike bars of removed lines, drawn as the needle passes. */
  readonly strikes?: readonly Element[];
  readonly strikeAt?: readonly number[];
}

/** `timeline.milestone` (P1 micro): a Version_Timeline milestone has just been reached by the replay. */
export interface TimelineMilestoneParams extends RevealParams {
  readonly caseId: string;
  /** The milestone kind ("reproduced", "fix-suggested", "fixed-verified"). */
  readonly kind: string;
  /** The ring that fills (a small pop). */
  readonly ring?: Element | null;
  /** The "reached" stamp that lands. */
  readonly stamp?: Element | null;
  /** The thread segment up to the milestone: it inks in. */
  readonly segment?: Element | null;
}
