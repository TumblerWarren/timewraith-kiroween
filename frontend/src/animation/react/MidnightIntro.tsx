import { gsap } from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReduceMotion } from "../../a11y/ReduceMotionProvider";
import wraith from "../../assets/cinematic/lantern-wraith.jpg";
import { CLOCK_IMAGES, MidnightClock } from "../../components/cinematic/MidnightClock";
import { createSwarm } from "../../components/cinematic/swarm";

const SEEN_KEY = "tw.introSeen";
function seen() {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}

/** Midnight → perspective swarm → darkness → the lantern invitation. */
export function Intro() {
  const { reduceMotion } = useReduceMotion();
  const [open, setOpen] = useState(() => !seen() && !reduceMotion);
  const [ready, setReady] = useState(false);
  const [sound, setSound] = useState(false);
  const [soundFailed, setSoundFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);

  const close = useCallback(() => {
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* Storage is optional. */ }
    setOpen(false);
    void audio.current?.suspend();
    requestAnimationFrame(() => document.getElementById("page-title")?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => () => { void audio.current?.close(); }, []);

  useEffect(() => {
    const root = dialog.current;
    if (!open || !root) return;
    root.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let disposed = false;
    const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
    const swarm = createSwarm(canvas);
    const find = (selector: string) => root.querySelector(selector)!;
    const clock = find(".cinema__clock"), ghost = find(".cinema__ghost");
    const figure = find(".cinema__figure"), invitation = find(".cinema__invitation");
    const hand = { hour: 357.5, minute: 330 }, flight = { time: 4.8 };
    const bell = () => {
      const context = audio.current;
      if (!soundEnabled.current || !context || context.state !== "running") return;
      [65.4, 131, 196, 277, 391].forEach((frequency, i) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.045 / (1 + i), context.currentTime + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 2.8 / (1 + i * .25));
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 3);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    };
    const tl = gsap.timeline({ paused: true });
    gsap.set([clock, ghost, invitation], { opacity: 0 });
    if (reduceMotion) {
      gsap.set([ghost, invitation], { opacity: 1 });
      queueMicrotask(() => { if (!disposed) setReady(true); });
    } else {
      tl.to(clock, { opacity: 1, duration: 1.4, ease: "sine.inOut" }, .55)
        .fromTo(find(".cinema__clock-frame"), { scale: .92 }, { scale: 1, duration: 2, ease: "sine.out" }, .6)
        .to(hand, { hour: 360, minute: 360, duration: 2.1, ease: "sine.inOut", onUpdate: () => {
          find('[data-hand="hour"]').setAttribute("transform", `rotate(${hand.hour} 625.5 626)`);
          find('[data-hand="minute"]').setAttribute("transform", `rotate(${hand.minute} 625.5 626)`);
        } }, 2.6)
        .call(bell, [], 4.7)
        .to(flight, { time: 8.4, duration: 3.6, ease: "none", onUpdate: () => swarm.draw(flight.time) }, 4.8)
        .to(clock, { opacity: 0, duration: .6 }, 7.6)
        .to(canvas, { opacity: 0, duration: .6 }, 7.8)
        .to(ghost, { opacity: 1, duration: 2.6, ease: "sine.inOut" }, 9)
        .fromTo(figure, { y: 42, scale: .78 }, { y: 0, scale: 1, duration: 2.6, ease: "sine.out" }, 9)
        .to(invitation, { opacity: 1, duration: .65 }, 11.1)
        .call(() => setReady(true), [], 11.6);
      // Decode before starting; guard asynchronous StrictMode/unmount work.
      void Promise.all([...CLOCK_IMAGES, wraith].map(src => {
        const image = new Image(); image.src = src; return image.decode().catch(() => {});
      })).then(() => { if (!disposed && !document.hidden) tl.play(); });
    }
    const visibility = () => {
      root.dataset.paused = String(document.hidden);
      if (document.hidden) { tl.pause(); void audio.current?.suspend(); }
      else { if (!reduceMotion) tl.play(); if (soundEnabled.current) void audio.current?.resume(); }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true; tl.kill(); swarm.dispose();
      document.removeEventListener("visibilitychange", visibility);
      document.body.style.overflow = previousOverflow;
      root.close();
    };
  }, [open, reduceMotion]);

  async function toggleSound() {
    try {
      audio.current ??= new AudioContext();
      const next = !soundEnabled.current;
      if (next) await audio.current.resume(); else await audio.current.suspend();
      soundEnabled.current = next; setSound(next);
    } catch { setSoundFailed(true); }
  }

  return <>
    <button className="landing-replay" type="button" onClick={() => { setReady(false); setOpen(true); }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /></svg>
      Replay the midnight intro
    </button>
    {open && createPortal(<dialog ref={dialog} className="cinema" aria-label="TimeWraith midnight introduction"
      data-ready={ready} data-reduced={reduceMotion} onCancel={event => { event.preventDefault(); close(); }}>
      <div className="cinema__clock" aria-hidden="true">
        <div className="cinema__clock-frame"><MidnightClock /></div>
        <p className="cinema__caption">The midnight hour</p>
      </div>
      <canvas className="cinema__swarm" aria-hidden="true" />
      <div className="cinema__ghost">
        <div className="cinema__figure">
          <img src={wraith} width="725" height="559" alt="A spectral ghost offers a violet lantern" />
          <span className="cinema__light" aria-hidden="true" />
          <button className="cinema__lantern" disabled={!ready} onClick={close} aria-label="Touch the lantern to enter TimeWraith" />
        </div>
        <div className="cinema__invitation">
          <h2>The night awaits.</h2>
          <button type="button" disabled={!ready} onClick={close}>Touch the lantern to enter <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div className="cinema__controls">
        <button type="button" aria-pressed={sound} disabled={soundFailed} onClick={() => void toggleSound()}>{soundFailed ? "Sound unavailable" : sound ? "Sound on" : "Sound off"}</button>
        <button type="button" onClick={close}>Skip intro <span aria-hidden="true">↗</span></button>
      </div>
    </dialog>, document.body)}
  </>;
}
