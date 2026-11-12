import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "../api/ApiProvider";
import { ApiError } from "../api/client";
import type { SetupStatus } from "../api/types";

/**
 * Docker, the Kiro Crew container and the Kiro sign-in, shared by the header, the home page and the Crew page.
 * Polls `GET /system/setup` every 3 s while something is starting or a sign-in is pending, otherwise every 15 s.
 */
export type StepState = "done" | "busy" | "todo" | "blocked";
export type SetupAction = "docker" | "crew" | "login" | "logout";

export interface Readiness {
  readonly status: SetupStatus | null;
  readonly docker: StepState;
  readonly crew: StepState;
  readonly login: StepState;
  /** True when investigations can run with real Kiro agents. */
  readonly ready: boolean;
  readonly busyAction: string | null;
  readonly error: string | null;
  readonly act: (name: SetupAction) => void;
}

const POLL_BUSY_MS = 3000;
const POLL_IDLE_MS = 15000;

const OFFLINE: Readiness = {
  status: null,
  docker: "todo",
  crew: "blocked",
  login: "blocked",
  ready: false,
  busyAction: null,
  error: null,
  act: () => undefined,
};

const SetupContext = createContext<Readiness>(OFFLINE);

export function readinessOf(s: SetupStatus | null): Pick<Readiness, "docker" | "crew" | "login" | "ready"> {
  if (!s) return { docker: "todo", crew: "blocked", login: "blocked", ready: false };
  const docker: StepState = s.docker.running ? "done" : s.docker.starting ? "busy" : "todo";
  const crewBusy = s.crew.install === "pulling" || s.crew.install === "starting";
  const crew: StepState = !s.docker.running ? "blocked" : s.crew.container === "running" ? "done" : crewBusy ? "busy" : "todo";
  const login: StepState = s.crew.signed_in ? "done" : crew !== "done" ? "blocked" : s.login.state === "pending" ? "busy" : "todo";
  return { docker, crew, login, ready: docker === "done" && crew === "done" && login === "done" };
}

export function SetupProvider({ children }: { readonly children: ReactNode }) {
  const { api, online } = useApi();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!api) return;
    api.setup().then(setStatus, () => setStatus(null));
  }, [api]);

  const s = online ? status : null;
  const inProgress = !!s && (s.docker.starting || s.crew.install === "pulling" || s.crew.install === "starting" || s.login.state === "pending");
  useEffect(() => {
    if (!api || !online) return;
    refresh();
    const timer = window.setInterval(refresh, inProgress ? POLL_BUSY_MS : POLL_IDLE_MS);
    return () => window.clearInterval(timer);
  }, [api, online, inProgress, refresh]);

  const act = useCallback(
    (name: SetupAction) => {
      if (!api) return;
      const fns = { docker: api.startDocker, crew: api.startCrew, login: api.startLogin, logout: api.logout };
      const fn = fns[name];
      setBusyAction(name);
      setError(null);
      fn().then(
        (next) => {
          setStatus(next);
          setBusyAction(null);
        },
        (e: unknown) => {
          setError(e instanceof ApiError ? e.message : String(e));
          setBusyAction(null);
        },
      );
    },
    [api],
  );

  const value = useMemo<Readiness>(() => ({ status: s, ...readinessOf(s), busyAction, error, act }), [s, busyAction, error, act]);
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useReadiness(): Readiness {
  return useContext(SetupContext);
}
