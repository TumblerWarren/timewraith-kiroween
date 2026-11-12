import { useEffect, useState } from "react";
import { useReduceMotion } from "../a11y/ReduceMotionProvider";
import { href } from "../app/router";
import { INTRO } from "../content/app";
import { Mascot } from "../mascots/Mascot";
import { Clock } from "./Clock";

type Stage = "clock" | "bats" | "clear" | "walk" | "wait";

const SEEN_KEY = "tw.introSeen";
/** Where each stage ends, in ms from the start. */
const ENDS: Readonly<Record<Exclude<Stage, "wait">, number>> = { clock: 3200, bats: 5800, clear: 6500, walk: 10500 };
const START_MINUTES = 11 * 60 + 45;
const BATS = [
  { top: 12, delay: 0, dur: 2.1, size: 84 },
  { top: 30, delay: 0.25, dur: 1.8, size: 64 },
  { top: 52, delay: 0.1, dur: 2.3, size: 96 },
  { top: 20, delay: 0.6, dur: 1.9, size: 72 },
  { top: 66, delay: 0.4, dur: 2.0, size: 60 },
  { top: 40, delay: 0.8, dur: 2.2, size: 80 },
  { top: 78, delay: 0.2, dur: 1.7, size: 68 },
] as const;

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: the intro may play again, which is harmless */
  }
}

/**
 * The first-visit story on the home page: the tower clock runs from 11:45 to 12:00, bats cross the screen,
 * the screen clears, and a wraith with a lamp walks in. Click him to open a case. It plays once per browser
 * session, can be skipped, and with Reduce Motion on it is not shown at all (the hero already has the wraith).
 */
export function Intro() {
  const { reduceMotion } = useReduceMotion();
  const [open, setOpen] = useState(() => !alreadySeen());
  const [stage, setStage] = useState<Stage>("clock");
  const [minutes, setMinutes] = useState(START_MINUTES);

  useEffect(() => {
    if (!open || reduceMotion) return;
    const t0 = performance.now();
    const tick = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / ENDS.clock);
      setMinutes(START_MINUTES + 15 * t);
    }, 50);
    const timers = [
      window.setTimeout(() => setStage("bats"), ENDS.clock),
      window.setTimeout(() => setStage("clear"), ENDS.bats),
      window.setTimeout(() => setStage("walk"), ENDS.clear),
      window.setTimeout(() => setStage("wait"), ENDS.walk),
    ];
    return () => {
      window.clearInterval(tick);
      timers.forEach(window.clearTimeout);
    };
  }, [open, reduceMotion]);

  if (!open || reduceMotion) return null;

  const close = (goToForm: boolean) => {
    markSeen();
    setOpen(false);
    if (goToForm) window.location.hash = href({ page: "new" });
  };
  const walking = stage === "walk" || stage === "wait";
  const total = Math.floor(minutes);

  return (
    <div className="intro" data-stage={stage} role="dialog" aria-modal="false" aria-label={INTRO.label}>
      <button type="button" className="btn btn--small intro__skip" onClick={() => close(false)}>
        {INTRO.skip}
      </button>
      {stage === "clock" ? (
        <div className="intro__clock" aria-hidden="true">
          <Clock id="intro-clock" hours={Math.floor(total / 60)} minutes={total % 60} className="intro__clock-face" />
        </div>
      ) : null}
      {stage === "bats" ? (
        <div className="intro__bats" aria-hidden="true">
          {BATS.map((b, i) => (
            <span
              key={i}
              className="intro__bat"
              style={{ top: `${b.top}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}
            >
              <span className="intro__bat-wobble" style={{ animationDelay: `${b.delay}s` }}>
                <Mascot id="mini-bat" width={b.size} decorative idle={false} actor={false} />
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {walking ? (
        <div className="intro__stage">
          <button type="button" className="intro__wraith" data-arrived={stage === "wait"} onClick={() => close(true)}>
            <span className="intro__bob">
              <Mascot id="wraith-director" width={320} decorative idle={false} actor={false} />
            </span>
            <span className="visually-hidden">{INTRO.wraith}</span>
          </button>
          {stage === "wait" ? (
            <p className="intro__hint" aria-hidden="true">
              <svg className="intro__arrow" viewBox="0 0 40 60" width="40" height="60">
                <path d="M20 4 L20 44 M6 32 L20 50 L34 32" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{INTRO.hint}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
