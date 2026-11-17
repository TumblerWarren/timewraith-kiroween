import { useState } from "react";
import { useApi } from "../api/ApiProvider";
import { ApiError } from "../api/client";
import { FINAL_STAGES } from "../api/types";
import { navigate } from "../app/router";
import { visibleTitle, type Case } from "./model";
import { useCaseStore } from "./store";

export function DeleteCaseButton({ c, leavePage = false }: { readonly c: Case; readonly leavePage?: boolean }) {
  const { api, online } = useApi();
  const { removeDraft, removeLive } = useCaseStore();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = c.kind === "live" && !FINAL_STAGES.includes(c.summary.stage);
  const unavailable = running || (c.kind === "live" && (!api || !online));
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      if (c.kind === "draft") removeDraft(c.id);
      else {
        if (!api) throw new Error("Connect to the backend to delete this case.");
        try { await api.deleteCase(c.id); } catch (e) {
          if (!(e instanceof ApiError && e.code === "not_found")) throw e;
        }
        removeLive(c.id);
      }
      if (leavePage) navigate({ page: "cases" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return <div className="case-delete">
    {confirming ? <div role="group" aria-label={`Delete ${visibleTitle(c)}`} className="case-delete__confirm">
      <p>Delete “{visibleTitle(c)}”? {c.kind === "draft" ? "This removes the draft from this browser." : "Its results, activity and local case files will be permanently removed."} This cannot be undone.</p>
      <div className="actions">
        <button type="button" className="btn btn--small case-delete__button" disabled={busy || unavailable} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete permanently"}</button>
        <button type="button" className="btn btn--small btn--quiet" disabled={busy} onClick={() => { setConfirming(false); setError(null); }}>Keep case</button>
      </div>
    </div> : <button type="button" className="btn btn--small case-delete__button" disabled={unavailable} onClick={() => setConfirming(true)}>
      Delete case<span className="visually-hidden">: {visibleTitle(c)}</span>
    </button>}
    {running && <p className="row__meta">Cancel and wait for the case to stop before deleting.</p>}
    {!running && c.kind === "live" && !online && <p className="row__meta">Connect to the backend to delete.</p>}
    {error && <p role="alert" className="alert">{error}</p>}
  </div>;
}
