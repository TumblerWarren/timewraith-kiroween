import { useEffect, useRef, useState } from "react";
import { LiveAnnouncer, useLiveAnnouncer } from "./a11y/LiveAnnouncer";
import { useReduceMotion } from "./a11y/ReduceMotionProvider";
import { AppBar } from "./app/AppBar";
import { href, useRoute, type Route } from "./app/router";
import { SetupProvider } from "./app/SetupProvider";
import { installGlobalUiSounds, isSoundEnabled, subscribeSoundState, toggleSoundEnabled } from "./audio/soundEffects";
import { AboutPage } from "./pages/AboutPage";
import { CasePage } from "./pages/case/CasePage";
import { CasesPage } from "./pages/CasesPage";
import { CrewPage } from "./pages/CrewPage";
import { HomePage } from "./pages/HomePage";
import { LandingPage } from "./pages/LandingPage";
import { NewCasePage } from "./pages/NewCasePage";

const TITLES: Readonly<Record<Route["page"], string>> = {
  landing: "The midnight hour · TimeWraith",
  home: "Home · TimeWraith",
  new: "Open a case · TimeWraith",
  cases: "Cases · TimeWraith",
  case: "Case · TimeWraith",
  crew: "Crew setup · TimeWraith",
  about: "How it works · TimeWraith",
  "not-found": "Not found · TimeWraith",
};

function Page({ route }: { readonly route: Route }) {
  switch (route.page) {
    case "landing":
      return <LandingPage />;
    case "home":
      return <HomePage />;
    case "new":
      return <NewCasePage key={route.repoUrl ?? ""} repoUrl={route.repoUrl} />;
    case "cases":
      return <CasesPage />;
    case "case":
      return <CasePage id={route.id} tab={route.tab} />;
    case "crew":
      return <CrewPage />;
    case "about":
      return <AboutPage />;
    case "not-found":
      return (
        <article className="page" aria-labelledby="page-title">
          <header className="page__head">
            <p className="midnight-kicker">
              <span />
              404
            </p>
            <h1 id="page-title" className="page__title" tabIndex={-1}>
              Page not <em>found</em>
            </h1>
            <p className="page__lead">
              <a className="btn" href={href({ page: "home" })}>
                Back to the start
              </a>
            </p>
          </header>
        </article>
      );
  }
}

function ShellFooter({ page }: { readonly page: Route["page"] }) {
  const { reduceMotion, toggle } = useReduceMotion();
  const { announce } = useLiveAnnouncer();
  const [sound, setSound] = useState(isSoundEnabled);

  useEffect(() => subscribeSoundState(setSound), []);

  return (
    <footer className="footer">
      <div className="midnight-wrap midnight-footer">
        <span>TimeWraith / A Kiro Crew agent team for date-sensitive code</span>
        <div>
          <button
            type="button"
            className="footer__control"
            data-sound-toggle
            aria-pressed={sound}
            onClick={() => void toggleSoundEnabled()}
          >
            {sound ? "Sound on" : "Sound off"}
          </button>
          <button
            type="button"
            className="footer__control"
            aria-pressed={reduceMotion}
            onClick={() => announce(toggle() ? "Reduced motion on" : "Reduced motion off")}
          >
            {reduceMotion ? "Reduce motion: on" : "Reduce motion"}
          </button>
          {(page === "new" || page === "crew") && <button
            id="page-animation-replay"
            type="button"
            className="footer__control"
            disabled={reduceMotion}
            onClick={() => window.dispatchEvent(new Event(`tw:replay-${page}`))}
          >
            {page === "new" ? "Replay the trap animation" : "Replay the crew animation"}
          </button>}
          {page !== "new" && page !== "crew" && <a className="landing-replay" href={href({ page: "landing" })}>
            Replay the midnight intro
          </a>}
          <a className="landing-replay" href="https://kiroween.devpost.com/">
            Kiroween 2026
          </a>
        </div>
      </div>
    </footer>
  );
}

/**
 * The app shell (redesign R4): header, one page per hash route, footer. On a page change the document title
 * follows, the window scrolls to the top and focus moves to the page heading; a tab change inside a case keeps
 * the scroll position.
 */
export function App() {
  const route = useRoute();
  const key = route.page === "case" ? `case:${route.id}` : route.page;
  const first = useRef(true);

  useEffect(() => {
    installGlobalUiSounds();
  }, []);

  useEffect(() => {
    document.title = TITLES[route.page];
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo?.({ top: 0 });
    document.getElementById("page-title")?.focus({ preventScroll: true });
  }, [key, route.page]);

  return (
    <LiveAnnouncer>
      <SetupProvider>
        <a className="skip-link" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
          Skip to content
        </a>
        {route.page !== "landing" && <AppBar route={route} />}
        <main id="main" tabIndex={-1} className="main">
          <Page route={route} />
        </main>
        {route.page !== "home" && route.page !== "landing" && <ShellFooter page={route.page} />}
      </SetupProvider>
    </LiveAnnouncer>
  );
}
