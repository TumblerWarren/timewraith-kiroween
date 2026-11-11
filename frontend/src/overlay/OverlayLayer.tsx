import { useEffect, useRef } from "react";
import { useDirectorHost } from "../animation/react/directorHost";
import { GhostCompanion } from "../thread/GhostCompanion";
import { BatPool } from "./BatPool";

/**
 * Overlay_Layer (tasks 11.3 and 12.4): fixed, full viewport, `pointer-events: none`, z-index 40 (below the ledges
 * at 45, the node anchors at 46 and the header at 50). It hosts the Mini Ghost, the bat pool and the static marks
 * that Reduce Motion fallbacks draw. Never focusable, hidden from assistive technology.
 */
export function OverlayLayer() {
  const host = useDirectorHost();
  const marksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = marksRef.current;
    if (!host || !el) return;
    return host.overlay.attach(el);
  }, [host]);

  return (
    <div className="overlay-layer" data-overlay="" aria-hidden="true">
      <GhostCompanion />
      <BatPool />
      <div ref={marksRef} className="overlay-layer__marks" />
    </div>
  );
}
