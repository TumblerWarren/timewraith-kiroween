import { gsap } from "gsap";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import atlas from "../../assets/characters/bat-scout-v2/parts.png";
import "../../styles/findings-bat.css";

function BatArt() {
  return (
    <svg viewBox="0 0 640 420" aria-hidden="true" focusable="false">
      <g className="findings-bat__wing-left">
        <svg x="40" y="195" width="277.2" height="156.8" viewBox="470 360 495 280" overflow="hidden">
          <image href={atlas} width="1536" height="1024" />
        </svg>
      </g>
      <g className="findings-bat__wing-right">
        <svg x="343" y="195" width="266" height="156.8" viewBox="1030 360 475 280" overflow="hidden">
          <image href={atlas} width="1536" height="1024" />
        </svg>
      </g>
      <g className="findings-bat__body">
        <svg x="240" y="60" width="161.25" height="270.9" viewBox="75 180 375 630" overflow="hidden">
          <image href={atlas} width="1536" height="1024" />
        </svg>
      </g>
    </svg>
  );
}

/** A screen-space flight ends at the real card position, then hands over to its perched sprite. */
export function FindingsBat({ flightDelay = 0 }: { readonly flightDelay?: number }) {
  const perch = useRef<HTMLSpanElement>(null);
  const flight = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const target = perch.current;
    const moving = flight.current;
    if (!target || !moving) return;
    let disposed = false;
    let started = false;
    let visible = false;
    let settling = false;
    let timeline: gsap.core.Timeline | undefined;
    let folding: Animation[] = [];
    const anchor = { x: 0, y: 0, width: 0, height: 0 };
    const pose = { x: 0, y: 0, rotation: -10, scale: 1 };
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => {
      const siteChoice = document.documentElement.dataset.reduceMotion;
      return siteChoice === undefined ? (preference?.matches ?? false) : siteChoice === "true";
    };
    const land = () => {
      gsap.ticker.remove(renderFlight);
      timeline?.kill();
      folding.forEach((animation) => animation.cancel());
      folding = [];
      gsap.set(moving, { autoAlpha: 0 });
      target.dataset.phase = "landed";
    };
    const renderFlight = (_time: number, deltaMs: number) => {
      if (disposed || document.hidden) return;
      const box = target.getBoundingClientRect();
      // Follow the card with a little inertia, including scroll containers and layout shifts.
      const follow = 1 - Math.exp(-Math.min(deltaMs, 64) / 80);
      anchor.x += (box.left - anchor.x) * follow;
      anchor.y += (box.top - anchor.y) * follow;
      if (box.width !== anchor.width || box.height !== anchor.height) {
        anchor.width = box.width;
        anchor.height = box.height;
        gsap.set(moving, { width: box.width, height: box.height });
      }
      gsap.set(moving, {
        x: anchor.x + pose.x, y: anchor.y + pose.y,
        rotation: pose.rotation, scale: pose.scale,
      });
      // Hand over only once the flying sprite has caught its actual perch.
      if (settling && Math.hypot(box.left - anchor.x, box.top - anchor.y) < .35) land();
    };
    const start = () => {
      if (disposed || started || document.hidden) return;
      const box = target.getBoundingClientRect();
      if (box.width === 0) return;
      started = true;
      if (reduced()) { land(); return; }
      target.dataset.phase = "flying";
      moving.dataset.phase = "flying";
      Object.assign(anchor, { x: box.left, y: box.top, width: box.width, height: box.height });
      Object.assign(pose, {
        x: -box.width - 30 - box.left,
        y: Math.max(90, box.top - 160) - box.top,
        rotation: -10, scale: 1,
      });
      gsap.set(moving, {
        x: anchor.x + pose.x,
        y: anchor.y + pose.y,
        width: box.width,
        height: box.height,
        rotation: -10,
        scale: 1,
        autoAlpha: 1,
      });
      gsap.ticker.add(renderFlight);
      timeline = gsap.timeline({ delay: flightDelay })
        .to(pose, { x: innerWidth * .32 - box.left, y: Math.max(90, box.top - 110) - box.top, rotation: 9, duration: .7, ease: "power1.in" })
        .to(pose, { x: -70, y: -35, rotation: -7, duration: .75, ease: "power1.out" })
        .to(pose, {
          x: 0, y: 0, rotation: 0, scale: 1.35, duration: .45, ease: "power2.out",
          onStart: () => {
            const wings = [moving.querySelector(".findings-bat__wing-left"), moving.querySelector(".findings-bat__wing-right")];
            const transforms = wings.map((wing) => wing ? getComputedStyle(wing).transform : "none");
            moving.dataset.phase = "landing";
            folding = wings.flatMap((wing, index) => wing ? [
              wing.animate([
                { transform: transforms[index] },
                { transform: `rotate(${index === 0 ? -65 : 65}deg) scale(.5, .75)` },
              ], { duration: 350, easing: "cubic-bezier(.22, 1, .36, 1)" }),
            ] : []);
          },
        })
        .to(pose, { y: 4, duration: .1, ease: "power1.in" })
        .to(pose, { y: 0, duration: .15, ease: "power1.out" })
        .call(() => { settling = true; });
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      target.dataset.paused = String(!visible || document.hidden);
      if (visible) start();
    }, { threshold: .5 });
    const image = new Image();
    image.src = atlas;
    const ready = () => {
      if (disposed) return;
      if (observer) observer.observe(target);
      else { visible = true; start(); }
    };
    if (typeof image.decode === "function") void image.decode().then(ready, ready);
    else if (image.complete) ready();
    else { image.onload = ready; image.onerror = ready; }
    const settingsChanged = () => {
      if (reduced()) { started = true; land(); }
    };
    const visibilityChanged = () => {
      timeline?.paused(document.hidden);
      folding.forEach((animation) => document.hidden ? animation.pause() : animation.play());
      moving.dataset.paused = String(document.hidden);
      target.dataset.paused = String(document.hidden || !visible);
      if (!document.hidden && visible) start();
    };
    const settings = new MutationObserver(settingsChanged);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    preference?.addEventListener("change", settingsChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    settingsChanged();
    visibilityChanged();
    return () => {
      disposed = true;
      gsap.ticker.remove(renderFlight);
      timeline?.kill();
      folding.forEach((animation) => animation.cancel());
      gsap.killTweensOf(moving);
      observer?.disconnect();
      settings.disconnect();
      preference?.removeEventListener("change", settingsChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [flightDelay]);

  return (
    <>
      <span ref={perch} className="findings-bat" data-phase="waiting" aria-hidden="true">
        <BatArt />
      </span>
      {createPortal(
        <span ref={flight} className="findings-bat-flight" data-phase="waiting" aria-hidden="true"><BatArt /></span>,
        document.body,
      )}
    </>
  );
}
