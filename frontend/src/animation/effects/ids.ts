import type { ActorId, PoseName } from "../actors";
import type { Pt, Rect } from "../paths/cubic";
import type { RegionId } from "../director/types";
import type { FixedPassParams, LadderRungParams, ReplayEventParams, RevealCardParams, StitchSewParams, TimelineMilestoneParams } from "./replayParams";

/**
 * Params of every effect in the design's registry table. `EffectId` is derived from this map, so a
 * component can only request a registered effect, and a registry missing an id is a compile error.
 *
 * Elements and points are passed in by the caller (viewport coordinates for overlay effects). Effects
 * never import section or mascot components; mascots are reached through the actor registry by id.
 */

export interface ActorPose {
  readonly actor: ActorId;
  readonly pose: PoseName;
}

/** Shared shape for the region effects implemented in task 14: what to reveal and which actors to pose. */
export interface RevealParams {
  /** Elements that end visible and untransformed (opacity 1, identity transform). */
  readonly targets?: readonly Element[];
  /** Actors that end in this pose. */
  readonly actors?: readonly ActorPose[];
}

export interface EffectParamsMap {
  // ---- P0
  "ui.reduce-motion-ack": { readonly mark: Element | null };
  "focus.yield": { readonly elements: readonly Element[] };
  // ---- P1
  "hero.clock-entry": {
    readonly hour: Element | null;
    readonly minute: Element | null;
    /** Faded in by the Reduce Motion fallback. */
    readonly face?: Element | null;
    /** Final angles; default 23:59 (hour 359.5, minute 354). */
    readonly to?: { readonly hour: number; readonly minute: number };
  };
  "replay.event": ReplayEventParams;
  "clock.crack": RevealParams;
  "raven.stamp": RevealParams;
  "ladder.rung": LadderRungParams;
  "replay.fixed-pass": FixedPassParams;
  "replay.reveal": RevealCardParams;
  "timeline.milestone": TimelineMilestoneParams;
  // ---- P2
  "bats.burst": { readonly origin: Rect; readonly bounds: Rect; readonly seed: number };
  "problem.scatter": RevealParams & { readonly origin?: Rect; readonly bounds?: Rect; readonly seed?: number };
  "bat.travel": { readonly from: Pt; readonly to: Pt; readonly onScreen: boolean };
  "bat.to-point": { readonly from: Pt; readonly to: Pt };
  "section.reaction": { readonly region: RegionId; readonly actors: readonly ActorPose[]; readonly staggerMs?: number };
  "crew.rollcall": RevealParams;
  "cases.enter": RevealParams;
  "case.draft-create": RevealParams & { readonly draftId: string };
  "case.open": RevealParams;
  "stitch.sew": StitchSewParams;
  "proof.ladder": {
    readonly caseId: string;
    /** The proof root carrying `data-proof="armed"`; un-armed when the run starts. */
    readonly armed?: Element | null;
    /** The unrolling rod (opacity 0 at rest). */
    readonly rod?: Element | null;
    /** Distance the rod travels, px. */
    readonly travel?: number;
    readonly rungs: readonly Element[];
    readonly shapes?: readonly Element[];
    readonly ranks?: readonly Element[];
    readonly actors?: readonly ActorPose[];
  };
  "proof.hash": {
    readonly caseId: string;
    readonly armed?: Element | null;
    readonly strip?: Element | null;
    readonly turns?: readonly Element[];
    readonly end?: Element | null;
    readonly tag?: Element | null;
    readonly value?: Element | null;
    readonly actors?: readonly ActorPose[];
  };
  "proof.jack": {
    readonly caseId: string;
    readonly armed?: Element | null;
    readonly browserFace?: Element | null;
    readonly serverFace?: Element | null;
    /** Underlines that draw under the lit half (scaleX 0 at rest). */
    readonly browserUnderline?: Element | null;
    readonly serverUnderline?: Element | null;
    /** The stacked caption pair that cross-fades at the hinge (browser 1, server 0 at rest). */
    readonly browserCaption?: Element | null;
    readonly serverCaption?: Element | null;
    readonly actors?: readonly ActorPose[];
  };
  "ghost.arrive": { readonly region: RegionId; readonly actor?: ActorId; readonly at: Pt };
  "flow.step": RevealParams & { readonly step: string };
  "mascot.hover": ActorPose;
  "scroll.to": { readonly target: Element; readonly block?: ScrollLogicalPosition };
  // ---- P3
  "idle.beat": ActorPose & { readonly region: RegionId };
  "ghost.look": { readonly actor?: ActorId; readonly at: Pt };
  "bat.flyby": { readonly bounds: Rect; readonly seed: number };
}

export type EffectId = keyof EffectParamsMap;
export type ParamsOf<K extends EffectId> = EffectParamsMap[K];

/** Every id of the design's registry table, in table order. */
export const EFFECT_IDS = [
  "ui.reduce-motion-ack",
  "focus.yield",
  "hero.clock-entry",
  "replay.event",
  "clock.crack",
  "raven.stamp",
  "ladder.rung",
  "replay.fixed-pass",
  "replay.reveal",
  "timeline.milestone",
  "bats.burst",
  "problem.scatter",
  "bat.travel",
  "bat.to-point",
  "section.reaction",
  "crew.rollcall",
  "cases.enter",
  "case.draft-create",
  "case.open",
  "stitch.sew",
  "proof.ladder",
  "proof.hash",
  "proof.jack",
  "ghost.arrive",
  "flow.step",
  "mascot.hover",
  "scroll.to",
  "idle.beat",
  "ghost.look",
  "bat.flyby",
] as const satisfies readonly EffectId[];

// Compile-time check that EFFECT_IDS lists every key of the params map.
type Missing = Exclude<EffectId, (typeof EFFECT_IDS)[number]>;
const allListed: [Missing] extends [never] ? true : Missing = true;
void allListed;
