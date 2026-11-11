import type { MascotId } from "./crew";

/**
 * Investigation flow (Requirements 3.6, 3.7, 3.8, decision D17): six steps, each with the mascots that act in it.
 * All six Crew_Agents and all six System_Component_Mascots appear exactly once, in sequence. The fix step is
 * separate from evidence because a suggested fix is a proposal, not a measurement.
 */
export const FLOW_STEP_IDS = ["scope", "plan", "approve", "run", "evidence", "fix"] as const;
export type FlowStepId = (typeof FLOW_STEP_IDS)[number];

export interface FlowStep {
  readonly id: FlowStepId;
  /** 1-based position. */
  readonly index: number;
  readonly title: string;
  readonly summary: string;
  /** Mascots attached to this step, in the order they act. */
  readonly mascots: readonly MascotId[];
  /** The mascot that perches on the step's signboard. One of `mascots`. */
  readonly lead: MascotId;
  /** True when activating the step plays a Bat_Burst (approve, Requirement 3.7). */
  readonly burst: boolean;
}

export const FLOW_STEPS: readonly FlowStep[] = [
  {
    id: "scope",
    index: 1,
    title: "Scope",
    summary:
      "You name the page and the date boundary that worries you. The Gatekeeper writes down what the Crew may touch, and the Crew keeps to that list.",
    mascots: ["wraith-director", "gargoyle-gatekeeper"],
    lead: "wraith-director",
    burst: false,
  },
  {
    id: "plan",
    index: 2,
    title: "Plan",
    summary:
      "The Bat Scout finds a route to the date boundary, and the plan is written from what it saw. An experiment in the plan is one clock value in one time zone. Jack lines up the affected version and the fixed one so the two can be compared.",
    mascots: ["bat-scout", "two-faced-jack"],
    lead: "bat-scout",
    burst: false,
  },
  {
    id: "approve",
    index: 3,
    title: "Approve",
    summary: "You approve the plan before anything runs. The Warden holds the queue until you do.",
    mascots: ["watchtower-warden"],
    lead: "watchtower-warden",
    burst: true,
  },
  {
    id: "run",
    index: 4,
    title: "Run",
    summary:
      "The Pumpkin Mechanic runs the experiments in the Cat's local sandbox, with the browser clock controlled. The Spider keeps a trace of what happens while it happens.",
    mascots: ["pumpkin-mechanic", "cauldron-cat", "spider-weaver"],
    lead: "pumpkin-mechanic",
    burst: false,
  },
  {
    id: "evidence",
    index: 5,
    title: "Evidence",
    summary:
      "The Mummy hashes the artifacts and wraps up anything secret before the Raven looks at them. The Raven puts the result on the rung its evidence supports, and nowhere higher.",
    mascots: ["mummy-wrapper", "raven-archivist"],
    lead: "raven-archivist",
    burst: false,
  },
  {
    id: "fix",
    index: 6,
    title: "Fix",
    summary:
      "Doctor Stitch drafts a suggested fix and the regression test that proves it. A fix is called verified only after it passes on a fixed version. The Scribe bundles the test and the fix into the report export.",
    mascots: ["doctor-stitch", "skeleton-scribe"],
    lead: "doctor-stitch",
    burst: false,
  },
];
