/**
 * The 14 Mascot ids (Requirement 4.1; Doctor Stitch joined in decision D15). This module is the single source of
 * truth for the id union. `content/crew.ts` re-exports `MASCOT_IDS` and `MascotId` so older imports keep working.
 * It has no imports, so nothing in `content/`, `assets/` or `mascots/` can form a cycle through it.
 */
export const MASCOT_IDS = [
  "wraith-director",
  "watchtower-warden",
  "bat-scout",
  "pumpkin-mechanic",
  "raven-archivist",
  "doctor-stitch",
  "gargoyle-gatekeeper",
  "cauldron-cat",
  "spider-weaver",
  "mummy-wrapper",
  "two-faced-jack",
  "skeleton-scribe",
  "mini-bat",
  "mini-ghost",
] as const;

export type MascotId = (typeof MASCOT_IDS)[number];

export function isMascotId(value: unknown): value is MascotId {
  return typeof value === "string" && (MASCOT_IDS as readonly string[]).includes(value);
}
