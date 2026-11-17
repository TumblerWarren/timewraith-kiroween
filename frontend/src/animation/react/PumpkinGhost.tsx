import { useEffect, useRef } from "react";
import atlas from "../../assets/characters/pumpkin-ghost-v1/parts.png";
import arms from "../../assets/characters/pumpkin-ghost-v1/conductor-arms.png";
import "../../styles/pumpkin-ghost.css";

const PARTS = {
  head: [70, 20, 395, 410],
  body: [600, 12, 300, 500],
  leftHem: [545, 535, 400, 475],
  rightHem: [1060, 530, 440, 480],
} as const;

function Piece({ part, x, y, scale }: {
  readonly part: keyof typeof PARTS;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}) {
  const [sourceX, sourceY, width, height] = PARTS[part];
  return (
    <svg x={x} y={y} width={width * scale} height={height * scale}
      viewBox={`${sourceX} ${sourceY} ${width} ${height}`} overflow="hidden">
      <image href={atlas} width="1536" height="1024" />
    </svg>
  );
}

/** The viewer-left arm is the character's right arm; both palms face outwards. */
export function PumpkinGhost({ state = "planning", orchestrated = false }: {
  readonly state?: "planning" | "review" | "complete";
  readonly orchestrated?: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let visible = false;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => {
      const siteChoice = document.documentElement.dataset.reduceMotion;
      element.dataset.reduced = String(siteChoice === undefined ? (preference?.matches ?? false) : siteChoice === "true");
      element.dataset.paused = String(document.hidden || !visible);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      update();
    });
    if (observer) observer.observe(element);
    else visible = true;
    const settings = new MutationObserver(update);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    preference?.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      settings.disconnect();
      preference?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <span ref={root} className="pumpkin-ghost" data-state={state} data-orchestrated={orchestrated} data-paused="true">
      <svg viewBox="0 0 640 760" role="img" aria-label="Pumpkin ghost orchestrating the experiments" focusable="false">
        <g className="pumpkin-ghost__float">
          <g className="pumpkin-ghost__emergence">
          <g className="pumpkin-ghost__arm-left">
            <svg x="38" y="109" width="198" height="255" viewBox="40 100 660 850" overflow="hidden">
              <image href={arms} width="1536" height="1024" />
            </svg>
          </g>
          <g className="pumpkin-ghost__arm-right">
            <svg x="364" y="110.5" width="204" height="255" viewBox="830 105 680 850" overflow="hidden">
              <image href={arms} width="1536" height="1024" />
            </svg>
          </g>
          <g className="pumpkin-ghost__hem-left"><Piece part="leftHem" x={130} y={490} scale={.5} /></g>
          <g className="pumpkin-ghost__hem-right"><Piece part="rightHem" x={300} y={490} scale={.5} /></g>
          <Piece part="body" x={190} y={250} scale={.72} />
          </g>
          <g className="pumpkin-ghost__head"><Piece part="head" x={170} y={0} scale={.64} /></g>
        </g>
      </svg>
    </span>
  );
}
