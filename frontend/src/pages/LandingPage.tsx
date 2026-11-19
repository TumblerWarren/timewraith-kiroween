import { useEffect, useState } from "react";
import { useReduceMotion } from "../a11y/ReduceMotionProvider";
import { hasSeenIntro, markIntroSeen } from "../animation/introSession";
import { Intro } from "../animation/react/MidnightIntro";
import { href } from "../app/router";

export function LandingPage({ replayOnEntry = false }: { readonly replayOnEntry?: boolean }) {
  const { reduceMotion } = useReduceMotion();
  const [playing, setPlaying] = useState(() => replayOnEntry || !hasSeenIntro("landing"));
  const [replayingHere, setReplayingHere] = useState(false);

  useEffect(() => {
    if (playing) markIntroSeen("landing");
    if (replayOnEntry && window.location.hash === href({ page: "landing", replay: true })) {
      // Consume the explicit replay request so refreshing does not replay it again.
      window.history.replaceState(window.history.state, "", href({ page: "landing" }));
    }
  }, [playing, replayOnEntry]);

  return (
    <section className="clock-landing" aria-labelledby="page-title">
      <h1 id="page-title" className="visually-hidden" tabIndex={-1}>
        TimeWraith · The midnight hour
      </h1>
      <a className="clock-landing__fallback" href={href({ page: "home" })}>
        Enter TimeWraith
      </a>
      {playing && <Intro onSkip={replayingHere ? () => setPlaying(false) : undefined} />}
      <footer className="clock-landing__footer">
        <button
          type="button"
          className="footer__control"
          disabled={reduceMotion}
          onClick={() => {
            setReplayingHere(true);
            setPlaying(true);
          }}
        >
          Replay the midnight intro
        </button>
      </footer>
    </section>
  );
}
