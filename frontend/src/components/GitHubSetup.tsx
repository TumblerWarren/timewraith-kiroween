import { useState } from "react";
import { useReadiness } from "../app/SetupProvider";
import { GITHUB_SETUP as copy } from "../content/copy";

export function GitHubSetup() {
  const { status, busyAction, act } = useReadiness();
  const [confirming, setConfirming] = useState(false);
  const github = status?.github;
  if (!github) return null;
  const blocked = !status.docker.running;
  const building = github.install === "building" || github.install === "starting" || busyAction === "githubStart";
  const waiting = github.login.state === "pending" && !github.connected;
  const busy = busyAction !== null;
  const state = blocked ? "blocked" : building || waiting ? "busy" : github.connected ? "done" : "todo";

  return (
    <li className="crew-setup__step" data-state={state}>
      <p className="crew-setup__name">
        {copy.title}
        {!blocked && building && <span className="crew-setup__state" role="status"> {copy.building}</span>}
      </p>
      <p className="crew-setup__hint">{copy.help}</p>
      {blocked ? <p className="crew-setup__hint">{copy.blocked}</p>
        : building ? null
        : github.container !== "running" ? (
          <button type="button" className="btn" disabled={busy} onClick={() => act("githubStart")}>{copy.start}</button>
        ) : waiting ? (
          <div className="crew-setup__device">
            <p role="status">{copy.waiting}</p>
            {github.login.code && <p className="crew-setup__code mono" aria-label={copy.code}>{github.login.code}</p>}
            <div className="actions">
              {github.login.url && <a className="btn btn--primary" href={github.login.url} target="_blank" rel="noreferrer">{copy.open}</a>}
              <button type="button" className="btn" disabled={busy} onClick={() => act("githubCancel")}>{copy.cancel}</button>
            </div>
          </div>
        ) : github.connected ? (
          <>
            <p className="crew-setup__state">{github.user ? copy.connectedAs(github.user) : copy.connected}</p>
            {confirming ? (
              <div className="crew-setup__device" role="group" aria-label={copy.disconnect}>
                <p>{copy.disconnectWarning}</p>
                <div className="actions">
                  <button type="button" className="btn" disabled={busy} onClick={() => { setConfirming(false); act("githubLogout"); }}>{copy.disconnect}</button>
                  <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>{copy.keep}</button>
                </div>
              </div>
            ) : <button type="button" className="btn btn--small" disabled={busy} onClick={() => setConfirming(true)}>{copy.disconnect}</button>}
          </>
        ) : <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act("githubLogin")}>{copy.connect}</button>}
      {github.install_error && <p className="crew-setup__error" role="alert">{github.install_error}</p>}
      {github.login.error && <p className="crew-setup__error" role="alert">{github.login.error}</p>}
    </li>
  );
}
