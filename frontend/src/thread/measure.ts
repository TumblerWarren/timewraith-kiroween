import type { Anchor } from "./geometry";

/** Each region's `.rail` carries `data-thread-anchor`; the node sits this far below the rail's top edge. */
export const ANCHOR_SELECTOR = "[data-thread-anchor]";
export const ANCHOR_OFFSET_PX = 28;

export interface MeasuredNode extends Anchor {
  /** Region id (the closest `section[id]`). */
  readonly id: string;
}

export interface ThreadMeasure {
  readonly nodes: readonly MeasuredNode[];
  /** `<main>` box: left in the viewport, top in page coordinates, size. */
  readonly mainLeft: number;
  readonly mainTop: number;
  readonly width: number;
  readonly height: number;
}

/** Reads every anchor in `<main>` coordinates. Pure DOM reads, no writes. */
export function measureThread(main: HTMLElement): ThreadMeasure {
  const box = main.getBoundingClientRect();
  const nodes: MeasuredNode[] = [];
  main.querySelectorAll(ANCHOR_SELECTOR).forEach((el) => {
    const r = el.getBoundingClientRect();
    const id = el.closest("section[id]")?.id ?? "";
    if (r.width === 0 && r.height === 0) return;
    nodes.push({ id, x: r.left - box.left + r.width / 2, y: r.top - box.top + Math.min(ANCHOR_OFFSET_PX, r.height / 2) });
  });
  nodes.sort((a, b) => a.y - b.y);
  return {
    nodes,
    mainLeft: box.left,
    mainTop: box.top + window.scrollY,
    width: main.clientWidth,
    height: Math.max(main.scrollHeight, box.height),
  };
}

export function sameMeasure(a: ThreadMeasure, b: ThreadMeasure): boolean {
  if (a.nodes.length !== b.nodes.length) return false;
  const close = (p: number, q: number) => Math.abs(p - q) < 0.5;
  if (!close(a.mainLeft, b.mainLeft) || !close(a.mainTop, b.mainTop) || !close(a.width, b.width) || !close(a.height, b.height)) return false;
  return a.nodes.every((n, i) => {
    const m = b.nodes[i];
    return m !== undefined && m.id === n.id && close(m.x, n.x) && close(m.y, n.y);
  });
}

/** Lead line in `<main>` coordinates for a scroll position (60% down the viewport). */
export function leadFor(scrollY: number, viewportH: number, mainTop: number, ratio: number): number {
  return scrollY + viewportH * ratio - mainTop;
}
