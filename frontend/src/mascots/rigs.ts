import type { MascotId } from "./ids";

/** How one rig part is drawn and moved. `behind` parts sit under the body; the rest sit on top of it. */
export interface RigPartSpec {
  readonly behind?: boolean;
  /** CSS class suffix: `rig-move--<motion>` is defined in `styles/rig.css`. */
  readonly motion?: string;
}

/**
 * Per-part drawing and motion, keyed by manifest id. Layers are full-canvas cutouts that already line up,
 * so the only per-part data is the stacking side and which idle animation turns around the part's pivot.
 * The roster (`roster.ts`) lists which parts a mascot needs; a part missing here is drawn on top, still.
 */
export const RIG_PARTS: Readonly<Record<string, RigPartSpec>> = {
  "mini-bat/body": { motion: "bob" },
  "mini-bat/wing-l": { behind: true, motion: "flap-l" },
  "mini-bat/wing-r": { behind: true, motion: "flap-r" },
  "mini-ghost/body": { motion: "float" },
  "mini-ghost/arm-l": { motion: "wave-l" },
  "mini-ghost/arm-r": { motion: "wave-r" },
  "mini-ghost/eyes": { motion: "look" },
  "mini-ghost/mouth": { motion: "talk" },
  "wraith-director/body": { motion: "sway" },
  "wraith-director/arm-open": { motion: "wave-l" },
  "wraith-director/arm-lantern": { motion: "lantern" },
  "wraith-director/eyes": { motion: "blink" },
  "doctor-stitch/arm-needle": { motion: "needle" },
  "doctor-stitch/arm-spool": { motion: "wave-r" },
  "doctor-stitch/eyes": { motion: "blink" },
  "mummy-wrapper/arm-l": { motion: "wave-l" },
  "mummy-wrapper/arm-r": { motion: "wave-r" },
};

export function rigPartSpec(partId: string): RigPartSpec {
  return RIG_PARTS[partId] ?? {};
}

/** The part ids of a rig in paint order: behind parts first, then the body, then front parts. */
export function paintOrder(ids: readonly string[]): string[] {
  const behind = ids.filter((id) => rigPartSpec(id).behind);
  const rest = ids.filter((id) => !rigPartSpec(id).behind);
  return [...behind, ...rest];
}

export type { MascotId };
