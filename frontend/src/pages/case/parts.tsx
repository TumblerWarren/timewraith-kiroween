import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Investigation, Stage } from "../../api/types";
import { caseHref, type CaseTab, type PlanView } from "../../app/router";
import type { CaseState } from "../../app/status";
import { StatusPill } from "../../app/StatusPill";
import { CASE_PAGE } from "../../content/app";
import { CREW_BY_ID } from "../../content/crew";
import { FLOW_STEPS, type FlowStepId } from "../../content/flow";
import { CrewSigil } from "./CrewSigil";
import { DoctorStitch } from "../../animation/react/DoctorStitch";
import { CaseFlowIcon } from "./CaseFlowIcon";
import { RunPathGhost, type GhostDestination } from "../../animation/react/RunPathGhost";

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

const compactCount = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

/** The visible result and its narrow-screen caption. */
function stepResult(id: FlowStepId, inv: Investigation | null): readonly [string, string] | null {
  if (!inv) return null;
  switch (id) {
    case "repository":
      return inv.target.revision ? ["Commit pinned", "Pinned"] : null;
    case "discovery": {
      const c = inv.feature_map?.candidates;
      return c ? [`${c.length.toLocaleString()} ${c.length === 1 ? "candidate" : "candidates"}`, `${compactCount.format(c.length)} found`] : null;
    }
    case "design": {
      const e = inv.test_plan?.experiments;
      return e ? [`${e.length} ${e.length === 1 ? "experiment" : "experiments"}`, `${e.length} ${e.length === 1 ? "test" : "tests"}`] : null;
    }
    case "execution": {
      if (inv.sweeps.length === 0) return null;
      const points = inv.sweeps.reduce((n, s) => n + s.points_run, 0);
      return [`${points.toLocaleString()} clock points`, compactCount.format(points)];
    }
    case "verification":
      return inv.stage === "verifying" || inv.bugs.length > 0 || inv.stage === "fixing" || inv.stage === "completed"
        ? [`${inv.bugs.length} ${inv.bugs.length === 1 ? "bug" : "bugs"} reproduced`, `${inv.bugs.length} ${inv.bugs.length === 1 ? "bug" : "bugs"}`]
        : null;
    case "fix": {
      const verified = inv.bugs.filter((b) => b.fix.state === "verified");
      const approved = verified.filter((b) => b.fix.user_decision === "accepted").length;
      const quantity = `${verified.length} ${verified.length === 1 ? "fix" : "fixes"}`;
      return [`${quantity} ${approved > 0 && approved === verified.length ? "approved" : "verified"}`, quantity];
    }
  }
}

const GRAPH_NODES = [
  { id: "repository", tab: "overview", title: "Repository", short: "Repo" },
  { id: "plan", tab: "plan", title: "Plan", short: "Plan" },
  { id: "verification", tab: "findings", title: "Verification", short: "Verify" },
  { id: "fix", tab: "fixes", title: "Fix", short: "Fix" },
] as const satisfies readonly { id: "plan" | FlowStepId; tab: CaseTab; title: string; short: string }[];

const PLAN_PHASES = ["discovery", "design", "execution"] as const;
const STEP_LABELS: Readonly<Record<StepStatus, string>> = {
  done: "Complete", now: "In progress", waiting: "Needs approval", failed: "Stopped", ahead: "Queued", skipped: "Skipped",
};

const COMPACT_STATUS: Partial<Record<StepStatus, string>> = { now: "Running", waiting: "Review" };

