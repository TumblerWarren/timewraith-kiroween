import { useState } from "react";
import { useApi } from "../api/ApiProvider";
import { useReadiness, type StepState } from "../app/SetupProvider";
import { DOCKER_SETUP, SETUP } from "../content/copy";
import { GitHubSetup } from "./GitHubSetup";

const MARK: Readonly<Record<StepState, string>> = { done: "✓", busy: "…", todo: "○", blocked: "–" };

/**
 * The three setup steps, each with the one action that moves it on:
 * 1. Docker Desktop: "Start Docker" (only when the backend can launch it on this machine).
 * 2. Kiro Crew: "Start Kiro Crew" pulls the official image and runs it as a container with no repository.
 * 3. Kiro sign-in: "Sign in to Kiro" starts kiro-cli's device flow in the container; the one-time code and the sign-in
 *    page are shown here, and you approve in your own browser. The backend never sees a password.
 * State comes from the shared SetupProvider.
 */
export function CrewSetup() {
  const { online } = useApi();
  const { status: s, docker, crew, login, busyAction, error, act, signIn } = useReadiness();
  const [confirming, setConfirming] = useState(false);
  if (!online || !s) return <p className="crew-setup__hint">The backend is offline, so the Crew cannot be set up from here.</p>;
  const busy = busyAction !== null;

  return (
    <div className="crew-setup" data-testid="crew-setup">
      <ol className="crew-setup__steps" role="list">
        <li className="crew-setup__step" data-state={docker}>
          <p className="crew-setup__name">
            <span className="crew-setup__mark" aria-hidden="true">
              {MARK[docker]}
            </span>
            {s.docker.running && !s.docker.can_start ? <span>{DOCKER_SETUP.running}</span> : (
              <>{SETUP.docker}<span className="crew-setup__state"> {SETUP.state.docker[docker]}</span></>
            )}
          </p>
          {docker === "todo" ? (
            s.docker.can_start ? (
              <button type="button" className="btn" disabled={busy} onClick={() => act("docker")}>
                {SETUP.startDocker}
              </button>
            ) : (
              <p className="crew-setup__hint">{s.docker.installed ? SETUP.dockerManual : SETUP.dockerMissing}</p>
            )
          ) : null}
        </li>

        <li className="crew-setup__step" data-state={crew}>
          <p className="crew-setup__name">
            <span className="crew-setup__mark" aria-hidden="true">
              {MARK[crew]}
            </span>
            {SETUP.crew}
            <span className="crew-setup__state"> {s.crew.install === "pulling" ? SETUP.pulling : SETUP.state.crew[crew]}</span>
          </p>
          {crew === "todo" ? (
            <button type="button" className="btn" disabled={busy} onClick={() => act("crew")}>
              {SETUP.startCrew}
            </button>
          ) : null}
          {s.crew.install === "failed" && s.crew.install_error ? <p className="crew-setup__error">{s.crew.install_error}</p> : null}
        </li>

        <li className="crew-setup__step" data-state={login}>
          <p className="crew-setup__name">
            <span className="crew-setup__mark" aria-hidden="true">
              {MARK[login]}
            </span>
            {SETUP.login}
            <span className="crew-setup__state"> {SETUP.state.login[login]}</span>
          </p>
          {login === "todo" ? (
            <div className="crew-setup__device" role="group" aria-label={SETUP.login}>
              <p className="crew-setup__hint">{s.login.state === "failed" ? SETUP.retryLead : SETUP.methodHint}</p>
              <div className="actions">
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => signIn("google")}>
                  {SETUP.signInGoogle}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => signIn("github")}>
                  {SETUP.signInGitHub}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => signIn("builder_id")}>
                  {SETUP.startLogin}
                </button>
              </div>
            </div>
          ) : null}
          {login === "busy" && s.login.code ? (
            <div className="crew-setup__device" role="status">
              <p>{SETUP.deviceLead}</p>
              <p className="crew-setup__code mono" aria-label={`${SETUP.codeLabel}: ${s.login.code.split("").join(" ")}`}>
                {s.login.code}
              </p>
              {s.login.url ? (
                <a className="btn btn--primary" href={s.login.url} target="_blank" rel="noopener noreferrer">
                  {SETUP.openSignIn}
                </a>
              ) : null}
              <p className="crew-setup__hint">{SETUP.deviceWait}</p>
              <p className="crew-setup__hint">{SETUP.otherAccountHint}</p>
            </div>
          ) : null}
          {login === "busy" ? (
            <div className="actions">
              <p className="crew-setup__hint">{SETUP.cancelHint}</p>
              <button type="button" className="btn btn--small" disabled={busyAction === "cancelLogin"} onClick={() => act("cancelLogin")}>
                {SETUP.cancelLogin}
              </button>
            </div>
          ) : null}
          {s.login.state === "failed" && s.login.error && login !== "done" ? <p className="crew-setup__error">{s.login.error}</p> : null}
          {login === "done" ? (
            <>
              {s.crew.account ? (
                <p className="crew-setup__hint">
                  {SETUP.signedInAs} <span className="mono">{s.crew.account}</span>
                </p>
              ) : null}
              {confirming ? (
                <div className="crew-setup__device" role="group" aria-labelledby="logout-warn">
                  <p id="logout-warn">{SETUP.logoutWarn}</p>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        setConfirming(false);
                        act("logout");
                      }}
                    >
                      {SETUP.logoutConfirm}
                    </button>
                    <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
                      {SETUP.logoutCancel}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button type="button" className="btn btn--small" disabled={busy} onClick={() => setConfirming(true)}>{SETUP.logout}</button>
                  <button type="button" className="btn btn--small" disabled={busy} onClick={() => act("logout")}>{SETUP.switchAccount}</button>
                </div>
              )}
            </>
          ) : null}
        </li>
        <GitHubSetup />
      </ol>
      {error ? (
        <p className="crew-setup__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
