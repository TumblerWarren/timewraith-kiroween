import { useThread } from "./ThreadProvider";

/** Placeholder beam until `scenery/ledge-foreground` exists: a crooked walnut plank with a gold trim line. */
const PLANK = "M2 5 L18 3 L40 4.5 L62 2.5 L78 4 L78 12 L58 13.5 L36 12 L14 13.5 L2 12 Z";
const TRIM = "M5 6 L22 4.8 L42 6 L60 4.4 L75 5.6";

/**
 * Ledge occlusion (task 11.3, design "Ledge occlusion"): a wooden ledge under every Section_Node at z-index 45,
 * above the Overlay_Layer (40) and below the node anchors (46) and the header (50). The Mini Ghost lives in the
 * fixed overlay, so as the page scrolls each ledge passes in front of it. Decorative: `aria-hidden`, no pointer events.
 */
export function LedgeLayer() {
  const thread = useThread();
  if (!thread) return null;
  return (
    <div className="ledge-layer" aria-hidden="true" data-ledges="">
      {thread.measure.nodes.map((n) => (
        <svg
          key={n.id}
          className="ledge"
          data-ledge={n.id}
          viewBox="0 0 80 16"
          width={80}
          height={16}
          focusable="false"
          style={{ left: `${Math.round(n.x)}px`, top: `${Math.round(n.y)}px` }}
        >
          <path className="ledge__plank" d={PLANK} />
          <path className="ledge__trim" d={TRIM} />
        </svg>
      ))}
    </div>
  );
}
