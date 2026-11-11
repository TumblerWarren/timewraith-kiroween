import type { MascotId } from "../mascots/ids";
import type { SectionId } from "./nodes";

/**
 * The 14 Mascots (Requirement 4.1, decision D15). The id union lives in `mascots/ids.ts` (single source of truth)
 * and is re-exported here. `sections` follows the design's per-region mascot table.
 */
export { MASCOT_IDS } from "../mascots/ids";
export type { MascotId } from "../mascots/ids";

export type MascotTier = 1 | 2;
/** agent = Crew_Agent, system = System_Component_Mascot, companion = Companion. */
export type MascotKind = "agent" | "system" | "companion";

export interface CrewMember {
  readonly id: MascotId;
  readonly name: string;
  readonly tier: MascotTier;
  readonly kind: MascotKind;
  /** Board regions in which the mascot appears on stage (design: per-region mascot assignment). */
  readonly sections: readonly SectionId[];
  /** True for the overlay companions that also roam the whole board. */
  readonly roams: boolean;
  /** One line describing its job (Requirement 3.5). */
  readonly job: string;
}

export const CREW: readonly CrewMember[] = [
  {
    id: "wraith-director",
    name: "Wraith Director",
    tier: 1,
    kind: "agent",
    sections: ["open", "crew", "flow"],
    roams: false,
    job: "Plans the investigation and speaks for the Crew.",
  },
  {
    id: "watchtower-warden",
    name: "Watchtower Warden",
    tier: 1,
    kind: "agent",
    sections: ["open", "crew", "flow"],
    roams: false,
    job: "Dispatches the experiments and keeps the queue and stop conditions.",
  },
  {
    id: "bat-scout",
    name: "Bat Scout",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Explores the app and finds the route to the date boundary.",
  },
  {
    id: "pumpkin-mechanic",
    name: "Pumpkin Mechanic",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Runs the experiments with the Playwright clock.",
  },
  {
    id: "raven-archivist",
    name: "Raven Archivist",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow", "close"],
    roams: false,
    job: "Verifies the result and stamps how strong the evidence is.",
  },
  {
    id: "doctor-stitch",
    name: "Doctor Stitch",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Patch-maker: stitches a suggested fix and the regression test that proves it.",
  },
  {
    id: "gargoyle-gatekeeper",
    name: "Gargoyle Gatekeeper",
    tier: 2,
    kind: "system",
    sections: ["crew", "flow"],
    roams: false,
    job: "Guards permissions, the allowlist and the sandbox limits.",
  },
  {
    id: "cauldron-cat",
    name: "Cauldron Cat",
    tier: 2,
    kind: "system",
    sections: ["crew", "flow"],
    roams: false,
    job: "Runs the local sandbox where each experiment brews.",
  },
  {
    id: "spider-weaver",
    name: "Spider Weaver",
    tier: 2,
    kind: "system",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Records the trace and events, and spins the timeline thread.",
  },
  {
    id: "mummy-wrapper",
    name: "Mummy Wrapper",
    tier: 2,
    kind: "system",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Hashes artifacts, redacts secrets and writes the manifest.",
  },
  {
    id: "two-faced-jack",
    name: "Two-Faced Jack",
    tier: 2,
    kind: "system",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Compares the affected version with the fixed version.",
  },
  {
    id: "skeleton-scribe",
    name: "Skeleton Scribe",
    tier: 2,
    kind: "system",
    sections: ["library", "crew", "flow", "close"],
    roams: false,
    job: "Exports the report and the regression test.",
  },
  {
    id: "mini-bat",
    name: "Mini Bat",
    tier: 1,
    kind: "companion",
    sections: ["open", "lost-hour", "library", "case", "crew"],
    roams: true,
    job: "Bursts from clicks and flies between section nodes.",
  },
  {
    id: "mini-ghost",
    name: "Mini Ghost",
    tier: 1,
    kind: "companion",
    sections: ["lost-hour", "crew"],
    roams: true,
    job: "Floats down the thread as your scroll companion and progress marker.",
  },
];

export const CREW_BY_ID: Readonly<Record<MascotId, CrewMember>> = Object.fromEntries(
  CREW.map((m) => [m.id, m]),
) as Record<MascotId, CrewMember>;

export function crewByKind(kind: MascotKind): readonly CrewMember[] {
  return CREW.filter((m) => m.kind === kind);
}
