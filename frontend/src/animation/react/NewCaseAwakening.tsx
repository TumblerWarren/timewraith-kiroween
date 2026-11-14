import { gsap } from "gsap";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReduceMotion } from "../../a11y/ReduceMotionProvider";
import spider from "../../assets/cinematic/spectral-spider.svg?raw";
import { createSpiderSounds } from "../../audio/soundEffects";

const STORAGE_KEY = "tw:new-case-awakening:v2";
const THREADS = 24;
const RINGS = 20;
type Point = { x: number; y: number };
function alreadyShown() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
// Silk junctions share uneven radials, with small variations in thread tension.
function silkPoint(index: number, radius: number, center: Point): Point {
  const spoke = index % THREADS;
  const angle = spoke / THREADS * Math.PI * 2 - Math.PI / 2 + Math.sin(spoke * 7.3) * .065;
  const tension = 1 + Math.sin(spoke * 2.7) * .065 + Math.cos(angle * 3) * .07;
  return { x: center.x + Math.cos(angle) * radius * tension, y: center.y + Math.sin(angle) * radius * .88 * tension };
}
function loopPath(points: Point[], sag = 0, closed = true): string {
  const first = points[0];
  if (!first) return "";
  const center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
  return `M${first.x},${first.y} ` + (closed ? points : points.slice(0, -1)).map((point, index) => {
    const next = points[(index + 1) % points.length] ?? first;
    const middle = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    const tension = sag * (1 + Math.sin(index * 2.3) * .4);
    return `Q${middle.x + (center.x - middle.x) * tension},${middle.y + (center.y - middle.y) * tension} ${next.x},${next.y}`;
  }).join(" ") + (closed ? " Z" : "");
}
function rectanglePoints(rect: DOMRect, origin: DOMRect): Point[] {
  const x = rect.left - origin.left;
  const y = rect.top - origin.top;
  return Array.from({ length: THREADS }, (_, i) => {
    const side = Math.floor(i / 6);
    const t = (i % 6) / 6;
    return [
      { x: x + rect.width * t, y },
      { x: x + rect.width, y: y + rect.height * t },
      { x: x + rect.width * (1 - t), y: y + rect.height },
      { x, y: y + rect.height * (1 - t) },
    ][side]!;
  });
}
export function NewCaseAwakening() {
  const { reduceMotion } = useReduceMotion();
  const [playing, setPlaying] = useState(() => !reduceMotion && !alreadyShown());
  const art = useRef<HTMLDivElement>(null);
  const replaying = useRef(false);
  const finish = useRef<() => void>(() => {});
  useEffect(() => {
    const replay = () => {
      if (reduceMotion) return;
      replaying.current = true;
      window.scrollTo({ top: 0 });
      setPlaying(true);
    };
    window.addEventListener("tw:replay-new", replay);
    return () => window.removeEventListener("tw:replay-new", replay);
  }, [reduceMotion]);
  useLayoutEffect(() => {
    const artwork = art.current;
    if (!artwork || playing || reduceMotion) return;
    const sounds = createSpiderSounds();
    let cleanup = () => {};
    const context = gsap.context(() => {
      const bounce = gsap.timeline({ repeat: -1, yoyo: true, onRepeat: () => sounds.play("bounce") })
        .to(artwork.querySelector("#spider"), { y: 18, duration: 1.6, ease: "sine.inOut" }, 0)
        .to(artwork.querySelector("#web-thread"), { scaleY: 151 / 133, svgOrigin: "320 0", duration: 1.6, ease: "sine.inOut" }, 0);
      let visible = true;
      const update = () => {
        bounce.paused(document.hidden || !visible);
        if (document.hidden || !visible) sounds.stop();
      };
      const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; update(); });
      observer.observe(artwork.querySelector(".case-spider")!);
      document.addEventListener("visibilitychange", update);
      update();
      cleanup = () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
    }, artwork);
    return () => { cleanup(); sounds.stop(); context.revert(); };
  }, [playing, reduceMotion]);
  useLayoutEffect(() => {
    const artwork = art.current;
    const root = artwork?.closest<HTMLElement>(".new-case-page");
    const content = root?.querySelector<HTMLElement>(".split");
    const heading = root?.querySelector<HTMLElement>(".page__head");
    if (!root || !artwork || !content || !heading || !playing || reduceMotion) return;
    const sounds = createSpiderSounds();
    let skipping = false;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".split > .sheet, .split__aside > *"));
    const formEdges = [...cards, ...root.querySelectorAll<HTMLElement>('.sheet input:not([type="radio"]):not([type="checkbox"]), .sheet textarea')];
    const rings = Array.from(artwork.querySelectorAll<SVGPathElement>(".case-web__ring"));
    const spokes = Array.from(artwork.querySelectorAll<SVGPathElement>(".case-web__spoke"));
    const frame = artwork.querySelector(".case-web__frame");
    const upper = artwork.querySelectorAll('[id^="leg-"][id$="-upper"]');
    const lower = artwork.querySelectorAll('[id^="leg-"][id$="-lower"]');
    const eyelids = artwork.querySelectorAll('[id^="eyelid-"]');
    const bounds = artwork.getBoundingClientRect();
    const radius = Math.min(bounds.width * .47, 340);
    const center = { x: bounds.width / 2, y: radius * .98 + 36 };
    const hangingSize = bounds.width < 650 ? 160 : 200;
    const spiderSize = artwork.querySelector(".case-spider")!.getBoundingClientRect().width;
    artwork.querySelector(".case-web")!.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    root.dataset.awakening = "playing";
    content.inert = true;
    if (replaying.current) root.querySelector<HTMLButtonElement>(".case-awakening-skip")?.focus({ preventScroll: true });
    let removeVisibilityListener = () => {};
    const context = gsap.context(() => {
      gsap.set(heading, { autoAlpha: 0 });
      gsap.set(cards, { opacity: 0 });
      gsap.set(artwork.querySelector(".case-spider"), { left: center.x, top: center.y, xPercent: -50, yPercent: -50 });
      gsap.set(upper, { rotation: 68, svgOrigin: "0 0" });
      gsap.set(lower, { rotation: -100, svgOrigin: "0 0" });
      eyelids.forEach((lid, index) => gsap.set(lid, { scaleY: 0, svgOrigin: `${index === 0 ? 299 : 341} 333` }));
      rings.forEach((ring, index) => {
        // Successive turns join into one winding capture spiral, rather than concentric polygons.
        const points = Array.from({ length: THREADS + 1 }, (_, i) => {
          const turn = (index + i / THREADS) / RINGS;
          const r = radius * (.07 + Math.pow(turn, .96) * .93 + Math.sin(turn * 19) * .009);
          return silkPoint(i, r * (1 + Math.sin((index + i / THREADS) * 1.7 + Math.sin((i % THREADS) * .9)) * .012), center);
        });
        gsap.set(ring, { attr: { d: loopPath(points, .018, false) }, strokeDasharray: 1, strokeDashoffset: 1 });
      });
      const anchorPoints = Array.from({ length: THREADS }, (_, i) => {
        const reach = i % 4 === 0 ? 1.16 + Math.sin(i * 2.1) * .035 : 1.04 + Math.sin(i * 1.9) * .012;
        return silkPoint(i, radius * reach, center);
      });
      gsap.set(frame, { attr: { d: loopPath(anchorPoints, .025) }, strokeDasharray: 1, strokeDashoffset: 1 });
      spokes.forEach((strand, i) => {
        const end = anchorPoints[i]!;
        gsap.set(strand, { attr: { d: `M${center.x},${center.y} Q${(center.x + end.x) / 2 + Math.sin(i) * 3},${(center.y + end.y) / 2} ${end.x},${end.y}` }, strokeDasharray: 1, strokeDashoffset: 1 });
      });
      const timeline = gsap.timeline();
      const complete = () => {
        content.inert = false;
        try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* Storage is optional. */ }
        setPlaying(false);
        requestAnimationFrame(() => {
          const target = document.getElementById(replaying.current ? "page-animation-replay" : "page-title");
          target?.focus({ preventScroll: true });
        });
      };
      finish.current = () => { skipping = true; sounds.stop(); timeline.progress(1); };
      const cue = (name: Parameters<typeof sounds.play>[0]) => { if (!skipping) sounds.play(name); };
      timeline.call(() => cue("weave"), [], .05)
        .call(() => cue("weave"), [], .65)
        .call(() => cue("wake"), [], 1.65)
        .call(() => cue("legs"), [], 2.1)
        .call(() => cue("legs"), [], 2.45)
        .call(() => cue("transform"), [], 3.35);
      timeline
        .to(frame, { strokeDashoffset: 0, duration: .85, ease: "power2.inOut" }, 0)
        .to(spokes, { strokeDashoffset: 0, duration: .8, stagger: .018, ease: "power2.out" }, 0)
        .to(rings, { strokeDashoffset: 0, duration: .8, stagger: .035, ease: "power2.inOut" }, .35)
        .fromTo(artwork.querySelector(".case-spider"), { opacity: 0, scale: .92 }, { opacity: 1, scale: 1, duration: .5 }, 1.2)
        .to(eyelids, { scaleY: 1, duration: .5, stagger: .1, ease: "power2.inOut" }, 1.65)
        .to(upper, { rotation: 0, duration: .9, stagger: .035, ease: "power3.out" }, 1.9)
        .to(lower, { rotation: 0, duration: .8, stagger: .035, ease: "power3.out" }, 2.1)
        .to(artwork.querySelector(".case-spider"), { left: bounds.width - hangingSize / 2, top: hangingSize / 2, scale: hangingSize / spiderSize, duration: 1.25, ease: "power3.inOut" }, 3.1)
        .fromTo(artwork.querySelector(".case-spider #web"), { opacity: 0 }, { opacity: .45, duration: .7 }, 3.65)
        .to([...spokes, frame], { opacity: 0, duration: .8 }, 3.3);
      // Matching commands let curved silk straighten into the actual card boundaries.
      rings.forEach((ring, index) => {
        const edgeIndex = index % formEdges.length;
        const rectangle = rectanglePoints(formEdges[edgeIndex]!.getBoundingClientRect(), bounds);
        rectangle.push(rectangle[0]!);
        timeline.to(ring, { attr: { d: loopPath(rectangle, 0, false) }, duration: 1.25, ease: "power3.inOut" }, 3.35 + (edgeIndex % 3) * .09);
      });
      timeline
        .to(cards, { opacity: 1, duration: .75, stagger: .12, ease: "power2.inOut" }, 4.2)
        .to(rings, { opacity: 0, duration: .45 }, 4.7)
        .to(heading, { autoAlpha: 1, duration: .45, ease: "power2.out" }, 5.15)
        .call(complete);
      const visibility = () => { timeline.paused(document.hidden); if (document.hidden) sounds.stop(); };
      document.addEventListener("visibilitychange", visibility);
      removeVisibilityListener = () => document.removeEventListener("visibilitychange", visibility);
      timeline.eventCallback("onComplete", removeVisibilityListener);
      visibility();
    }, artwork);
    return () => {
      removeVisibilityListener();
      sounds.stop();
      context.revert();
      content.inert = false;
      delete root.dataset.awakening;
    };
  }, [playing, reduceMotion]);
  return <>
    <div ref={art} className="case-awakening-art" data-phase={playing && !reduceMotion ? "playing" : "hanging"} aria-hidden="true">
      {playing && !reduceMotion && <svg className="case-web" viewBox="0 0 1000 700" preserveAspectRatio="none">
        <path className="case-web__frame" pathLength="1" strokeWidth="1.8" />
        {Array.from({ length: THREADS }, (_, i) => <path key={`spoke-${i}`} className="case-web__spoke" pathLength="1" strokeWidth={i % 4 === 0 ? 2.2 : .95 + (i % 3) * .16} />)}
        {Array.from({ length: RINGS }, (_, i) => <path key={`ring-${i}`} className="case-web__ring" pathLength="1" strokeWidth={.65 + (i % 4) * .17} style={{ opacity: .48 + (i % 4) * .12 }} />)}
      </svg>}
      <div className="case-spider" dangerouslySetInnerHTML={{ __html: spider }} />
    </div>
    {playing && !reduceMotion && <button className="case-awakening-skip" type="button" onClick={() => finish.current()}>Skip animation</button>}
  </>;
}
