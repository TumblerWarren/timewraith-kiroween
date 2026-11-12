import { useLiveAnnouncer } from "../a11y/LiveAnnouncer";
import { useReduceMotion, type ReduceMotionSource } from "../a11y/ReduceMotionProvider";
import { useApi } from "../api/ApiProvider";
import { NAV, READINESS } from "../content/app";
import { href, type Route } from "./router";
import { useReadiness } from "./SetupProvider";
import { StateShape } from "./StatusPill";

export const WORDMARK = "TimeWraith";
export const REDUCE_MOTION_LABEL = "Reduce motion";

/** Visible state text of the Reduce Motion toggle. */
export function motionStateText(reduceMotion: boolean, source: ReduceMotionSource): string {
  if (!reduceMotion) return "Motion: on";
  return source === "system" ? "Motion: reduced (system setting)" : "Motion: reduced";
}

const LINKS = [
  { page: "cases", label: NAV.cases, match: ["cases", "case"] },
  { page: "new", label: NAV.newCase, match: ["new"] },
  { page: "crew", label: NAV.crew, match: ["crew"] },
  { page: "about", label: NAV.about, match: ["about"] },
] as const;

/** Header: wordmark, the four pages, the Crew readiness (links to Crew setup) and the Reduce Motion toggle. */
export function AppBar({ route }: { readonly route: Route }) {
  const { online, checking } = useApi();
  const { ready } = useReadiness();
  const { reduceMotion, source, toggle } = useReduceMotion();
  const { announce } = useLiveAnnouncer();

  const readiness = !online ? (checking ? READINESS.checking : READINESS.offline) : ready ? READINESS.ready : READINESS.notReady;
  const shape = !online ? (checking ? "queued" : "failed") : ready ? "done" : "waiting";

  return (
    <header className="appbar">
      <div className="appbar__inner">
        <a className="appbar__wordmark" href={href({ page: "home" })} aria-current={route.page === "home" ? "page" : undefined}>
          {WORDMARK}
        </a>
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
        <a className="appbar__ready status-pill" data-state={shape} href={href({ page: "crew" })}>
          <StateShape state={shape} size={18} />
          <span>{readiness}</span>
        </a>
        <button
          type="button"
          className="appbar__motion"
          aria-pressed={reduceMotion}
          onClick={() => announce(toggle() ? "Reduced motion on" : "Reduced motion off")}
          data-motion-source={source}
        >
          <span className="visually-hidden">{REDUCE_MOTION_LABEL}: </span>
          {motionStateText(reduceMotion, source)}
        </button>
      </div>
    </header>
  );
}
