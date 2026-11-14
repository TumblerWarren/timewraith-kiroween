import { NAV } from "../content/app";
import { href, type Route } from "./router";

export function Arrow({ diagonal = false }: { readonly diagonal?: boolean }) {
  return (
    <svg className="midnight-arrow" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d={diagonal ? "M4 12 12 4M6 4h6v6" : "M2 8h11m-4-4 4 4-4 4"} />
    </svg>
  );
}

export function Brand({ current = false, className }: { readonly current?: boolean; readonly className?: string }) {
  return (
    <a className={className ? `midnight-brand ${className}` : "midnight-brand"} href={href({ page: "home" })} aria-current={current ? "page" : undefined}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 6.5V12l3 2M12 1v2.5M12 20.5V23" />
      </svg>
      <span>
        TIME<em>WRAITH</em>
      </span>
    </a>
  );
}

const LINKS = [
  { page: "home", label: NAV.home, match: ["home"] },
  { page: "cases", label: NAV.cases, match: ["cases", "case"] },
  { page: "new", label: NAV.newCase, match: ["new"] },
  { page: "crew", label: NAV.crew, match: ["crew"] },
  { page: "about", label: NAV.about, match: ["about"] },
] as const;

/** Unified top navigation bar shared across all pages. */
export function AppBar({ route }: { readonly route: Route }) {
  return (
    <header className="appbar">
      <div className="midnight-wrap appbar__inner midnight-nav">
        <Brand className="appbar__wordmark" current={route.page === "home"} />
        <nav className="appbar__nav" aria-label={NAV.label}>
          <ul role="list">
            {LINKS.map((l) => (
              <li key={l.page}>
                <a href={href({ page: l.page })} aria-current={(l.match as readonly string[]).includes(route.page) ? "page" : undefined}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
