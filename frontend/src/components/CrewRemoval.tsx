import { useState } from "react";
import { useReadiness } from "../app/SetupProvider";
import { DOCKER_SETUP } from "../content/copy";

export function CrewRemoval() {
  const { status, busyAction, error, act } = useReadiness();
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  if (!status) return null;
  const deleting = busyAction === "delete";
  const busy = busyAction !== null || status.crew.install === "pulling" || status.crew.install === "starting" || status.login.state === "pending";
  const deleted = requested && !busy && !error && status.crew.container === "missing";
  return (
    <section className="panel crew-removal" aria-labelledby="cleanup-title">
      <h2 id="cleanup-title" className="panel__title">Delete the Crew</h2>
      <p>Remove the Crew container and its saved Kiro sign-in from this machine. Your cases and downloaded image stay available.</p>
      {deleted ? <p role="status">Crew deleted. Use Start Kiro Crew to set it up again.</p> : confirming ? (
        <div className="crew-setup__device" role="group" aria-labelledby="crew-delete-warning">
          <p id="crew-delete-warning">Delete the Crew and saved sign-in? Running investigations will lose their Kiro agents. You will need to set up and sign in again.</p>
          {status.docker.running && !status.docker.can_start && <p className="crew-setup__hint">{DOCKER_SETUP.recreate}</p>}
          <div className="actions">
            <button type="button" className="btn crew-removal__delete" disabled={busy || !status.docker.running} onClick={() => {
              setConfirming(false);
              setRequested(true);
              act("delete");
            }}>Delete Crew and sign-in</button>
            <button type="button" className="btn btn--quiet" disabled={deleting} onClick={() => setConfirming(false)}>Keep Crew</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn crew-removal__delete" disabled={busy || !status.docker.running} onClick={() => setConfirming(true)}>
          {deleting ? "Deleting Crew…" : "Delete Crew"}
        </button>
      )}
      {!status.docker.running && <p className="crew-setup__hint">Start Docker to delete the Crew.</p>}
    </section>
  );
}
