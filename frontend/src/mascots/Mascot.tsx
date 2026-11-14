import { useId } from "react";
import { Art, type ArtProps } from "../assets/Art";
import type { MascotId } from "./ids";
import { RigMascot } from "./RigMascot";
import { heightForWidth, MASCOT_ART } from "./roster";

export interface MascotProps extends Omit<ArtProps, "mascot" | "width" | "height"> {
  readonly id: MascotId;
  /** CSS px. Defaults to the roster size; the height always follows the mascot's aspect. */
  readonly width?: number;
  /** Idle breathing and sway (CSS, ambient only). On by default; off for figures with their own loop. */
  readonly idle?: boolean;
}

/**
 * A mascot at its roster size (or a given width). The name is the accessible name unless the figure is
 * `decorative`, which is for places that already show the name as text next to it.
 */
export function Mascot({ id, width, idle = true, className, ...rest }: MascotProps) {
  const w = width ?? MASCOT_ART[id].size.w;
  const seed = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <Art
      mascot={id}
      width={w}
      height={heightForWidth(id, w)}
      className={[className, idle ? `mascot-idle mascot-idle--${idleVariant(seed + id)}` : ""].filter(Boolean).join(" ")}
      renderRig={(p) => <RigMascot {...p} />}
      {...rest}
    />
  );
}

/** One of four seeded idle timings, so figures never breathe in step. */
function idleVariant(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 4;
}
