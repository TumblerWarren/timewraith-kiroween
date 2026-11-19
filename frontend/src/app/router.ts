import { useEffect, useState } from "react";

/**
 * Hash routes, so reload, back and links work with no server change and no router dependency.
 *
 *   #/                 clock landing
 *   #/home             home / how it works
 *   #/new              open a case
 *   #/cases            every case
 *   #/cases/:id[/tab]  one case (tab: overview, plan, findings, fixes, activity)
 *   #/cases/:id/plan/:view  discovery or execution evidence
 *   #/crew             Crew setup
 *   #/about            how it works
 */
export const CASE_TABS = ["overview", "plan", "findings", "fixes", "activity"] as const;
export type CaseTab = (typeof CASE_TABS)[number];
export type PlanView = "discovery" | "execution";

export type Route =
  | { readonly page: "landing"; readonly replay?: boolean }
  | { readonly page: "home" }
  | { readonly page: "new"; readonly repoUrl?: string }
  | { readonly page: "cases" }
  | { readonly page: "case"; readonly id: string; readonly tab: CaseTab; readonly planView?: PlanView }
  | { readonly page: "crew" }
  | { readonly page: "about" }
  | { readonly page: "not-found"; readonly path: string };

const isTab = (s: string | undefined): s is CaseTab => (CASE_TABS as readonly string[]).includes(s ?? "");

export function parseHash(hash: string): Route {
  if (hash === "#/?replay=1") return { page: "landing", replay: true };
  if (hash.startsWith("#/new?")) {
    const repoUrl = new URLSearchParams(hash.slice(6)).get("repo");
    return repoUrl ? { page: "new", repoUrl } : { page: "new" };
  }
  const path = hash.replace(/^#/, "").replace(/^\/+|\/+$/g, "");
  const [head, id, tab, ...rest] = path.split("/").map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const [planView] = rest;
  if (rest.length === 1 && head === "cases" && id && tab === "plan" && (planView === "discovery" || planView === "execution")) {
    return { page: "case", id, tab, planView };
  }
  if (rest.length > 0) return { page: "not-found", path };
  switch (head ?? "") {
    case "":
      return id === undefined ? { page: "landing" } : { page: "not-found", path };
    case "home":
    case "new":
    case "crew":
    case "about":
      return id === undefined ? { page: head as "home" | "new" | "crew" | "about" } : { page: "not-found", path };
    case "cases":
      if (id === undefined) return { page: "cases" };
      if (!id || (tab !== undefined && !isTab(tab))) return { page: "not-found", path };
      return { page: "case", id, tab: isTab(tab) ? tab : "overview" };
    default:
      return { page: "not-found", path };
  }
}

export function href(route: Route): string {
  switch (route.page) {
    case "landing":
      return route.replay ? "#/?replay=1" : "#/";
    case "new":
      return route.repoUrl ? `#/new?${new URLSearchParams({ repo: route.repoUrl })}` : "#/new";
    case "case":
      return `#/cases/${encodeURIComponent(route.id)}${route.tab === "overview" ? "" : `/${route.tab}`}${route.tab === "plan" && route.planView ? `/${route.planView}` : ""}`;
    case "not-found":
      return `#/${route.path}`;
    default:
      return `#/${route.page}`;
  }
}

export const caseHref = (id: string, tab: CaseTab = "overview", planView?: PlanView) => href({ page: "case", id, tab, planView });

export function navigate(route: Route | string): void {
  const target = typeof route === "string" ? route : href(route);
  if (window.location.hash === target) return;
  window.location.hash = target;
}

/** The current route; follows hash changes. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
