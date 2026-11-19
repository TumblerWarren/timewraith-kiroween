import { gsap } from "gsap";
import { useLayoutEffect, useRef } from "react";
import { useReduceMotion } from "../../a11y/ReduceMotionProvider";
import fabricImage from "../../assets/cinematic/archive-ghost-fabric.png";
import lensImage from "../../assets/cinematic/archive-ghost-lens.png";
import { hasSeenIntro, markIntroSeen } from "../introSession";
import { createAnimationSounds } from "../../audio/soundEffects";

// The lens centre and rim are measured against the original ghost artwork.
const LENS_X = 0.305;
const LENS_Y = 0.285;
const LENS_ORIGIN = "30.5% 28.5%";
const COLLAR_ORIGIN = "530 696";

export function CasesReveal({ loading }: { readonly loading: boolean }) {
  const { reduceMotion } = useReduceMotion();
  const art = useRef<HTMLDivElement>(null);
  const fabric = useRef<SVGGElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const automatic = useRef(!hasSeenIntro("cases"));
  const stop = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const sprite = art.current;
    const tail = fabric.current;
    const body = sprite?.parentElement?.querySelector<HTMLElement>(".archive-reveal__content");
    const skipButton = skip.current;
    if (!body || !sprite || !tail || !skipButton || loading || reduceMotion) return;

    function play(replay: boolean) {
      if (!body || !sprite || !skipButton) return;
      stop.current();
      const sounds = createAnimationSounds();
      markIntroSeen("cases");
      const bounds = sprite.getBoundingClientRect();
      const width = body.clientWidth;
      const rows = [...body.querySelectorAll<HTMLElement>(".case-row")];
      const visibleRows = rows.filter((row) => row.getBoundingClientRect().top < window.innerHeight - 12);
      body.inert = true;
      skipButton.hidden = false;
      if (replay) skipButton.focus({ preventScroll: true });

      const timeline = gsap.timeline({ paused: document.hidden });
      const visibility = () => {
        timeline.paused(document.hidden);
        if (document.hidden) sounds.stop();
      };
      const context = gsap.context(() => {
        const offsetX = body.getBoundingClientRect().left - bounds.left - bounds.width * LENS_X;
        const lensTop = bounds.top + bounds.height * LENS_Y;
        gsap.set(sprite, { x: offsetX + width * .25, y: 135, rotation: -22, scale: 2.7, transformOrigin: LENS_ORIGIN });
        gsap.set(tail, { opacity: 0, scale: .14, rotation: -20, svgOrigin: COLLAR_ORIGIN });
        gsap.set(rows, { opacity: 0 });
        gsap.set(body, { opacity: 0 });
        timeline.call(() => sounds.play("search"));
        timeline.to(sprite, { x: offsetX + width * .56, y: 90, rotation: 12, duration: .65, ease: "sine.inOut" });
        timeline.to(body, { opacity: 1, duration: .28 });
        visibleRows.forEach((row, index) => {
          const rect = row.getBoundingClientRect();
          const sweep = Math.min(.48, 3.7 / Math.max(visibleRows.length, 1));
          timeline.call(() => sounds.play("search"));
          timeline.to(sprite, {
            x: offsetX + width * (index % 2 === 0 ? .28 : .66),
            y: rect.top + rect.height / 2 - lensTop,
            rotation: index % 2 === 0 ? -14 : 10,
            duration: sweep,
            ease: "sine.inOut",
          });
          const previousRow = visibleRows[index - 1];
          if (previousRow) {
            timeline.call(() => sounds.play("reveal"));
            timeline.to(previousRow, { opacity: 1, duration: .32 }, ">");
          }
        });
        const lastRow = visibleRows.at(-1);
        if (lastRow) {
          timeline.to(sprite, { x: offsetX + width * .87, y: 76, rotation: 8, scale: 1.65, duration: .6, ease: "power2.inOut" });
          timeline.call(() => sounds.play("reveal"));
          timeline.to(lastRow, { opacity: 1, duration: .32 });
        }
        timeline.set(rows.filter((row) => !visibleRows.includes(row)), { opacity: 1 });
        timeline.call(() => sounds.play("materialize"));
        timeline.to(tail, { opacity: 1, scale: 1, rotation: 0, duration: .68, ease: "power2.out" }, "unfold");
        timeline.to(sprite, { x: 0, y: 0, rotation: 0, scale: 1, duration: 1.08, ease: "power2.inOut" }, "unfold+=0.2");
      }, sprite);
      const finish = (restoreFocus: boolean) => {
        if (restoreFocus) automatic.current = false;
        const footerFocused = document.activeElement?.id === "cases-footer-skip";
        const heldFocus = footerFocused || document.activeElement === skipButton;
        window.removeEventListener("tw:skip-cases", skipFromFooter);
        document.removeEventListener("visibilitychange", visibility);
        context.revert();
        timeline.kill();
        sounds.stop();
        body.inert = false;
        skipButton.hidden = true;
        stop.current = () => {};
        if (restoreFocus && heldFocus) {
          document.getElementById(replay || footerFocused ? "page-animation-replay" : "page-title")?.focus({ preventScroll: true });
        }
      };
      document.addEventListener("visibilitychange", visibility);
      const skipFromFooter = () => finish(true);
      window.addEventListener("tw:skip-cases", skipFromFooter);
      stop.current = () => finish(false);
      timeline.eventCallback("onComplete", () => finish(true));
      skipButton.onclick = () => finish(true);
    }

    const replay = () => {
      window.scrollTo({ top: 0, behavior: "instant" });
      play(true);
    };
    if (automatic.current) play(false);
    window.addEventListener("tw:replay-cases", replay);
    return () => {
      window.removeEventListener("tw:replay-cases", replay);
      stop.current();
      skipButton.onclick = null;
    };
  }, [loading, reduceMotion]);

  return (
    <>
      <div className="archive-reveal__art" ref={art} aria-hidden="true">
        <svg viewBox="0 0 1312 1199" focusable="false" overflow="visible">
          <g ref={fabric} data-ghost-part="fabric">
            <image href={fabricImage} width="1312" height="1199" />
          </g>
          <image data-ghost-part="lens" href={lensImage} width="1312" height="1199" />
        </svg>
      </div>
      <button className="btn archive-reveal__skip" ref={skip} type="button" hidden>Skip animation</button>
    </>
  );
}
