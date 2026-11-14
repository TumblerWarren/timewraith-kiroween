import { useApi } from "../api/ApiProvider";
import { href } from "../app/router";
import { useReadiness } from "../app/SetupProvider";
import { StatusPill } from "../app/StatusPill";
import { HOME } from "../content/app";

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
