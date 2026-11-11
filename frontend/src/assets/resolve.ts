import { isMascotId, type MascotId } from "../mascots/ids";
import { MASCOT_ART } from "../mascots/roster";
import type { Manifest } from "./manifest";

/** The art level a mascot is drawn at (design: Fallback chain, Requirement 4.8). */
export type ArtLevel = "rig" | "pose" | "placeholder";

/** True only for an entry whose status is `pass`. `fail`, `placeholder` and missing entries are not usable. */
export function isAssetPass(manifest: Manifest | null | undefined, assetId: string): boolean {
  const entry = manifest?.assets?.[assetId];
  return entry?.status === "pass";
}

/**
 * Pick the art level for a mascot: `rig` when it has rig parts and every part passes, else `pose` when
 * its pose asset passes, else `placeholder`. Total: unknown ids, malformed or missing manifests and any
 * unexpected error all give `placeholder`. Never throws.
 */
export function resolveMascotArt(id: MascotId, manifest: Manifest | null | undefined): ArtLevel {
  try {
    if (!isMascotId(id)) return "placeholder";
    const spec = MASCOT_ART[id];
    if (spec.rig.length > 0 && spec.rig.every((part) => isAssetPass(manifest, part))) return "rig";
    if (isAssetPass(manifest, spec.pose)) return "pose";
    return "placeholder";
  } catch {
    return "placeholder";
  }
}
