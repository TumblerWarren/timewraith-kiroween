import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/ApiProvider";
import { ApiError } from "../api/client";
import { FINAL_STAGES, type Investigation, type InvestigationSummary, type ReplayEventMsg } from "../api/types";
import { attentionOf } from "../app/status";
import { useCaseStore } from "./store";

const REFRESH_DELAY_MS = 700;
const POLL_MS = 5000;

export function summaryOf(inv: Investigation): InvestigationSummary {
  return {
    id: inv.id,
    created_at: inv.created_at,
    target: inv.target,
    mode: inv.request.mode,
    stage: inv.stage,
    phase: inv.phase,
    status: inv.status,
    bug_count: inv.bugs.length,
    fix_verified_count: inv.bugs.filter((b) => b.fix.state === "verified").length,
    attention: attentionOf(inv.notes),
    replay_label: inv.replay_label,
    runtime_label: inv.runtime_label,
    error: inv.error,
    message: inv.stage === "failed" ? (inv.notes[inv.notes.length - 1] ?? null) : null,
  };
}

export interface InvestigationState {
  readonly inv: Investigation | null;
  readonly events: readonly ReplayEventMsg[];
  /** The backend could not be reached or answered with an error. */
  readonly error: string | null;
  readonly notFound: boolean;
  readonly refresh: () => Promise<void>;
}

/**
 * Loads one investigation, follows its event stream and refreshes the record after each event (throttled), with a
 * 5 s poll while it runs for proxies that drop the stream. Each fresh record also updates the case list.
 */
export function useInvestigation(id: string, enabled = true): InvestigationState {
  const { api } = useApi();
  const { upsertLive } = useCaseStore();
  const [inv, setInv] = useState<Investigation | null>(null);
  const [events, setEvents] = useState<readonly ReplayEventMsg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const pending = useRef<number | null>(null);
  const appliedRequest = useRef(0);
  const nextRequest = useRef(0);

  const refresh = useCallback((): Promise<void> => {
    if (!api || !enabled) return Promise.resolve();
    const request = ++nextRequest.current;
    return api.get(id).then(
      (full) => {
        if (request < appliedRequest.current) return;
        appliedRequest.current = request;
        setInv(full);
        setError(null);
        setNotFound(false);
        upsertLive(summaryOf(full));
      },
      (e: unknown) => {
        if (request < appliedRequest.current) return;
        appliedRequest.current = request;
        if (e instanceof ApiError && e.code === "not_found") setNotFound(true);
        setError(e instanceof ApiError ? e.message : "The backend could not be reached.");
      },
    );
  }, [api, enabled, id, upsertLive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!api || !enabled) return;
    const schedule = () => {
      if (pending.current !== null) return;
      pending.current = window.setTimeout(() => {
        pending.current = null;
        void refresh();
      }, REFRESH_DELAY_MS);
    };
    const stop = api.events(
      id,
      (e) => {
        setEvents((list) => (list.some((x) => x.seq === e.seq) ? list : [...list, e].sort((a, b) => a.seq - b.seq)));
        schedule();
      },
      schedule,
    );
    return () => {
      stop();
      if (pending.current !== null) window.clearTimeout(pending.current);
      pending.current = null;
    };
  }, [api, enabled, id, refresh]);

  const running = inv ? !FINAL_STAGES.includes(inv.stage) : enabled;
  useEffect(() => {
    if (!running || !enabled) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, enabled, refresh]);

  return { inv, events, error, notFound, refresh };
}
