import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReduceMotion } from "../../a11y/ReduceMotionProvider";
import { hasSeenIntro, markIntroSeen } from "../../animation/introSession";
import eye from "../../assets/cinematic/crew-eye.svg?raw";
import umbrella from "../../assets/cinematic/umbrella-ghost.svg?raw";
import {
  installGlobalUiSounds,
  isSoundEnabled,
  playEyeAwakening,
  subscribeSoundState,
  toggleSoundEnabled,
} from "../../audio/soundEffects";

export function CrewAwakening() {
  const { reduceMotion } = useReduceMotion();
  const [playing, setPlaying] = useState(() => !reduceMotion && !hasSeenIntro("crew"));
  const [sound, setSound] = useState(isSoundEnabled);
  const [soundFailed, setSoundFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const replaying = useRef(false);
  const open = playing && !reduceMotion;
  useEffect(() => {
    const replay = () => {
      if (reduceMotion) return;
      replaying.current = true;
      setPlaying(true);
    };
    window.addEventListener("tw:replay-crew", replay);
    return () => window.removeEventListener("tw:replay-crew", replay);
  }, [reduceMotion]);

  useEffect(() => {
    installGlobalUiSounds();
    return subscribeSoundState(setSound);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!open || typeof element?.showModal !== "function") return;
    markIntroSeen("crew");
    element.showModal();
    playEyeAwakening();
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
      const target = document.getElementById(replaying.current ? "page-animation-replay" : "page-title");
      target?.focus({ preventScroll: true });
    });
  }

  async function toggleSound() {
    const { ok } = await toggleSoundEnabled();
    if (!ok) {
      setSoundFailed(true);
      return;
    }
    if (isSoundEnabled()) playEyeAwakening();
  }

  if (reduceMotion) return null;

  return (
    <>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="cinema crew-awakening"
            aria-label="Opening the eye of TimeWraith"
            onCancel={(event) => {
              event.preventDefault();
              finish();
            }}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) finish();
            }}
          >
            <div className="crew-awakening__eye" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eye }} />
            <p className="crew-awakening__caption" aria-hidden="true">
              Something is waking up
            </p>
            <div className="cinema__controls">
              <button
                type="button"
                data-sound-toggle
                aria-pressed={sound}
                disabled={soundFailed}
                onClick={() => void toggleSound()}
              >
                {soundFailed ? "Sound unavailable" : sound ? "Sound on" : "Sound off"}
              </button>
              <button type="button" onClick={finish}>
                Skip intro <span aria-hidden="true">↗</span>
              </button>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

export function UmbrellaGhost({ busy }: { readonly busy: boolean }) {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let visible = typeof IntersectionObserver === "undefined";
    const update = () => {
      element.dataset.moving = String(visible && !document.hidden);
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
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
