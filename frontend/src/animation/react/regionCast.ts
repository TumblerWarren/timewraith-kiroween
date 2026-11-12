import type { MascotId } from "../../mascots/ids";
import type { ActorPose } from "../effects/ids";

/**
 * Who reacts where (design "Per-region mascot assignment and reactions"). Actor ids are region-scoped
 * (`"{region}:{mascot}"`, see `mascots/actors.ts`). Missing actors are skipped by the effects, so a region
 * whose figure is not on the page yet simply plays the rest.
 *
 * Region effects of task 14 that need their own params are sent elsewhere: `crew.rollcall` and `raven.stamp`
 * (BoardMotion, with the casts below), `flow.step` (the Flow component, per landing at the lead line),
 * `problem.scatter` and `clock.crack` (the Lost Hour scene at the 03:00 jump), `cases.enter`,
 * `case.draft-create` and `case.open` (CaseMotionHooks). `stitch.sew` and `replay.*` belong to the Case view.
 */
const a = (region: string, mascot: string, pose: string): ActorPose => ({ actor: `${region}:${mascot}`, pose });

/** One `section.reaction` per region, once on enter. */
export const REGION_REACTIONS: Readonly<Record<string, { readonly actors: readonly ActorPose[]; readonly delayMs?: number; readonly staggerMs?: number }>> = {
  // The hero clock entry (P1 scene, 580 ms) runs at load; the reaction waits for it instead of timing out in the queue.
  open: {
    // The clock sweep starts after load plus two painted frames (BoardMotion), so this waits past it.
    delayMs: 1500,
    staggerMs: 160,
    // The Wraith is already on stage at load, so it glances toward the form instead of gliding in (no pop).
    actors: [a("open", "wraith-director", "glance"), a("open", "watchtower-warden", "bow"), a("open", "mini-bat", "act")],
  },
  "lost-hour": { actors: [a("lost-hour", "mini-ghost", "look")] },
  library: { actors: [a("library", "skeleton-scribe", "rise"), a("library", "mini-bat", "act")] },
  case: {
    actors: [
      a("case", "spider-weaver", "drop"),
      a("case", "bat-scout", "act"),
      a("case", "pumpkin-mechanic", "act"),
      a("case", "raven-archivist", "bow"),
      a("case", "two-faced-jack", "turn"),
      a("case", "doctor-stitch", "bow"),
    ],
  },
  // Crew: `crew.rollcall` (ROLLCALL below). Flow: `flow.step` per landing. Closing: `raven.stamp` (CLOSING_STAMP).
};

/** Crew roll-call order (content order of `content/crew.ts`) and each figure's check-in pose. */
export const ROLLCALL: readonly ActorPose[] = [
  a("crew", "wraith-director", "wave"),
  a("crew", "watchtower-warden", "bow"),
  a("crew", "bat-scout", "act"),
  a("crew", "pumpkin-mechanic", "act"),
  a("crew", "raven-archivist", "bow"),
  a("crew", "doctor-stitch", "bow"),
  a("crew", "gargoyle-gatekeeper", "settle"),
  a("crew", "cauldron-cat", "peek"),
  a("crew", "spider-weaver", "bounce"),
  a("crew", "mummy-wrapper", "wobble"),
  a("crew", "two-faced-jack", "turn"),
  a("crew", "skeleton-scribe", "write"),
  a("crew", "mini-bat", "act"),
  a("crew", "mini-ghost", "wave"),
];

/**
 * Tier 2 reactions: these six Crew roster figures are buttons whose hover, focus and Enter or Space play their own
 * pose through `mascot.hover` (deny, hiss, bounce, wobble, flip, write).
 */
export const TIER2_REACTIONS: Readonly<Partial<Record<MascotId, string>>> = {
  "gargoyle-gatekeeper": "deny",
  "cauldron-cat": "hiss",
  "spider-weaver": "bounce",
  "mummy-wrapper": "wobble",
  "two-faced-jack": "flip",
  "skeleton-scribe": "write",
};

/** Tier 1 roster figures react to hover only (not tab stops): Doctor Stitch spins his spool, the default is a wave. */
export const TIER1_HOVER: Readonly<Partial<Record<MascotId, string>>> = { "doctor-stitch": "spin", "mini-bat": "act", "pumpkin-mechanic": "act" };

/** Mascot poses on a Flow landing when it becomes active (`flow.step`): every figure plays "act". */
export const FLOW_ACT_POSE = "act";

/** Closing: the Raven lands the stamp, then Skeleton Scribe's hand writes the underline. */
export const CLOSING_STAMP: readonly ActorPose[] = [a("close", "raven-archivist", "bow"), a("close", "skeleton-scribe", "write")];

/** P3 idle beats (`idle.beat`), picked at random among regions in view. */
export const IDLE_BEATS: readonly (ActorPose & { readonly region: string })[] = [
  { ...a("open", "wraith-director", "sway"), region: "open" },
  { ...a("open", "watchtower-warden", "blink"), region: "open" },
  { ...a("library", "skeleton-scribe", "wave"), region: "library" },
  { ...a("case", "raven-archivist", "look"), region: "case" },
  { ...a("case", "doctor-stitch", "wobble"), region: "case" },
  { ...a("close", "raven-archivist", "preen"), region: "close" },
  { ...a("close", "skeleton-scribe", "wave"), region: "close" },
];
