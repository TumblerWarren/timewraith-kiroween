import { useEffect, useRef } from "react";
import { drawnLength, type ThreadModel } from "./geometry";
import { useThread } from "./ThreadProvider";

/**
 * Timeline_Thread ink (task 11.2): one SVG over `<main>` (absolute, `pointer-events: none`, `contain: layout paint`)
 * holding the main stroke and its echo. Both draw with `stroke-dasharray` / `stroke-dashoffset`, written directly
 * to the DOM on every `leadY` change, so scrolling never re-renders React and never shifts layout.
 * Main stroke gold-500 (reads on night and dusk), echo ink-900 (reads on dawn). No SVG filters.
 */
export function ThreadLayer() {
  const thread = useThread();
  const mainRef = useRef<SVGPathElement>(null);
  const echoRef = useRef<SVGPathElement>(null);
  const model = thread?.model;
  const leadY = thread?.leadY;

  useEffect(() => {
    if (!model || !leadY) return;
    const paths = [mainRef.current, echoRef.current].filter((p): p is SVGPathElement => p !== null);
    const lengths = paths.map((p) => {
      let len = model.totalLength;
      try {
        len = p.getTotalLength() || model.totalLength;
      } catch {
        // jsdom has no geometry; the model's length is close enough.
      }
      p.style.strokeDasharray = `${len} ${len}`;
      return len;
    });
    const draw = (lead: number) => writeDash(model, paths, lengths, lead);
    draw(leadY.get());
    return leadY.on("change", draw);
  }, [model, leadY]);

  if (!thread || !model || model.d === "") return null;
  const { width, height } = thread.measure;
  return (
    <svg
      className="thread-layer"
      data-thread=""
      data-thread-mode={thread.mode}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <path ref={echoRef} className="thread-layer__echo" d={model.echoD} data-thread-path="echo" />
      <path ref={mainRef} className="thread-layer__ink" d={model.d} data-thread-path="main" />
    </svg>
  );
}

/** Dash offset for each path: hidden length = path length x (1 - drawn / model length). */
export function writeDash(model: ThreadModel, paths: readonly SVGPathElement[], lengths: readonly number[], lead: number): void {
  const total = model.totalLength;
  const progress = total > 0 ? drawnLength(model, lead) / total : 1;
  paths.forEach((p, i) => {
    const len = lengths[i] ?? total;
    p.style.strokeDashoffset = String(Math.round(len * (1 - progress) * 100) / 100);
  });
}
