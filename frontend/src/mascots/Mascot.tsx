import { useEffect, useId } from "react";
import { useDirectorHost } from "../animation/react/directorHost";
import { Art, type ArtProps } from "../assets/Art";
import { createMascotActor, scopedActorId } from "./actors";
import type { MascotId } from "./ids";
import { RigMascot } from "./RigMascot";
import { heightForWidth, MASCOT_ART } from "./roster";

export interface MascotProps extends Omit<ArtProps, "mascot" | "width" | "height"> {
  readonly id: MascotId;
  /** CSS px. Defaults to the roster size; the height always follows the mascot's aspect. */
  readonly width?: number;
  /**
   * Actor id in the director's registry. Defaults to `"{region}:{mascot}"` from where the figure stands
   * (see `mascots/actors.ts`); `false` registers nothing (pooled overlay bats).
   */
  readonly actor?: string | false;
  /** Idle breathing and sway (CSS, ambient only). On by default; off for figures with their own loop. */
  readonly idle?: boolean;
}

/**
 * A mascot at its roster size (or a given width). The name is the accessible name unless the figure is
 * `decorative`, which is for places that already show the name as text next to it.
 * Inside a DirectorProvider it registers an actor controller, so effects can pose it.
 */
export function Mascot({ id, width, actor, idle = true, className, ...rest }: MascotProps) {
  const w = width ?? MASCOT_ART[id].size.w;
  const host = useDirectorHost();
  // A per-instance class finds the rendered root (img or svg) without changing Art's API.
  const actorClass = `tw-actor-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  useEffect(() => {
    if (!host || actor === false) return;
    const find = () => document.querySelector(`.${actorClass}`);
    const el = find();
    if (!el) return;
    return host.actors.register(actor ?? scopedActorId(el, id), createMascotActor(find, host.animator, id));
  }, [host, actor, actorClass, id]);
  return <Art mascot={id} width={w} height={heightForWidth(id, w)} className={[className, actorClass, idle && actor !== false ? `mascot-idle mascot-idle--${idleVariant(actorClass + id)}` : ""].filter(Boolean).join(" ")} renderRig={(p) => <RigMascot {...p} />} {...rest} />;
}

/** One of four seeded idle timings, so figures never breathe in step. */
function idleVariant(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 4;
}
