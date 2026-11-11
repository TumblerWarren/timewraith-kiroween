import type { ReactNode } from "react";
import { CREW_BY_ID } from "../content/crew";
import type { MascotId } from "../mascots/ids";
import { PlaceholderMascot } from "../mascots/placeholder/PlaceholderMascot";
import { MASCOT_ART } from "../mascots/roster";
import { useAssets, useMascotArtLevel } from "./AssetProvider";
import { entryUrl } from "./urls";

export interface RigRenderProps {
  readonly mascot: MascotId;
  readonly width: number;
  readonly height: number;
  readonly decorative: boolean;
  readonly label: string;
  readonly eager: boolean;
  readonly className?: string;
}

export interface ArtProps {
  readonly mascot: MascotId;
  /** CSS px. Required, with `height`, so the box is reserved before any image loads (CLS, Requirement 18.3). */
  readonly width: number;
  readonly height: number;
  /**
   * Decorative art gets `alt=""` (and the placeholder is hidden from assistive technology). Informative
   * art (default) gets alt text: `alt`, else the manifest alt, else the mascot's real name (Requirement 11.4).
   */
  readonly decorative?: boolean;
  readonly alt?: string;
  /** True only in the Hero. Everything else is `loading="lazy"` (Requirement 18.2). */
  readonly eager?: boolean;
  readonly className?: string;
  /**
   * Renders the layered rig (Tier 1) when the manifest says every part passes. The rig component is
   * built in a later task; until one is passed in, a `rig` result is drawn from the pose image instead.
   */
  readonly renderRig?: (props: RigRenderProps) => ReactNode;
}

/**
 * One mascot, drawn at the best level the manifest allows: rig, then pose, then placeholder
 * (Requirement 4.8). The reserved box is identical at every level, so a fallback never shifts layout.
 */
export function Art({ mascot, width, height, decorative = false, alt, eager = false, className, renderRig }: ArtProps) {
  const { manifest, resolveUrl } = useAssets();
  const level = useMascotArtLevel(mascot);
  const name = CREW_BY_ID[mascot].name;

  if (level === "rig" && renderRig) {
    return <>{renderRig({ mascot, width, height, decorative, label: alt ?? name, eager, className })}</>;
  }

  if (level === "rig" || level === "pose") {
    const poseEntry = manifest.assets[MASCOT_ART[mascot].pose];
    const url = poseEntry?.status === "pass" ? entryUrl(poseEntry, resolveUrl) : undefined;
    if (url) {
      const manifestAlt = typeof poseEntry?.alt === "string" && poseEntry.alt.trim() !== "" ? poseEntry.alt : undefined;
      // The real cutout's aspect can differ from the roster box (the Wraith is 122 x 200 in a 160 x 200 box). The
      // inline aspect-ratio keeps the reserved box after load (CSS `height: auto` would switch to the image's own
      // ratio), and object-fit: contain (components.css) anchors the figure at its pivot, feet on the ground.
      const pivot = poseEntry?.pivot;
      const position = pivot ? `${Math.round(pivot.x * 100)}% ${Math.round(pivot.y * 100)}%` : "50% 100%";
      return (
        <img
          className={className ? `art-pose ${className}` : "art-pose"}
          src={url}
          width={width}
          height={height}
          style={{ aspectRatio: `${width} / ${height}`, objectPosition: position }}
          alt={decorative ? "" : (alt ?? manifestAlt ?? name)}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          data-art="pose"
          data-mascot={mascot}
        />
      );
    }
  }

  return <PlaceholderMascot id={mascot} width={width} height={height} decorative={decorative} label={alt} className={className} />;
}
