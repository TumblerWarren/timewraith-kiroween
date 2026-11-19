import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReduceMotion } from "../../a11y/ReduceMotionProvider";
import { navigate } from "../../app/router";
import wraith from "../../assets/cinematic/lantern-wraith.svg";
import {
  installGlobalUiSounds,
  isAudioContextRunning,
  isSoundEnabled,
  playClockTick,
  playEnterChime,
  playLanternPulse,
  playMidnightBell,
  playWraithMaterialize,
  resetSwarmAudio,
  resumeSoundContextIfEnabled,
  subscribeSoundState,
  suspendSoundContext,
  syncSwarmAudio,
  toggleSoundEnabled,
} from "../../audio/soundEffects";
import { CLOCK_IMAGES, MidnightClock } from "../../components/cinematic/MidnightClock";
import { createSwarm } from "../../components/cinematic/swarm";

const HAND_STEPS = [
  { at: 1.5, minute: 336, hour: 358.0, tock: false, midnight: false },
  { at: 2.3, minute: 342, hour: 358.5, tock: true, midnight: false },
  { at: 3.1, minute: 348, hour: 359.0, tock: false, midnight: false },
  { at: 3.9, minute: 354, hour: 359.5, tock: true, midnight: false },
  { at: 4.7, minute: 360, hour: 360.0, tock: false, midnight: true },
] as const;

