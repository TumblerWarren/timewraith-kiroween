import { useApi } from "../api/ApiProvider";
import { useReadiness } from "../app/SetupProvider";
import { StatusPill } from "../app/StatusPill";
import { CrewSetup } from "../components/CrewSetup";
import { CrewAwakening, UmbrellaGhost } from "../components/cinematic/CrewAwakening";
import { SETUP } from "../content/copy";
import { SETUP_STATES, setupChecks } from "../data/setup-checklist";

/** `#/crew`: the three setup steps with their actions, then what the backend reports about this machine. */
export function CrewPage() {
  const { health } = useApi();
  const { status, ready, busyAction, docker, crew, login } = useReadiness();
  const limits = health?.limits;
  const busy = busyAction !== null || docker === "busy" || crew === "busy" || login === "busy";
  return (
    <article className="page crew-page" aria-labelledby="page-title">
      <header className="crew-page__hero">
        <div>
          <h1 id="page-title" className="page__title" tabIndex={-1}>
            {SETUP.title}
          </h1>
          <p className="page__lead">
            Investigations run Kiro agents inside the Kiro Crew container and the repository's code inside separate Docker sandboxes. Nothing is installed on this
            machine apart from Docker.
          </p>
          <CrewAwakening />
        </div>
        <UmbrellaGhost busy={busy} />
      </header>

      <div className="split">
        <section className="sheet" aria-labelledby="setup-steps">
          <h2 id="setup-steps" className="panel__title">
            Steps <StatusPill state={ready ? "done" : "waiting"} label={ready ? "Ready" : "Not ready yet"} />
          </h2>
          <CrewSetup />
        </section>

        <aside className="split__aside">
          <section className="panel" aria-labelledby="machine-title">
            <h2 id="machine-title" className="panel__title">
              This machine
            </h2>
            <ul role="list" className="checks">
              {setupChecks(health).map((c) => (
                <li key={c.id} data-state={c.state === "ready" ? "pass" : c.state === "attention" ? "fail" : "unknown"}>
                  <span className="checks__mark" aria-hidden="true">
                    {SETUP_STATES[c.state].glyph}
                  </span>
                  <span>
                    <strong>{c.label}</strong> {SETUP_STATES[c.state].text}
                    {c.detail ? <span className="row__meta"> · {c.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {limits ? (
            <section className="panel" aria-labelledby="limits-title">
              <h2 id="limits-title" className="panel__title">
                Limits per investigation
              </h2>
              <dl className="facts">
                <div>
                  <dt>Time</dt>
                  <dd>{limits.minutes} minutes of active work</dd>
                </div>
                <div>
                  <dt>Agent calls</dt>
                  <dd>{limits.agent_calls}</dd>
                </div>
                <div>
                  <dt>Bugs fixed</dt>
                  <dd>up to {limits.bugs_to_fix}, with {limits.fix_attempts} attempts each</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {status ? (
            <section className="panel" aria-labelledby="cleanup-title">
              <h2 id="cleanup-title" className="panel__title">
                Remove the Crew later
              </h2>
              <p>Run these in a terminal to delete the container and its sign-in:</p>
              <pre className="code mono">{`docker rm -f timewraith-crew\ndocker volume rm timewraith-crew-home`}</pre>
              <p className="row__meta mono">{status.crew.image}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
