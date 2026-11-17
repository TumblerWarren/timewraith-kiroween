import { gsap } from "gsap";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PumpkinGhost } from "./PumpkinGhost";

/** The pumpkin releases its ghost, whose first conducting gesture reveals the plan. */
export function PlanOrchestration({ children, title, headingId, state }: {
  readonly children: ReactNode;
  readonly title: string;
  readonly headingId: string;
  readonly state: "planning" | "review" | "complete";
}) {
  const root = useRef<HTMLDivElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const [replay, setReplay] = useState(0);

  useLayoutEffect(() => {
    const stage = root.current;
    if (!stage) return;
    const head = stage.querySelector(".pumpkin-ghost__head");
    const emergence = stage.querySelector(".pumpkin-ghost__emergence");
    const left = stage.querySelector(".pumpkin-ghost__arm-left");
    const right = stage.querySelector(".pumpkin-ghost__arm-right");
    if (!head || !emergence || !left || !right) return;
    const parts = [head, emergence, left, right];
    const cards = Array.from(stage.querySelectorAll<HTMLElement>(".plan-stage__cards > ol > .case-card"));
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let visible = typeof IntersectionObserver === "undefined";
    let loaded = false;
    let started = false;
    let disposed = false;
    let timeline: gsap.core.Timeline | undefined;
    const reduced = () => {
      const choice = document.documentElement.dataset.reduceMotion;
      return choice === undefined ? (preference?.matches ?? false) : choice === "true";
    };
    const clear = () => gsap.set([...parts, ...cards], { clearProps: "all" });
    const finish = () => {
      if (disposed) return;
      started = true;
      timeline?.kill();
      clearTimeout(loadDeadline);
      const restoreFocus = document.activeElement === stage.querySelector(".plan-stage__skip");
      clear();
      stage.dataset.phase = "ready";
      if (restoreFocus) stage.querySelector<HTMLButtonElement>(".plan-stage__replay")?.focus({ preventScroll: true });
    };
    finishRef.current = finish;
    const start = () => {
      if (disposed || started || !loaded || !visible || document.hidden) return;
      started = true;
      stage.dataset.phase = "pumpkin";
      timeline = gsap.timeline({ onComplete: finish })
        .to(head, { autoAlpha: 1, scale: .82, duration: .3, ease: "power2.out" })
        .to(head, { rotation: 5, duration: .12, repeat: 1, yoyo: true }, .25)
        .call(() => { stage.dataset.phase = "emerging"; }, [], .5)
        .to(head, { y: 0, scale: 1, rotation: 0, duration: .75, ease: "power3.out" }, .5)
        .to(emergence, { y: 0, scale: 1, autoAlpha: 1, duration: .9, ease: "power3.out" }, .5)
        .call(() => { stage.dataset.phase = "conducting"; }, [], 1.15)
        .to(left, { rotation: 0, scale: 1, duration: .5, ease: "power2.out" }, 1.1)
        .to(right, { rotation: 0, scale: 1, duration: .5, ease: "power2.out" }, 1.15)
        .to(left, { rotation: 14, duration: .25, ease: "sine.inOut" }, 1.6)
        .to(right, { rotation: -14, duration: .25, ease: "sine.inOut" }, 1.6)
        .call(() => { stage.dataset.phase = "revealing"; }, [], 1.85)
        .to(left, { rotation: -6, duration: .45, ease: "power2.out" }, 1.85)
        .to(right, { rotation: 6, duration: .45, ease: "power2.out" }, 1.85);
      const stagger = cards.length > 1 ? Math.min(.16, 1.1 / (cards.length - 1)) : 0;
      cards.forEach((card, index) => {
        timeline?.to(card, {
          autoAlpha: 1, y: 0, scale: 1, clipPath: "inset(0% 0% 0% 0% round 12px)",
          duration: .45, ease: "power3.out",
        }, 1.85 + index * stagger);
      });
    };
    const update = () => {
      stage.dataset.reduced = String(reduced());
      if (reduced()) finish();
      else {
        start();
        timeline?.paused(document.hidden || !visible);
      }
    };

    stage.dataset.phase = "waiting";
    if (!reduced()) {
      gsap.set(head, { autoAlpha: 0, scale: .78, y: 110, rotation: -5, svgOrigin: "300 160" });
      gsap.set(emergence, { autoAlpha: 0, scale: .035, y: 110, svgOrigin: "300 170" });
      gsap.set(left, { rotation: -75, scale: .35, svgOrigin: "200 310" });
      gsap.set(right, { rotation: 75, scale: .35, svgOrigin: "400 310" });
      gsap.set(cards, { autoAlpha: 0, y: 18, scale: .985, clipPath: "inset(100% 0% 0% 0% round 12px)" });
      if (replay > 0) stage.querySelector<HTMLButtonElement>(".plan-stage__skip")?.focus({ preventScroll: true });
    }
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      update();
    });
    observer?.observe(stage);
    const images = Array.from(new Set(Array.from(stage.querySelectorAll<SVGImageElement>("image")).map((image) => image.getAttribute("href"))));
    const decode = (src: string | null) => new Promise<void>((resolve, reject) => {
      if (!src) { reject(); return; }
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject();
      image.src = src;
      if (image.complete && image.naturalWidth) resolve();
    });
    void Promise.all(images.map(decode)).then(() => {
      if (disposed) return;
      clearTimeout(loadDeadline);
      loaded = true;
      update();
    }, finish);
    // A missing or stalled illustration must never keep the actual plan hidden.
    const loadDeadline = setTimeout(finish, 4000);
    const settings = new MutationObserver(update);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    preference?.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      disposed = true;
      clearTimeout(loadDeadline);
      timeline?.kill();
      clear();
      observer?.disconnect();
      settings.disconnect();
      preference?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      finishRef.current = () => {};
    };
  }, [replay]);

  return (
    <div ref={root} className="plan-stage" data-phase="ready">
      <div className="plan-stage__head">
        <h3 id={headingId} className="panel__title">{title}</h3>
        <div className="plan-stage__controls">
          <button className="plan-stage__control plan-stage__skip" type="button" onClick={() => finishRef.current()}>Skip animation</button>
          <button className="plan-stage__control plan-stage__replay" type="button" onClick={() => setReplay((value) => value + 1)}>Replay the plan</button>
        </div>
      </div>
      <div className="plan-stage__art"><PumpkinGhost state={state} orchestrated /></div>
      <div className="plan-stage__cards">{children}</div>
    </div>
  );
}