/** Midnight → perspective swarm → darkness → the lantern invitation. */
export function Intro({ onSkip }: { readonly onSkip?: () => void }) {
  const { reduceMotion } = useReduceMotion();
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled);
  const [soundFailed, setSoundFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const heardClockRef = useRef(false);

  const close = () => {
    playEnterChime();
    navigate({ page: "home" });
  };

  useEffect(() => {
    installGlobalUiSounds();
    return subscribeSoundState(setSound);
  }, []);

  useEffect(() => {
    const root = dialog.current;
    if (!root || typeof root.showModal !== "function") return;
    root.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let disposed = false;
    const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
    const swarm = createSwarm(canvas);
    const find = (selector: string) => root.querySelector(selector)!;
    const clock = find(".cinema__clock"),
      ghost = find(".cinema__ghost");
    const figure = find(".cinema__figure"),
      invitation = find(".cinema__invitation");
    const hourHand = find('[data-hand="hour"]');
    const minuteHand = find('[data-hand="minute"]');
    const hand = { hour: 357.5, minute: 330 },
      flight = { time: 4.8 };

    const syncHands = () => {
      hourHand.setAttribute("transform", `rotate(${hand.hour} 625.5 626)`);
      minuteHand.setAttribute("transform", `rotate(${hand.minute} 625.5 626)`);
    };

    const tl = gsap.timeline({
      paused: true,
      onStart: () => {
        hand.hour = 357.5;
        hand.minute = 330;
        syncHands();
        resetSwarmAudio();
      },
    });
    timelineRef.current = tl;
    gsap.set([clock, ghost, invitation], { opacity: 0 });
    gsap.set(clock, { visibility: "visible" });
    gsap.set(canvas, { opacity: 1 });
    if (reduceMotion) {
      gsap.set([ghost, invitation], { opacity: 1 });
      queueMicrotask(() => {
        if (!disposed) setReady(true);
      });
    } else {
      tl.to(clock, { opacity: 1, duration: 1.2, ease: "sine.inOut" }, 0.35).fromTo(
        find(".cinema__clock-frame"),
        { scale: 0.92 },
        { scale: 1, duration: 2, ease: "sine.out" },
        0.4,
      );

      // Five discrete mechanical ticks advancing the hands from 330° (11:55) to 360° (12:00 Midnight).
      // Each sound fires in `onStart` of the exact tween that moves the hands.
      for (const step of HAND_STEPS) {
        tl.to(
          hand,
          {
            hour: step.hour,
            minute: step.minute,
            duration: 0.18,
            ease: "back.out(1.8)",
            onStart: () => {
              if (isAudioContextRunning()) heardClockRef.current = true;
              playClockTick(step.tock);
              if (step.midnight) {
                playMidnightBell();
              }
            },
            onUpdate: syncHands,
          },
          step.at,
        );
      }

      tl.to(
        flight,
        {
          time: 8.4,
          duration: 3.6,
          ease: "none",
          onStart: resetSwarmAudio,
          onUpdate: () => {
            swarm.draw(flight.time);
            syncSwarmAudio(flight.time);
          },
        },
        4.8,
      )
        // Remove the clock while the converging swarm still covers the center.
        .to(clock, { opacity: 0, duration: 0.6 }, 7.1)
        .set(clock, { visibility: "hidden" }, 7.7)
        .to(canvas, { opacity: 0, duration: 0.6 }, 7.8)
        .call(playWraithMaterialize, [], 9.0)
        .to(ghost, { opacity: 1, duration: 2.6, ease: "sine.inOut" }, 9)
        .fromTo(figure, { y: 42, scale: 0.78 }, { y: 0, scale: 1, duration: 2.6, ease: "sine.out" }, 9)
        .call(playLanternPulse, [], 11.1)
        .to(invitation, { opacity: 1, duration: 0.65 }, 11.1)
        .call(() => setReady(true), [], 11.6);
      // Decode before starting; guard asynchronous StrictMode/unmount work.
      void Promise.all(
        [...CLOCK_IMAGES, wraith].map((src) => {
          const image = new Image();
          image.src = src;
          return image.decode().catch(() => {});
        }),
      ).then(() => {
        if (!disposed && !document.hidden) tl.play();
      });
    }
    const visibility = () => {
      root.dataset.paused = String(document.hidden);
      if (document.hidden) {
        tl.pause();
        suspendSoundContext();
      } else {
        if (!reduceMotion) tl.play();
        resumeSoundContextIfEnabled();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      timelineRef.current = null;
      tl.kill();
      swarm.dispose();
      document.removeEventListener("visibilitychange", visibility);
      document.body.style.overflow = previousOverflow;
      root.close();
    };
  }, [reduceMotion]);

  async function toggleSound() {
    const { ok, unlockedFromSuspended } = await toggleSoundEnabled();
    if (!ok) {
      setSoundFailed(true);
      return;
    }
    if (isSoundEnabled()) {
      const tl = timelineRef.current;
      const t = tl?.time() ?? 0;
      // If the browser blocked audio before this click and any clock ticks were missed,
      // restart from the beginning so every hand movement, the midnight bell, and the bat flight are in sync.
      if (tl && !reduceMotion && (!heardClockRef.current || unlockedFromSuspended) && t > 1.3) {
        setReady(false);
        heardClockRef.current = true;
        resetSwarmAudio();
        tl.restart();
        return;
      }
      if (t < 4.7) playClockTick(false);
      else if (t >= 8.8) playWraithMaterialize();
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      className="cinema"
      aria-label="TimeWraith midnight introduction"
      data-ready={ready}
      data-reduced={reduceMotion}
      onCancel={(event) => {
        event.preventDefault();
        (onSkip ?? close)();
      }}
    >
      <div className="cinema__clock" aria-hidden="true">
        <div className="cinema__clock-frame">
          <MidnightClock />
        </div>
        <p className="cinema__caption">The midnight hour</p>
      </div>
      <canvas className="cinema__swarm" aria-hidden="true" />
      <div className="cinema__ghost">
        <div className="cinema__figure">
          <img src={wraith} width="725" height="559" alt="A spectral ghost offers a violet lantern" />
          <button className="cinema__lantern" disabled={!ready} onClick={close} aria-label="Touch the lantern to enter TimeWraith" />
        </div>
        <div className="cinema__invitation">
          <h2>The night awaits.</h2>
          <button type="button" disabled={!ready} onClick={close}>
            Touch the lantern to enter <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
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
        <button type="button" onClick={onSkip ?? close}>
          Skip intro <span aria-hidden="true">↗</span>
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
