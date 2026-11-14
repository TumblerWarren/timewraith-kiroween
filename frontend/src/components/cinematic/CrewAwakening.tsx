import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReduceMotion } from "../../a11y/ReduceMotionProvider";
// Local SVG artwork from the supplied mockup. Inline it so CSS can animate the eye and iris separately.
import eye from "../../assets/cinematic/crew-eye.svg?raw";
import umbrella from "../../assets/cinematic/umbrella-ghost.svg?raw";

export function CrewAwakening() {
  const { reduceMotion } = useReduceMotion();
  const [playing, setPlaying] = useState(!reduceMotion);
  const dialog = useRef<HTMLDialogElement>(null);
  const replay = useRef<HTMLButtonElement>(null);
  const replaying = useRef(false);
  const open = playing && !reduceMotion;

  useEffect(() => {
    const element = dialog.current;
    if (!open || typeof element?.showModal !== "function") return;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function finish() {
    setPlaying(false);
    requestAnimationFrame(() => {
      const target = replaying.current ? replay.current : document.getElementById("page-title");
      target?.focus({ preventScroll: true });
    });
  }

  if (reduceMotion) return null;

  return <>
    <button ref={replay} className="landing-replay crew-awakening__replay" type="button" onClick={() => {
      replaying.current = true;
      setPlaying(true);
    }}>Replay entrance</button>
    {open && createPortal(
      <dialog ref={dialog} className="cinema crew-awakening" aria-label="Opening the eye of TimeWraith"
        onCancel={event => { event.preventDefault(); finish(); }}
        onAnimationEnd={event => { if (event.target === event.currentTarget) finish(); }}>
        <div className="crew-awakening__eye" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eye }} />
        <p className="crew-awakening__caption" aria-hidden="true">Something is waking up</p>
        <div className="cinema__controls"><button type="button" onClick={finish}>Skip intro</button></div>
      </dialog>,
      document.body,
    )}
  </>;
}

export function UmbrellaGhost({ busy }: { readonly busy: boolean }) {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let visible = typeof IntersectionObserver === "undefined";
    const update = () => { element.dataset.moving = String(visible && !document.hidden); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      update();
    });
    observer?.observe(element);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return <div ref={scene} className="crew-ghost" data-busy={busy} aria-hidden="true" dangerouslySetInnerHTML={{ __html: umbrella }} />;
}
