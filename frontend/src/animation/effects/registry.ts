import type { EffectRegistryOf } from "../director/types";
import { batFlyby } from "./bat-flyby";
import { batToPoint } from "./bat-to-point";
import { batTravel } from "./bat-travel";
import { batsBurst } from "./bats-burst";
import { focusYield } from "./focus-yield";
import { ghostLook } from "./ghost-look";
import { heroClockEntry } from "./hero-clock-entry";
import { EFFECT_IDS, type EffectId, type EffectParamsMap } from "./ids";
import { idleBeat } from "./idle-beat";
import { mascotHover } from "./mascot-hover";
import { reduceMotionAck } from "./reduce-motion-ack";
import { scrollTo } from "./scroll-to";
import { sectionReaction } from "./section-reaction";
import { caseDraftCreate } from "./case-draft-create";
import { caseOpen } from "./case-open";
import { casesEnter } from "./cases-enter";
import { clockCrack } from "./clock-crack";
import { crewRollcall } from "./crew-rollcall";
import { flowStep } from "./flow-step";
import { problemScatter } from "./problem-scatter";
import { ravenStamp } from "./raven-stamp";
import { ladderRung } from "./ladder-rung";
import { replayEvent } from "./replay-event";
import { replayFixedPass } from "./replay-fixed-pass";
import { replayReveal } from "./replay-reveal";
import { timelineMilestone } from "./timeline-milestone";
import { stitchSew } from "./stitch-sew";
import { proofHash, proofJack, proofLadder } from "./proof-effects";
import { ghostArrive } from "./ghost-arrive";

export type { EffectId, EffectParamsMap, ParamsOf } from "./ids";
export { EFFECT_IDS } from "./ids";
export type EffectRegistry = EffectRegistryOf<EffectParamsMap>;

/**
 * The effect registry (design "Effect registry"). A missing id is a compile error. Entries marked STUB
 * (see `stubs.ts`) settle at once until their task 14.x implementation replaces them.
 */
export const EFFECTS: EffectRegistry = {
  "ui.reduce-motion-ack": reduceMotionAck,
  "focus.yield": focusYield,
  "hero.clock-entry": heroClockEntry,
  "replay.event": replayEvent,
  "clock.crack": clockCrack,
  "raven.stamp": ravenStamp,
  "ladder.rung": ladderRung,
  "replay.fixed-pass": replayFixedPass,
  "replay.reveal": replayReveal,
  "timeline.milestone": timelineMilestone,
  "bats.burst": batsBurst,
  "problem.scatter": problemScatter,
  "bat.travel": batTravel,
  "bat.to-point": batToPoint,
  "section.reaction": sectionReaction,
  "crew.rollcall": crewRollcall,
  "cases.enter": casesEnter,
  "case.draft-create": caseDraftCreate,
  "case.open": caseOpen,
  "stitch.sew": stitchSew,
  "proof.ladder": proofLadder,
  "proof.hash": proofHash,
  "proof.jack": proofJack,
  "ghost.arrive": ghostArrive,
  "flow.step": flowStep,
  "mascot.hover": mascotHover,
  "scroll.to": scrollTo,
  "idle.beat": idleBeat,
  "ghost.look": ghostLook,
  "bat.flyby": batFlyby,
};

/** Ids whose registry entry is still a stub (kept in sync by the registry test). */
export const STUB_EFFECT_IDS: readonly EffectId[] = [];

/** Registry entries in table order, for iteration (tests, debug overlay). */
export function registryEntries(registry: EffectRegistry = EFFECTS) {
  return EFFECT_IDS.map((id) => [id, registry[id]] as const);
}
