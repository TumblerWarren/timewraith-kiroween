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
    job: "Clones the pinned commit and runs the investigation from start to end.",
  },
  {
    id: "watchtower-warden",
    name: "Watchtower Warden",
    tier: 1,
    kind: "agent",
    sections: ["open", "crew", "flow"],
    roams: false,
    job: "Holds the queue, waits for your plan approval and enforces the limits.",
  },
  {
    id: "bat-scout",
    name: "Bat Scout",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Kiro agent: reads the scan results and keeps the time-sensitive code worth testing.",
  },
  {
    id: "pumpkin-mechanic",
    name: "Pumpkin Mechanic",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Kiro agent: writes a small adapter for each experiment and picks the rules it must keep.",
  },
  {
    id: "raven-archivist",
    name: "Raven Archivist",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow", "close"],
    roams: false,
    job: "Kiro agent: judges each reproduced violation and blind-reviews every fix.",
  },
  {
    id: "doctor-stitch",
    name: "Doctor Stitch",
    tier: 1,
    kind: "agent",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Kiro agent: writes a fix, which counts only after it passes eight gates.",
  },
  {
    id: "gargoyle-gatekeeper",
    name: "Gargoyle Gatekeeper",
    tier: 2,
    kind: "system",
    sections: ["crew", "flow"],
    roams: false,
    job: "Reads the manifests, lockfile and test setup and says what the repository supports.",
  },
  {
    id: "cauldron-cat",
    name: "Cauldron Cat",
    tier: 2,
    kind: "system",
    sections: ["crew", "flow"],
    roams: false,
    job: "Runs the Docker sandbox: no network after install, 2 CPUs, 4 GB.",
  },
  {
    id: "spider-weaver",
    name: "Spider Weaver",
    tier: 2,
    kind: "system",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Sweeps thousands of clock settings through each adapter in thirteen time zones.",
  },
  {
    id: "mummy-wrapper",
    name: "Mummy Wrapper",
    tier: 2,
    kind: "system",
    sections: ["crew", "flow"],
    roams: false,
    job: "Keeps the record of every run, decision and piece of evidence.",
  },
  {
    id: "two-faced-jack",
    name: "Two-Faced Jack",
    tier: 2,
    kind: "system",
    sections: ["case", "crew", "flow"],
    roams: false,
    job: "Searches the public issues to tell a known bug from a new one.",
  },
  {
    id: "skeleton-scribe",
    name: "Skeleton Scribe",
    tier: 2,
    kind: "system",
    sections: ["library", "crew", "flow", "close"],
    roams: false,
    job: "Bundles the accepted fix with its regression test as a patch.",
  },
  {
    id: "mini-bat",
    name: "Mini Bat",
    tier: 1,
    kind: "companion",
    sections: ["open", "lost-hour", "library", "case", "crew"],
    roams: true,
    job: "Keeps watch on the board.",
  },
  {
    id: "mini-ghost",
    name: "Mini Ghost",
    tier: 1,
    kind: "companion",
    sections: ["lost-hour", "crew"],
    roams: true,
    job: "Haunts the lost hour.",
  },
];

export const CREW_BY_ID: Readonly<Record<MascotId, CrewMember>> = Object.fromEntries(
  CREW.map((m) => [m.id, m]),
) as Record<MascotId, CrewMember>;

export function crewByKind(kind: MascotKind): readonly CrewMember[] {
  return CREW.filter((m) => m.kind === kind);
}
