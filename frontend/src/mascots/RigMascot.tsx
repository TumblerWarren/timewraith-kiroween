import type { CSSProperties } from "react";
import type { RigRenderProps } from "../assets/Art";
import { useAssets } from "../assets/AssetProvider";
import { entryUrl } from "../assets/urls";
import { MASCOT_ART } from "./roster";
import { paintOrder, rigPartSpec } from "./rigs";

/**
 * A mascot built from stacked part layers. Each layer is a full-canvas image, so they are stacked at
 * 1:1 and each part rotates about its own pivot (the contact point with the body).
 */
export function RigMascot({ mascot, width, height, decorative, label, className }: RigRenderProps) {
  const { manifest, resolveUrl } = useAssets();
  const ids = paintOrder(MASCOT_ART[mascot].rig);
  // Fit the layer canvas inside the reserved box, feet on the floor, so pivots (fractions of the canvas) stay true.
  const bodyDisplay = manifest.assets[ids.find((id) => id.endsWith("/body")) ?? ids[0] ?? ""]?.display;
  const ratio = bodyDisplay && bodyDisplay.w > 0 && bodyDisplay.h > 0 ? bodyDisplay.w / bodyDisplay.h : width / height;
  const stageW = Math.min(width, height * ratio);
  const stageH = stageW / ratio;
  const rootClass = className ? `rig ${className}` : "rig";
  return (
    <div
      className={rootClass}
      style={{ width, height, aspectRatio: `${width} / ${height}` }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      data-art="rig"
      data-mascot={mascot}
    >
      <div className="rig-stage" style={{ width: stageW, height: stageH }}>
      {ids.map((id) => {
        const entry = manifest.assets[id];
        const url = entryUrl(entry, resolveUrl);
        if (!url) return null;
        const spec = rigPartSpec(id);
        const px = Math.round((entry?.pivot?.x ?? 0.5) * 1000) / 10;
        const py = Math.round((entry?.pivot?.y ?? 0.5) * 1000) / 10;
        const style = { "--px": `${px}%`, "--py": `${py}%` } as CSSProperties;
        const part = id.slice(id.indexOf("/") + 1);
        return (
          <img
            key={id}
            className={spec.motion ? `rig-part rig-move--${spec.motion}` : "rig-part"}
            src={url}
            alt=""
            draggable={false}
            decoding="async"
            data-part={part}
            style={style}
          />
        );
      })}
      </div>
    </div>
  );
}
