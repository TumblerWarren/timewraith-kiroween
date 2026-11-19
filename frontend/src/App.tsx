import { useEffect, useRef } from "react";
import { LiveAnnouncer } from "./a11y/LiveAnnouncer";
import { useReduceMotion } from "./a11y/ReduceMotionProvider";
import { AppBar } from "./app/AppBar";
import { FinishedNotices } from "./app/FinishedNotices";
import { href, useRoute, type Route } from "./app/router";
import { SetupProvider, useReadiness } from "./app/SetupProvider";
import { installGlobalUiSounds } from "./audio/soundEffects";
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
  const { ready, status, docker, crew, login } = useReadiness();
  if (!ready && (route.page === "cases" || route.page === "case" || route.page === "new")) {
    const pending = [
      docker !== "done" && "Start Docker",
      crew !== "done" && "Start the Kiro Crew container",
      login !== "done" && "Sign in to Kiro",
    ].filter((step) => step !== false);

    return (
      <article className="page" aria-labelledby="page-title">
        <header className="page__head">
          <h1 id="page-title" className="page__title" tabIndex={-1}>Complete Crew setup</h1>
          <p className="page__lead">Cases and New Case unlock once Docker is running, the Crew container is running, and you’re signed in to Kiro.</p>
        </header>
        <section className="panel" aria-label="Crew setup status">
          {status ? (
            <ul>
              {pending.map((step) => <li key={step}>{step}</li>)}
            </ul>
          ) : <p>Crew readiness hasn’t been confirmed. Check the status on the Crew setup page.</p>}
          <a className="btn" href={href({ page: "crew" })}>Go to Crew setup</a>
        </section>
      </article>
    );
  }

  switch (route.page) {
    case "landing":
      return <LandingPage key={String(!!route.replay)} replayOnEntry={route.replay} />;
    case "home":
      return <HomePage />;
    case "new":
      return <NewCasePage key={route.repoUrl ?? ""} repoUrl={route.repoUrl} />;
    case "cases":
      return <CasesPage />;
    case "case":
      return <CasePage id={route.id} tab={route.tab} planView={route.planView} />;
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
  const { reduceMotion } = useReduceMotion();
  const { ready } = useReadiness();

  return (
    <footer className="footer">
      <div className="midnight-wrap midnight-footer">
        <span>TimeWraith / A Kiro Crew agent team for date-sensitive code</span>
        <div>
          {ready && page === "cases" && !reduceMotion && <button
            id="cases-footer-skip"
            type="button"
            className="footer__control"
            onClick={() => window.dispatchEvent(new Event("tw:skip-cases"))}
          >
            Skip animation
          </button>}
          {((ready && (page === "new" || page === "cases")) || page === "crew") && <button
            id="page-animation-replay"
            type="button"
            className="footer__control"
            disabled={reduceMotion}
            onClick={() => window.dispatchEvent(new Event(`tw:replay-${page}`))}
          >
            {page === "new" ? "Replay the trap animation" : page === "cases" ? "Replay the case reveal" : "Replay the crew animation"}
          </button>}
          {page !== "new" && page !== "crew" && page !== "cases" && <a className="landing-replay" href={href({ page: "landing", replay: true })}>
            Replay the midnight intro
          </a>}
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
        {route.page !== "landing" && <FinishedNotices openCaseId={route.page === "case" ? route.id : undefined} />}
        <main id="main" tabIndex={-1} className="main">
          <Page route={route} />
        </main>
        {route.page !== "home" && route.page !== "landing" && <ShellFooter page={route.page} />}
      </SetupProvider>
    </LiveAnnouncer>
  );
}
