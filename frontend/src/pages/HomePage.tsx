import { useApi } from "../api/ApiProvider";
import { href } from "../app/router";
import { useReadiness } from "../app/SetupProvider";
import { StatusPill } from "../app/StatusPill";
import { useCaseStore } from "../cases/store";
import { Intro } from "../components/Intro";
import { LanternWraith } from "../components/cinematic/LanternWraith";
import { HOME } from "../content/app";
import { CaseRows } from "./CaseRows";

/** A one-line readiness summary with the way forward. */
export function ReadinessNote() {
  const { online, checking } = useApi();
  const { ready } = useReadiness();
  const state = !online ? (checking ? "queued" : "failed") : ready ? "done" : "waiting";
  const label = !online ? (checking ? "Checking the backend" : "Backend offline") : ready ? "Crew ready" : "Setup needed";
  const text = !online ? (checking ? HOME.readinessChecking : HOME.readinessOffline) : ready ? HOME.readinessReady : HOME.readinessNotReady;
  return (
    <section className="panel readiness" aria-labelledby="readiness-title" data-ready={ready ? "true" : "false"}>
      <h2 id="readiness-title" className="panel__title">
        {HOME.readinessTitle}
      </h2>
      <p className="readiness__line">
        <StatusPill state={state} label={label} />
      </p>
      <p className={!online && !checking ? "mono" : undefined}>{text}</p>
      {online && !ready ? (
        <p>
          <a className="btn" href={href({ page: "crew" })}>
            {HOME.setupLink}
          </a>
        </p>
      ) : null}
    </section>
  );
}

/** `#/`: what TimeWraith does, whether the Crew is ready, and the latest cases. */
export function HomePage() {
  const { cases } = useCaseStore();
  return (
    <article className="page page--home" aria-labelledby="page-title">
      <section className="hero">
        <div className="hero__copy">
          <h1 id="page-title" className="hero__title" tabIndex={-1}>
            Hunt the bugs<br />that hide in<br /><em>time.</em>
          </h1>
          <p className="page__lead">{HOME.lead}</p>
          <p className="actions">
            <a className="btn btn--primary" href={href({ page: "new" })}>
              {HOME.start}
            </a>
            <a className="btn" href={href({ page: "about" })}>
              How it works
            </a>
          </p>
          <Intro />
        </div>
        <div className="hero__art" aria-hidden="true">
          <LanternWraith />
        </div>
      </section>

      <div className="home-grid">
        <ReadinessNote />
        <section className="panel" aria-labelledby="recent-title">
          <h2 id="recent-title" className="panel__title">
            {HOME.recent}
          </h2>
          {cases.length === 0 ? (
            <p className="muted-note">{HOME.noCases}</p>
          ) : (
            <>
              <CaseRows cases={cases.slice(0, 3)} />
              <p>
                <a href={href({ page: "cases" })}>{HOME.allCases}</a>
              </p>
            </>
          )}
        </section>
      </div>
    </article>
  );
}
