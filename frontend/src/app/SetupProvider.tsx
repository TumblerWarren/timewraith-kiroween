import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "../api/ApiProvider";
import { ApiError } from "../api/client";
import type { LoginMethod, SetupStatus } from "../api/types";
import { sharingError } from "./status";

/**
 * Docker, the Kiro Crew container and the Kiro sign-in, shared by the header, the home page and the Crew page.
 * Polls `GET /system/setup` every 3 s while something is starting or a sign-in is pending, otherwise every 15 s.
 */
export type StepState = "done" | "busy" | "todo" | "blocked";
export type SetupAction = "docker" | "crew" | "login" | "cancelLogin" | "logout" | "delete"
  | "githubStart" | "githubLogin" | "githubCancel" | "githubLogout";

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
  /** Start the Kiro sign-in with one method. */
  readonly signIn: (method: LoginMethod) => void;
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
  signIn: () => undefined,
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
  const actionPending = useRef(false);
  const request = useRef(0);

  const refresh = useCallback(() => {
    if (!api || actionPending.current) return;
    const current = ++request.current;
    api.setup().then(
      (next) => { if (request.current === current) setStatus(next); },
      () => { if (request.current === current) setStatus(null); },
    );
  }, [api]);

  const s = online ? status : null;
  const inProgress = !!s && (s.docker.starting || s.crew.install === "pulling" || s.crew.install === "starting" || s.login.state === "pending"
    || s.github?.install === "building" || s.github?.install === "starting" || s.github?.login.state === "pending");
  useEffect(() => {
    if (!api || !online) return;
    refresh();
  }, [api, online, refresh]);
  useEffect(() => {
    if (!api || !online) return;
    const timer = window.setInterval(refresh, inProgress ? POLL_BUSY_MS : POLL_IDLE_MS);
    return () => window.clearInterval(timer);
  }, [api, online, inProgress, refresh]);

  const run = useCallback((name: string, fn: () => Promise<SetupStatus>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    request.current++;
    setBusyAction(name);
    setError(null);
    fn().then(
      (next) => {
        setStatus(next);
        actionPending.current = false;
        setBusyAction(null);
      },
      (e: unknown) => {
        setError(e instanceof ApiError && name.startsWith("github") ? sharingError(e.code, e.message) : e instanceof Error ? e.message : String(e));
        actionPending.current = false;
        setBusyAction(null);
      },
    );
  }, []);

  const act = useCallback(
    (name: SetupAction) => {
      if (!api) return;
      const fns = {
        docker: api.startDocker,
        crew: api.startCrew,
        login: () => api.startLogin("builder_id"),
        cancelLogin: api.cancelLogin,
        logout: api.logout,
        delete: api.deleteCrew,
        githubStart: api.githubStart,
        githubLogin: api.githubLogin,
        githubCancel: api.githubCancel,
        githubLogout: api.githubLogout,
      };
      run(name, fns[name]);
    },
    [api, run],
  );

  const signIn = useCallback(
    (method: LoginMethod) => {
      if (api) run("login", () => api.startLogin(method));
    },
    [api, run],
  );

  const value = useMemo<Readiness>(
    () => ({ status: s, ...readinessOf(s), busyAction, error, act, signIn }),
    [s, busyAction, error, act, signIn],
  );
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useReadiness(): Readiness {
  return useContext(SetupContext);
}
