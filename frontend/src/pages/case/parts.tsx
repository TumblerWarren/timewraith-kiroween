import { useEffect, useState, type ReactNode } from "react";
import type { Investigation, Stage } from "../../api/types";
import { caseHref } from "../../app/router";
import type { CaseState } from "../../app/status";
import { StatusPill } from "../../app/StatusPill";
import { CASE_PAGE } from "../../content/app";
import { CREW_BY_ID } from "../../content/crew";
import { FLOW_STEPS, type FlowStepId } from "../../content/flow";
import { CrewSigil } from "./CrewSigil";
import { DoctorStitch } from "../../animation/react/DoctorStitch";

/** The status banner at the top of a case: state, what is happening, who is on it, and the one next action. */
export function StatusBanner({ state, children }: { readonly state: CaseState; readonly children?: ReactNode }) {
  return (
    <section className="banner case-brief" data-state={state.id} aria-labelledby="case-status" aria-live="polite">
      <div className="banner__figure" aria-hidden="true">
        {state.mascot === "doctor-stitch"
          ? <DoctorStitch state={state.id === "running" ? "working" : "verified"} />
          : <CrewSigil key={state.mascot} id={state.mascot} active={state.id === "running"} />}
      </div>
      <div className="banner__text">
        <h2 id="case-status" className="banner__title">
          <StatusPill state={state.id} label={state.label} />
        </h2>
        <p className="banner__detail">{state.detail}</p>
        {state.id === "running" && <p className="case-note">{CREW_BY_ID[state.mascot].name}</p>}
      </div>
      {children ? <div className="banner__actions">{children}</div> : null}
    </section>
  );
}

export type StepStatus = "done" | "now" | "waiting" | "failed" | "ahead" | "skipped";

const ORDER: readonly FlowStepId[] = FLOW_STEPS.map((s) => s.id);

/** Each step's state from the backend's phase and stage. */
export function stepStates(phase: FlowStepId, stage: Stage, bugs: number): Readonly<Record<FlowStepId, StepStatus>> {
  const at = ORDER.indexOf(phase);
  const out = {} as Record<FlowStepId, StepStatus>;
  ORDER.forEach((id, i) => {
    if (stage === "completed") {
      out[id] = id === "fix" && bugs === 0 ? "skipped" : "done";
      return;
    }
    if (i < at) out[id] = "done";
    else if (i > at) out[id] = "ahead";
    else if (stage === "awaiting-plan-approval") out[id] = "waiting";
    else if (stage === "failed" || stage === "cancelled") out[id] = "failed";
    else out[id] = "now";
  });
  return out;
}

/** One short result per step, from the full record. */
export function stepResult(id: FlowStepId, inv: Investigation | null): string | null {
  if (!inv) return null;
  switch (id) {
    case "repository":
      return inv.target.revision ? `${inv.target.ref} @ ${inv.target.revision.slice(0, 7)}` : null;
    case "discovery": {
      const c = inv.feature_map?.candidates;
      return c ? `${c.length} candidates, ${c.filter((x) => x.selected).length} kept` : null;
    }
    case "design": {
      const e = inv.test_plan?.experiments;
      return e ? `${e.filter((x) => x.status === "designed" || x.status === "swept").length} of ${e.length} experiments ready` : null;
    }
    case "execution": {
      if (inv.sweeps.length === 0) return null;
      const points = inv.sweeps.reduce((n, s) => n + s.points_run, 0);
      const broken = inv.sweeps.reduce((n, s) => n + s.violations.length, 0);
      return `${points} clock points, ${broken} broken ${broken === 1 ? "rule" : "rules"}`;
    }
    case "verification":
      return inv.stage === "verifying" || inv.bugs.length > 0 || inv.stage === "fixing" || inv.stage === "completed"
        ? `${inv.bugs.length} reproduced`
        : null;
    case "fix": {
      const tried = inv.bugs.filter((b) => b.fix.state !== "not-started" && b.fix.state !== "skipped").length;
      return tried > 0 ? `${inv.bugs.filter((b) => b.fix.state === "verified").length} of ${inv.bugs.length} verified` : null;
    }
  }
}

/** The six steps as a row with done, now, waiting, stopped or not-yet marks and a short result. */
export function Stepper({ states, inv }: { readonly states: Readonly<Record<FlowStepId, StepStatus>>; readonly inv: Investigation | null }) {
  return (
    <ol className="stepper" role="list" aria-label={CASE_PAGE.stepsLabel}>
      {FLOW_STEPS.map((step) => {
        const st = states[step.id];
        const result = stepResult(step.id, inv);
        return (
          <li key={step.id} className="stepper__step" data-state={st} aria-current={st === "now" || st === "waiting" || st === "failed" ? "step" : undefined}>
            <span className="stepper__mark" aria-hidden="true">
              {MARK[st]}
            </span>
            <span className="stepper__fig"><CrewSigil id={step.lead} /></span>
            <span className="stepper__title">{step.sign}</span>
            <span className="stepper__state">
              {CASE_PAGE.stepState[st]}
              {step.kind === "kiro-agent" ? " · Kiro agent" : " · code"}
            </span>
            {result ? <span className="stepper__result mono">{result}</span> : null}
            <span className="visually-hidden">Owner: {CREW_BY_ID[step.lead].name}</span>
          </li>
        );
      })}
    </ol>
  );
}

const MARK: Readonly<Record<StepStatus, string>> = { done: "✓", now: "●", waiting: "!", failed: "✕", ahead: "○", skipped: "–" };

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The current time, ticking every second while `running`. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  return now;
}

export interface Limits {
  readonly agent_calls: number;
  readonly minutes: number;
}

/** Time used, agent calls, bugs and verified fixes, each against its limit where there is one. */
export function Counters({ inv, running, limits }: { readonly inv: Investigation | null; readonly running: boolean; readonly limits: Limits | null }) {
  const now = useNow(running);
  if (!inv) return null;
  const verified = inv.bugs.filter((b) => b.fix.state === "verified").length;
  // While it runs the backend only adds active time at the end of each phase, so show the time since it was opened.
  const time: [string, string] = running
    ? [CASE_PAGE.counters.open, mmss(Math.max(0, (now - Date.parse(inv.created_at)) / 1000))]
    : [CASE_PAGE.counters.elapsed, `${mmss(inv.budget.active_seconds)}${limits ? ` of ${limits.minutes}:00` : ""}`];
  const items: readonly [string, string][] = [
    time,
    [CASE_PAGE.counters.agents, `${inv.budget.agent_calls}${limits ? ` of ${limits.agent_calls}` : ""}`],
    [CASE_PAGE.counters.bugs, String(inv.bugs.length)],
    [CASE_PAGE.counters.fixes, String(verified)],
  ];
  return (
    <dl className="counters">
      {items.map(([k, v]) => (
        <div key={k} className="counters__item">
          <dt>{k}</dt>
          <dd className="mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tabs as links, so each tab has its own address. */
export function CaseTabs({ id, tab, counts }: { readonly id: string; readonly tab: string; readonly counts: Partial<Record<keyof typeof CASE_PAGE.tabs, number>> }) {
  return (
    <nav className="tabs" aria-label={CASE_PAGE.tabsLabel}>
      <ul role="list" className="tabs__list">
        {(Object.keys(CASE_PAGE.tabs) as (keyof typeof CASE_PAGE.tabs)[]).map((t) => (
          <li key={t}>
            <a className="tabs__tab" href={caseHref(id, t)} aria-current={t === tab ? "page" : undefined}>
              {CASE_PAGE.tabs[t]}
              {counts[t] ? <span className="tabs__count">{counts[t]}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
