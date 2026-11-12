import type { Phase } from "../api/types";
import type { MascotId } from "./crew";

/**
 * Investigation flow: the backend's five steps (`GET /api/v1/flow`, `FLOW` in backend/src/timewraith/models.py)
 * plus the follow-on fix step. Each step names whether a Kiro agent or plain code owns it. All six Crew_Agents and
 * all six System_Component_Mascots appear exactly once, in sequence.
 */
export const FLOW_STEP_IDS = ["repository", "discovery", "design", "execution", "verification", "fix"] as const satisfies readonly Phase[];
export type FlowStepId = (typeof FLOW_STEP_IDS)[number];

export interface FlowStep {
  readonly id: FlowStepId;
  /** 1-based position. */
  readonly index: number;
  /** The step's full name, as the backend's flow and the strip at the top of the board use it. */
  readonly title: string;
  /** The short name lettered on the Flow region's signboard (the board is 164px wide). */
  readonly sign: string;
  /** Who owns the step: a Kiro agent that proposes, or code that produces facts. */
  readonly kind: "kiro-agent" | "code";
  readonly summary: string;
  /** Mascots attached to this step, in the order they act. */
  readonly mascots: readonly MascotId[];
  /** The mascot that perches on the step's signboard and owns the step. One of `mascots`. */
  readonly lead: MascotId;
  /** True when activating the step plays a Bat_Burst (the plan approval stop after design). */
  readonly burst: boolean;
  /** True for the step after the five-step flow (Fix). */
  readonly followOn: boolean;
}

export const FLOW_STEPS: readonly FlowStep[] = [
  {
    id: "repository",
    index: 1,
    title: "Repository",
    sign: "Repository",
    kind: "code",
    summary:
      "The Wraith Director clones the one commit you pinned, with Git hooks, submodules and links switched off. The Gatekeeper reads the manifests, the lockfile and the test setup and writes down what the repository can support.",
    mascots: ["wraith-director", "gargoyle-gatekeeper"],
    lead: "wraith-director",
    burst: false,
    followOn: false,
  },
  {
    id: "discovery",
    index: 2,
    title: "Time-sensitive code discovery",
    sign: "Discovery",
    kind: "kiro-agent",
    summary:
      "A scan finds the code that reads the clock, compares dates or converts time zones. The Bat Scout looks over the strongest candidates and keeps the ones worth an experiment, citing the lines it saw.",
    mascots: ["bat-scout"],
    lead: "bat-scout",
    burst: false,
    followOn: false,
  },
  {
    id: "design",
    index: 3,
    title: "Autonomous experiment design",
    sign: "Design",
    kind: "kiro-agent",
    summary:
      "The Pumpkin Mechanic writes a small adapter that calls the code, and picks the rules it must keep from a fixed list. The Warden then holds the queue until you approve the experiments.",
    mascots: ["pumpkin-mechanic", "watchtower-warden"],
    lead: "pumpkin-mechanic",
    burst: true,
    followOn: false,
  },
  {
    id: "execution",
    index: 4,
    title: "Controlled execution",
    sign: "Execution",
    kind: "code",
    summary:
      "The Spider sweeps thousands of clock settings through each adapter in the Cat's Docker sandbox, with no network: daylight-saving changes, month ends and leap days in thirteen zones. Fixed rules mark each result, and the Mummy keeps the record.",
    mascots: ["spider-weaver", "cauldron-cat", "mummy-wrapper"],
    lead: "spider-weaver",
    burst: false,
    followOn: false,
  },
  {
    id: "verification",
    index: 5,
    title: "Independent bug verification",
    sign: "Verification",
    kind: "kiro-agent",
    summary:
      "A broken rule is run again three times in clean containers. The Raven then reads what the repository's own tests and docs say about that moment: if they say it is deliberate, and the cited test passes, it is reported as intended behaviour, not a bug. Otherwise the Raven rules whether it is a real defect, and Jack checks the public issues for an earlier report.",
    mascots: ["raven-archivist", "two-faced-jack"],
    lead: "raven-archivist",
    burst: false,
    followOn: false,
  },
  {
    id: "fix",
    index: 6,
    title: "Fix",
    sign: "Fix",
    kind: "kiro-agent",
    summary:
      "Doctor Stitch works like a developer through TimeWraith's tools: he reads and searches the code, makes exact edits and runs the failing test in the sandbox until he submits a patch. It is called verified only after it passes eight gates on a clean copy and the Raven's blind review, and you accept it before you can download it. The Scribe bundles the patch with its regression test.",
    mascots: ["doctor-stitch", "skeleton-scribe"],
    lead: "doctor-stitch",
    burst: false,
    followOn: true,
  },
];

export const FLOW_STEP_BY_ID: Readonly<Record<FlowStepId, FlowStep>> = Object.fromEntries(FLOW_STEPS.map((s) => [s.id, s])) as Record<
  FlowStepId,
  FlowStep
>;
