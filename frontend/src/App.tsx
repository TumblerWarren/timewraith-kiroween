import { useEffect, useRef } from "react";
import { LiveAnnouncer } from "./a11y/LiveAnnouncer";
import { AppBar } from "./app/AppBar";
import { href, useRoute, type Route } from "./app/router";
import { SetupProvider } from "./app/SetupProvider";
import { AboutPage } from "./pages/AboutPage";
import { CasePage } from "./pages/case/CasePage";
import { CasesPage } from "./pages/CasesPage";
import { CrewPage } from "./pages/CrewPage";
import { HomePage } from "./pages/HomePage";
import { NewCasePage } from "./pages/NewCasePage";

const TITLES: Readonly<Record<Route["page"], string>> = {
  home: "TimeWraith",
  new: "Open a case · TimeWraith",
  cases: "Cases · TimeWraith",
  case: "Case · TimeWraith",
  crew: "Crew setup · TimeWraith",
  about: "How it works · TimeWraith",
  "not-found": "Not found · TimeWraith",
};

function Page({ route }: { readonly route: Route }) {
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "new":
      return <NewCasePage />;
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
          <h1 id="page-title" className="page__title" tabIndex={-1}>
            Page not found
          </h1>
          <p>
            <a href={href({ page: "home" })}>Back to the start</a>
          </p>
        </article>
      );
  }
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
        <AppBar route={route} />
        <main id="main" tabIndex={-1} className="main">
          <Page route={route} />
        </main>
        <footer className="footer">
          <p>
            TimeWraith · a Kiro Crew agent team for date-sensitive code · <a href="https://kiroween.devpost.com/">Kiroween 2026</a>
          </p>
        </footer>
      </SetupProvider>
    </LiveAnnouncer>
  );
}
