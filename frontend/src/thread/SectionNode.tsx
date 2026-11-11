import type { MouseEvent } from "react";
import { useBatTravel } from "../animation/react/useBatFlights";
import { nodeAriaLabel, SECTION_NODES, type SectionNodeDef } from "../content/nodes";
import { useThread } from "./ThreadProvider";

export interface SectionNodeProps {
  readonly node: SectionNodeDef;
  /** Position in `<main>` coordinates (the anchor). */
  readonly x: number;
  readonly y: number;
  readonly active: boolean;
  readonly onTravel?: (el: Element) => void;
}

/**
 * One Section_Node (task 11.2): a native anchor to the region with its dated stamp, sitting on the thread at the
 * region's anchor (z-index 46, above the ledge). Keyboard, focus and scrolling come from the anchor itself; the
 * click also sends the Mini Bat to the node (`bat.travel`). The active node has a filled ring and `aria-current`.
 */
export function SectionNode({ node, x, y, active, onTravel }: SectionNodeProps) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => onTravel?.(e.currentTarget.querySelector(".thread-node__ring") ?? e.currentTarget);
  return (
    <a
      className="thread-node"
      href={`#${node.id}`}
      aria-label={nodeAriaLabel(node)}
      aria-current={active ? "location" : undefined}
      data-node={node.id}
      data-theme={node.theme}
      style={{ left: `${Math.round(x)}px`, top: `${Math.round(y)}px` }}
      onClick={onClick}
    >
      <svg className="thread-node__ring" viewBox="0 0 28 28" width={28} height={28} aria-hidden="true" focusable="false">
        <circle className="thread-node__outer" cx={14} cy={14} r={11} />
        <circle className="thread-node__dot" cx={14} cy={14} r={6} />
      </svg>
      <span className="thread-node__stamp mono" aria-hidden="true">
        {node.stamp}
      </span>
    </a>
  );
}

const DEF_BY_ID = new Map(SECTION_NODES.map((n) => [n.id as string, n]));

/** All Section_Nodes at their measured anchors. */
export function SectionNodes() {
  const thread = useThread();
  const travel = useBatTravel();
  if (!thread) return null;
  return (
    // A plain list, not a second nav landmark: the header nav is the board's navigation.
    <div className="thread-nodes" data-thread-nodes="">
      <ol className="thread-nodes__list" role="list" aria-label="Board timeline">
        {thread.measure.nodes.map((n, i) => {
          const def = DEF_BY_ID.get(n.id);
          if (!def) return null;
          return (
            <li key={n.id}>
              <SectionNode node={def} x={n.x} y={n.y} active={i === thread.active} onTravel={travel} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
