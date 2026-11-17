import { gsap } from "gsap";
import { useLayoutEffect, useRef } from "react";
import whiteGhost from "../../assets/characters/run-ghost-v1/white-ghost.png";
import "../../styles/run-path-ghost.css";

export interface GhostDestination {
  readonly node: string;
  readonly sequence: number;
}

interface Axis {
  position: number;
  velocity: number;
}

// Exact critically damped motion keeps its velocity when the destination changes.
function advance(axis: Axis, target: number, seconds: number) {
  const response = 10;
  const offset = axis.position - target;
  const momentum = axis.velocity + response * offset;
  const decay = Math.exp(-response * seconds);
  axis.position = target + (offset + momentum * seconds) * decay;
  axis.velocity = (axis.velocity - response * momentum * seconds) * decay;
}

export function RunPathGhost({ selected, phase, liveNode, intent }: {
  readonly selected: string;
  readonly phase: string;
  readonly liveNode?: string;
  readonly intent: GhostDestination | null;
}) {
  const ghost = useRef<HTMLSpanElement>(null);
  const controller = useRef<{ move: (destination: string) => void } | null>(null);
  const previous = useRef<{
    selected: string;
    phase: string;
    intent: GhostDestination | null;
    destination: string;
  } | null>(null);

  useLayoutEffect(() => {
    const element = ghost.current;
    const container = element?.parentElement;
    const image = element?.querySelector("img");
    if (!container || !element || !image) return;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => {
      const choice = document.documentElement.dataset.reduceMotion;
      return choice === undefined ? preference?.matches ?? false : choice === "true";
    };
    const x: Axis = { position: 0, velocity: 0 };
    const y: Axis = { position: 0, velocity: 0 };
    const destination = { x: 0, y: 0 };
    let destinationNode: string | null = null;
    let target: HTMLElement | null = null;
    let positioned = false;
    let visible = true;
    let moving = false;
    let disposed = false;
    let rotation = 0;
    const setX = gsap.quickSetter(element, "x", "px");
    const setY = gsap.quickSetter(element, "y", "px");
    const setRotation = gsap.quickSetter(element, "rotation", "deg");
    gsap.set(element, { force3D: true });

    const paint = () => {
      setX(x.position);
      setY(y.position);
      setRotation(rotation);
    };
    const stop = () => {
      moving = false;
      element.dataset.moving = "false";
      gsap.ticker.remove(tick);
    };
    const tick = (_time: number, deltaMs: number) => {
      const seconds = Math.min(deltaMs / 1000, .05);
      advance(x, destination.x, seconds);
      const lift = Math.min(12, Math.abs(x.velocity) * .025);
      advance(y, destination.y - lift, seconds);
      const lean = Math.max(-6, Math.min(6, x.velocity * .012));
      rotation += (lean - rotation) * (1 - Math.exp(-10 * seconds));
      if (Math.abs(x.position - destination.x) < .1 && Math.abs(x.velocity) < 1
        && Math.abs(y.position - destination.y) < .1 && Math.abs(y.velocity) < 1 && Math.abs(rotation) < .05) {
        x.position = destination.x;
        y.position = destination.y;
        rotation = 0;
        x.velocity = y.velocity = 0;
        stop();
      }
      paint();
    };
    const follow = () => {
      if (moving && visible && !document.hidden) gsap.ticker.add(tick);
      else gsap.ticker.remove(tick);
    };
    const align = () => {
      if (!target) return;
      const bounds = container.getBoundingClientRect();
      const anchor = target.getBoundingClientRect();
      destination.x = anchor.left - bounds.left + anchor.width / 2 - element.offsetWidth / 2 - container.clientLeft;
      destination.y = anchor.top - bounds.top - element.offsetHeight + 4 - container.clientTop;
      if (!positioned || reduced()) {
        x.position = destination.x;
        y.position = destination.y;
        x.velocity = y.velocity = rotation = 0;
        positioned = true;
        stop();
        paint();
      } else if (Math.abs(x.position - destination.x) > .1 || Math.abs(y.position - destination.y) > .1) {
        moving = true;
        element.dataset.moving = "true";
        follow();
      }
    };
    controller.current = {
      move: (node) => {
        // A click and its hash navigation can arrive in separate React commits.
        if (node === destinationNode) return;
        target = container.querySelector<HTMLElement>(`[data-flow-node="${node}"] .case-run-graph__track`);
        if (!target) return;
        destinationNode = node;
        element.dataset.target = node;
        align();
      },
    };
    const settings = () => {
      element.dataset.reduced = String(reduced());
      if (reduced()) align();
    };
    const visibility = () => {
      element.dataset.paused = String(document.hidden || !visible);
      follow();
    };
    const ready = () => {
      if (!disposed) gsap.set(element, { autoAlpha: 1 });
    };
    image.addEventListener("load", ready);
    if (image.complete && image.naturalWidth > 0) ready();
    else if (typeof image.decode === "function") void image.decode().then(ready, () => {});
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
    resize?.observe(container);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      visibility();
    });
    observer?.observe(container);
    const motion = new MutationObserver(settings);
    motion.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    preference?.addEventListener("change", settings);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", align);
    settings();
    visibility();
    return () => {
      disposed = true;
      stop();
      controller.current = null;
      resize?.disconnect();
      observer?.disconnect();
      motion.disconnect();
      preference?.removeEventListener("change", settings);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", align);
      image.removeEventListener("load", ready);
    };
  }, []);

  useLayoutEffect(() => {
    const last = previous.current;
    let destination = last?.destination ?? liveNode ?? selected;
    if (intent && intent !== last?.intent) destination = intent.node;
    else if (last && selected !== last.selected) destination = selected;
    else if (last && phase !== last.phase && liveNode) destination = liveNode;
    previous.current = { selected, phase, intent, destination };
    controller.current?.move(destination);
  }, [selected, phase, liveNode, intent]);

  return (
    <span ref={ghost} className="case-path-ghost" aria-hidden="true">
      <span className="case-path-ghost__float"><img src={whiteGhost} alt="" draggable={false} decoding="async" /></span>
    </span>
  );
}
