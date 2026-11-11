import { CREW, type CrewMember } from "../content/crew";
import type { MascotId } from "./ids";

/**
 * The roster joins the copy in `content/crew.ts` (name, job, tier, sections) with the art facts the
 * asset layer needs: the asset ids that make up a mascot, and its default display size.
 */

export interface MascotArtSpec {
  /** Asset ids of the layered rig parts (Tier 1). Empty for Tier 2: they have a pose only. */
  readonly rig: readonly string[];
  /** Asset id of the single pose image used when the rig is unavailable. */
  readonly pose: string;
  /** Default display size in CSS px. Also the placeholder SVG's viewBox, so both share one aspect. */
  readonly size: { readonly w: number; readonly h: number };
}

/** Parts per mascot follow the design's "Minimum assets per mascot" table (at most 6 parts). */
export const MASCOT_ART: Readonly<Record<MascotId, MascotArtSpec>> = {
  "mini-bat": {
    rig: ["mini-bat/body", "mini-bat/wing-l", "mini-bat/wing-r"],
    pose: "mini-bat/pose-rest",
    size: { w: 104, h: 87 },
  },
  "mini-ghost": {
    rig: ["mini-ghost/body", "mini-ghost/eyes-curious", "mini-ghost/eyes-narrow", "mini-ghost/mouth-neutral", "mini-ghost/mouth-open"],
    pose: "mini-ghost/pose",
    size: { w: 84, h: 89 },
  },
  "wraith-director": {
    rig: ["wraith-director/body", "wraith-director/arm-lantern", "wraith-director/eyes", "wraith-director/mouth-smile"],
    pose: "wraith-director/pose",
    size: { w: 160, h: 200 },
  },
  "watchtower-warden": {
    rig: ["watchtower-warden/body", "watchtower-warden/eye-lamp"],
    pose: "watchtower-warden/pose",
    size: { w: 140, h: 220 },
  },
  "bat-scout": {
    rig: ["bat-scout/body", "bat-scout/wing-l", "bat-scout/wing-r"],
    pose: "bat-scout/pose",
    size: { w: 180, h: 140 },
  },
  "pumpkin-mechanic": {
    rig: ["pumpkin-mechanic/body", "pumpkin-mechanic/arm-lever", "pumpkin-mechanic/eyes"],
    pose: "pumpkin-mechanic/pose",
    size: { w: 170, h: 170 },
  },
  "raven-archivist": {
    rig: ["raven-archivist/body", "raven-archivist/wing-stamp", "raven-archivist/head"],
    pose: "raven-archivist/pose",
    size: { w: 160, h: 180 },
  },
  "gargoyle-gatekeeper": { rig: [], pose: "gargoyle-gatekeeper/pose", size: { w: 170, h: 180 } },
  "cauldron-cat": { rig: [], pose: "cauldron-cat/pose", size: { w: 170, h: 170 } },
  "spider-weaver": { rig: [], pose: "spider-weaver/pose", size: { w: 160, h: 200 } },
  "mummy-wrapper": { rig: [], pose: "mummy-wrapper/pose", size: { w: 140, h: 190 } },
  // Jack also has a second face pose (`two-faced-jack/pose-fixed`); the affected face is the base pose.
  "two-faced-jack": { rig: [], pose: "two-faced-jack/pose-affected", size: { w: 150, h: 210 } },
  "skeleton-scribe": { rig: [], pose: "skeleton-scribe/pose", size: { w: 160, h: 140 } },
  // Decision D15: body (with the spool hand), needle arm, eyes. The size matches the real pose cutout's display
  // box (160 x 189 in the manifest), so the image and the placeholder share one aspect.
  "doctor-stitch": {
    rig: ["doctor-stitch/body", "doctor-stitch/arm-needle", "doctor-stitch/eyes"],
    pose: "doctor-stitch/pose",
    size: { w: 160, h: 189 },
  },
};

export interface RosterEntry extends CrewMember {
  readonly art: MascotArtSpec;
}

/** All 14 mascots in the Crew region order of `content/crew.ts`. */
export const ROSTER: readonly RosterEntry[] = CREW.map((m) => ({ ...m, art: MASCOT_ART[m.id] }));

export const ROSTER_BY_ID: Readonly<Record<MascotId, RosterEntry>> = Object.fromEntries(
  ROSTER.map((m) => [m.id, m]),
) as Record<MascotId, RosterEntry>;

export function getMascot(id: MascotId): RosterEntry {
  return ROSTER_BY_ID[id];
}

/** Display height for a width, keeping the mascot's aspect (so callers reserve the right box). */
export function heightForWidth(id: MascotId, width: number): number {
  const { w, h } = MASCOT_ART[id].size;
  return Math.round((width * h) / w);
}
