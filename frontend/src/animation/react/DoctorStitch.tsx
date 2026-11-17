import { useEffect, useRef } from "react";
import atlas from "../../assets/characters/doctor-stitch-v2/parts.png";
import lowerBody from "../../assets/characters/doctor-stitch-v2/lower-body.png";
import "../../styles/doctor-stitch.css";

export type DoctorStitchState = "working" | "verified" | "approved" | "rest";

const PARTS = {
  torso: [618, 115, 292, 395],
  head: [1059, 56, 459, 421],
  needle: [107, 540, 316, 445],
  spool: [586, 636, 391, 309],
  patch: [1139, 662, 280, 231],
} as const;

function Piece({ part, x, y, scale = .65 }: {
  readonly part: keyof typeof PARTS;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
}) {
  const [sourceX, sourceY, width, height] = PARTS[part];
  return (
    <svg x={x} y={y} width={width * scale} height={height * scale}
      viewBox={`${sourceX} ${sourceY} ${width} ${height}`} overflow="hidden">
      <image href={atlas} width="1536" height="1024" />
    </svg>
  );
}

/** An articulated character with motion driven by the fix's current state. */
export function DoctorStitch({ state = "working", className = "", reducedMotion }: {
  readonly state?: DoctorStitchState;
  readonly className?: string;
  readonly reducedMotion?: boolean;
}) {
  const root = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let visible = true;
    let frame = 0;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const needle = element.querySelector<SVGGElement>(".doctor-stitch__needle");
    const spool = element.querySelector<SVGGElement>(".doctor-stitch__spool");
    const thread = element.querySelector<SVGPathElement>(".doctor-stitch__thread");
    const tick = () => {
      if (typeof element.getCTM !== "function") return;
      if (state === "approved" && thread && getComputedStyle(thread).opacity === "0") return;
      const rootMatrix = element.getCTM();
      const needleMatrix = needle?.getCTM();
      const spoolMatrix = spool?.getCTM();
      if (rootMatrix && needleMatrix && spoolMatrix && thread) {
        const inverse = rootMatrix.inverse();
        const from = new DOMPoint(40, 267).matrixTransform(needleMatrix).matrixTransform(inverse);
        const to = new DOMPoint(489, 286).matrixTransform(spoolMatrix).matrixTransform(inverse);
        thread.setAttribute("d", `M${from.x} ${from.y} C${from.x + 40} ${from.y + 80} 380 415 452 350 S485 315 ${to.x} ${to.y}`);
      }
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      const paused = document.hidden || !visible;
      element.dataset.paused = String(paused);
      cancelAnimationFrame(frame);
      const siteChoice = document.documentElement.dataset.reduceMotion;
      const reduced = reducedMotion ?? (siteChoice === undefined ? (preference?.matches ?? false) : siteChoice === "true");
      element.dataset.reduced = String(reduced);
      if (!paused && !reduced && (state === "working" || state === "approved")) {
        frame = requestAnimationFrame(tick);
      }
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      update();
    });
    observer?.observe(element);
    document.addEventListener("visibilitychange", update);
    preference?.addEventListener("change", update);
    const settings = new MutationObserver(update);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      preference?.removeEventListener("change", update);
      settings.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [state, reducedMotion]);

  return (
    <svg ref={root} className={`doctor-stitch ${className}`} data-state={state} data-reduced={reducedMotion}
      viewBox="0 0 560 780" role="img" aria-label={`Doctor Stitch · ${state}`}>
      <g className="doctor-stitch__leg-left">
        <svg x="155" y="475" width="131.4" height="264.6" viewBox="580 180 365 735" overflow="hidden">
          <image href={lowerBody} width="1536" height="1024" />
        </svg>
      </g>
      <g className="doctor-stitch__leg-right">
        <svg x="260" y="475" width="147.6" height="264.6" viewBox="1080 180 410 735" overflow="hidden">
          <image href={lowerBody} width="1536" height="1024" />
        </svg>
      </g>
      <g className="doctor-stitch__upper">
      <svg x="164" y="430" width="180" height="144" viewBox="60 330 500 400" overflow="hidden">
        <image href={lowerBody} width="1536" height="1024" />
      </svg>
      <g className="doctor-stitch__body">
        <Piece part="torso" x={145} y={255} />
      </g>
      <g className="doctor-stitch__head">
        <Piece part="head" x={103} y={12} />
      </g>
      <g className="doctor-stitch__spool">
        <Piece part="spool" x={285} y={262} />
        <g className="doctor-stitch__patch">
          <Piece part="patch" x={410} y={315} scale={.34} />
        </g>
      </g>
      <g className="doctor-stitch__needle">
        <Piece part="needle" x={14} y={160} />
      </g>
      <g className="doctor-stitch__silk" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path className="doctor-stitch__thread" d="M40 267 C80 347 380 415 452 350 S485 315 489 286" />
        <path className="doctor-stitch__seam" d="m451 349 8-5m-2 11 8-5m-2 11 8-5" />
      </g>
      </g>
    </svg>
  );
}