export function RunGraph({ id, tab, states, inv }: {
  readonly id: string;
  readonly tab: CaseTab;
  readonly states: Readonly<Record<FlowStepId, StepStatus>>;
  readonly inv: Investigation | null;
}) {
  const [intent, setIntent] = useState<GhostDestination | null>(null);
  const planPhase = PLAN_PHASES.find((phase) => states[phase] !== "done") ?? "execution";
  const planState = states[planPhase];
  const livePhase = FLOW_STEPS.find((step) => states[step.id] === "now" || states[step.id] === "waiting" || states[step.id] === "failed")?.id;
  const liveNode = livePhase && PLAN_PHASES.some((phase) => phase === livePhase) ? "plan" : livePhase;
  const selected = GRAPH_NODES.find((node) => node.tab === tab)?.id ?? liveNode ?? "repository";
  const phase = FLOW_STEPS.map((step) => `${step.id}=${states[step.id]}`).join("/");
  return (
    <nav className="case-run-graph" aria-labelledby="case-run-path">
      <h2 id="case-run-path" className="case-label">Run path</h2>
      <RunPathGhost selected={selected} phase={phase} liveNode={liveNode} intent={intent} />
      <ol className="case-run-graph__steps" role="list" aria-label={CASE_PAGE.stepsLabel}>
        {GRAPH_NODES.map((node) => {
          const phase = node.id === "plan" ? planPhase : node.id;
          const state = node.id === "plan" ? planState : states[phase];
          const result = state === "done" ? stepResult(node.id === "plan" ? "design" : phase, inv) : null;
          const planView: PlanView | undefined = node.id === "plan" && state !== "done" && (phase === "discovery" || phase === "execution")
            ? phase : undefined;
          const phaseName = node.id === "plan" && state !== "done" && state !== "ahead"
            ? FLOW_STEPS.find((step) => step.id === phase)?.sign : null;
          return (
            <li key={node.id} data-state={state} data-flow-node={node.id}>
              <a className="case-run-graph__node" href={caseHref(id, node.tab, planView)}
                onClick={() => setIntent((last) => ({ node: node.id, sequence: (last?.sequence ?? 0) + 1 }))}
                aria-label={`${node.title}. ${phaseName ? `${phaseName}. ` : ""}${STEP_LABELS[state]}${result ? `. ${result[0]}` : ""}`}
                aria-current={tab === node.tab ? "location" : undefined}>
                <span className="case-run-graph__track" aria-hidden="true">
                  <span><CaseFlowIcon id={node.id} /></span>
                </span>
                <span className="case-run-graph__name case-run-graph__full">{node.title}</span>
                <span className="case-run-graph__short" aria-hidden="true">{node.short}</span>
                <span className="case-run-graph__result case-run-graph__full">
                  {result ? <><span className="visually-hidden">{STEP_LABELS[state]}. </span>{result[0]}</> : <>{phaseName && `${phaseName} · `}{STEP_LABELS[state]}</>}
                </span>
                <span className="case-run-graph__result case-run-graph__compact" aria-hidden="true">{result?.[1] ?? COMPACT_STATUS[state] ?? STEP_LABELS[state]}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

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

export function RunStatus({ state, inv, openedAt, running, activity, children }: {
  readonly state: CaseState;
  readonly inv: Investigation | null;
  readonly openedAt: string;
  readonly running: boolean;
  readonly activity?: ReactNode;
  readonly children?: ReactNode;
}) {
  const strip = useRef<HTMLElement>(null);
  const now = useNow(running);
  const time = running ? Math.max(0, (now - Date.parse(openedAt)) / 1000) : inv?.budget.active_seconds;
  const h = time === undefined ? 0 : Math.floor(time / 3600);
  const clock = time === undefined || !Number.isFinite(time) ? null : h > 0 ? `${h}h ${mmss(time % 3600)}` : mmss(time);

  useEffect(() => {
    const header = document.querySelector(".appbar");
    const element = strip.current;
    if (!header || !element) return;
    const measure = () => element.style.setProperty("--case-run-top", `${header.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={strip} className="case-run-status" aria-labelledby="case-status">
      <div className="case-run-status__line">
        <div className="case-run-status__brief" aria-live="polite">
          <h2 id="case-status"><StatusPill state={state.id} label={state.label} /></h2>
          <p>{state.detail}</p>
        </div>
        <div className="case-run-status__actions">
          {clock && <p className="case-run-status__time">{running ? CASE_PAGE.counters.open : CASE_PAGE.counters.elapsed} <span className="mono" role={running ? "timer" : undefined}>{clock}</span></p>}
          {children}
        </div>
      </div>
      {activity}
    </section>
  );
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
    ["Clock points", inv.sweeps.reduce((total, sweep) => total + sweep.points_run, 0).toLocaleString()],
    ["Experiments", String(inv.test_plan?.experiments.length ?? 0)],
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
