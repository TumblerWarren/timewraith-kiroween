import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Api } from "./client";
import type { Health } from "./types";

/**
 * Backend connection state. `online` follows `GET /health`, checked at mount and every 30 s. Components rendered
 * without the provider (isolated tests) see `{ api: null, online: false }`, so they behave as offline and never
 * touch the network.
 */
export interface ApiState {
  readonly api: Api | null;
  readonly online: boolean;
  readonly health: Health | null;
  /** True until the first health check finished. */
  readonly checking: boolean;
}

const OFFLINE: ApiState = { api: null, online: false, health: null, checking: false };
const ApiContext = createContext<ApiState>(OFFLINE);

const RECHECK_MS = 30_000;

export function ApiProvider({ api, children }: { readonly api: Api; readonly children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .health()
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth(null))
        .finally(() => alive && setChecking(false));
    void check();
    const timer = window.setInterval(check, RECHECK_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [api]);

  const value = useMemo<ApiState>(() => ({ api, online: health !== null, health, checking }), [api, health, checking]);
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiState {
  return useContext(ApiContext);
}
