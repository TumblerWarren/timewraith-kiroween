import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ReduceMotionProvider, useReduceMotion } from "../src/a11y/ReduceMotionProvider";
import { DoctorStitch } from "../src/animation/react/DoctorStitch";
import { FindingsBat } from "../src/animation/react/FindingsBat";
import { PlanOrchestration } from "../src/animation/react/PlanOrchestration";
import { FLOW_STEPS } from "../src/content/flow";
import "../src/styles/tokens.css";
import "../src/styles/fonts.css";
import "./case-layout.css";

const CASE_PATH = "/#/cases/1b20d89a-f785-48a2-805e-52fbadd775f3";
const TABS = ["Overview", "Plan", "Findings", "Fixes", "Activity"] as const;
type Tab = (typeof TABS)[number];

const RUN_STAGES = [
  { tab: "Overview", short: "Repo", result: "Commit pinned", compact: "Pinned", live: "Pinning the repository" },
  { tab: "Plan", short: "Discovery", result: "60 candidates", compact: "60 found", live: "Scanning for time-sensitive code" },
  { tab: "Plan", short: "Design", result: "8 experiments", compact: "8 tests", live: "Preparing the experiments" },
  { tab: "Plan", short: "Sweep", result: "18,779 clock points", compact: "18.8k", live: "Sweeping clock points across 13 zones" },
  { tab: "Findings", short: "Verify", result: "1 reproduced bug", compact: "1 bug", live: "Reproducing the Lord Howe failure" },
  { tab: "Fixes", short: "Fix", result: "1 approved fix", compact: "1 fix", live: "Doctor Stitch is checking the patch" },
] as const satisfies readonly { tab: Tab; short: string; result: string; compact: string; live: string }[];

const SIMULATION_SECONDS = 17;

const GATES = [
  ["Reproduce", "The original failed the regression test in all three replays."],
  ["Patch size", "Two files changed, with 12 lines added and one removed."],
  ["Fix verified", "The regression test passed in all three replays and the rule held in 13 zones."],
  ["Test sensitivity", "Removing the fix made the regression test fail again."],
  ["Regressions", "456 tests checked, with no new failures."],
  ["Fresh sweep", "Eight experiments reran with no new violations."],
  ["Static checks", "The repository had no typecheck or lint command configured."],
  ["Independent review", "The reviewer confirmed that the patch addresses the root cause."],
] as const;

const OUTCOMES = [
  { phase: "Fix", title: "Patch approved", detail: "Attempt 3 passed all eight verification gates." },
  { phase: "Verification", title: "One bug reproduced", detail: "The hourly schedule failed on the repeated half-hour." },
  { phase: "Execution", title: "Clock sweep finished", detail: "8 experiments covered 18,779 clock points." },
] as const;

const BUG_TITLE = "Hourly cron fails when clocks fall back 30 minutes";

function elapsedTime(seconds: number) {
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function FixRail({ recorded }: { readonly recorded: boolean }) {
  return (
    <aside className="tw-fix-rail" aria-label="Fix index and history">
      <section className="tw-card tw-fix-index" aria-labelledby="fix-index-title">
        <h3 className="tw-label" id="fix-index-title">Fix index</h3>
        <a href="#fix-summary" className="tw-fix-index__item">
          <span className="tw-pill" data-tone={recorded ? "good" : "live"}>{recorded ? "✓ Approved" : "● In progress"}</span>
          <span>Lord Howe clock change</span>
          <small>Hourly schedules</small>
        </a>
      </section>
      <section className="tw-card tw-attempts" aria-labelledby="attempt-title">
        <h3 className="tw-label" id="attempt-title">Patch attempts</h3>
        <ol reversed>
          <li><span className="tw-attempts__point" data-passed={recorded} /><span>Attempt 3<small>{recorded ? "Verified and approved" : "Verification running"}</small></span></li>
          <li><span className="tw-attempts__point" /><span>Attempt 2<small>Review requested changes</small></span></li>
          <li><span className="tw-attempts__point" /><span>Attempt 1<small>Review requested changes</small></span></li>
        </ol>
      </section>
    </aside>
  );
}

function RunGraph({ active, selected, onStage }: {
  readonly active: number | null;
  readonly selected: number | null;
  readonly onStage: (index: number) => void;
}) {
  return (
    <section className="tw-graph" aria-labelledby="run-path-title">
      <h2 id="run-path-title" className="tw-label">Run path</h2>
      <div className="tw-graph__scroll">
        <ol className="tw-graph__stages">
          {FLOW_STEPS.map((step, index) => {
            const stage = RUN_STAGES[index]!;
            const status = active === null || index < active ? "done" : index === active ? "running" : "queued";
            return (
              <li key={step.id} data-status={status}>
                <button type="button" aria-current={index === selected ? "location" : undefined}
                  onClick={() => onStage(index)} className="tw-node">
                  <span className="tw-node__track"><span className="tw-node__point" aria-hidden="true">
                    {status === "done" ? "✓" : status === "running" ? "●" : "○"}
                  </span></span>
                  <span className="tw-node__title tw-graph__full">{step.sign}</span>
                  <span className="tw-node__title tw-graph__compact" aria-hidden="true">{stage.short}</span>
                  <span className="tw-node__meta tw-graph__full">{status === "done" ? <><span className="tw-sr-only">Complete. </span>{stage.result}</> : status === "running" ? "In progress" : "Queued"}</span>
                  <span className="tw-node__meta tw-graph__compact" aria-hidden="true">{status === "done" ? stage.compact : status === "running" ? "Running" : "Queued"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Disclosure({ title, hint, children }: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <details className="tw-disclosure">
      <summary><span>{title}</span>{hint && <small>{hint}</small>}<span className="tw-disclosure__chevron" aria-hidden="true" /></summary>
      <div className="tw-disclosure__body">{children}</div>
    </details>
  );
}

function Fixes({ active, elapsed, onFindings }: {
  readonly active: number | null;
  readonly elapsed: number | null;
  readonly onFindings: () => void;
}) {
  const recorded = active === null;
  const patching = active === 5;
  const gatesChecked = recorded ? GATES.length : Math.min(7, Math.max(0, (elapsed ?? 0) - 9));
  return (
    <>
      <div className="tw-section-title">
        <h2>Fixes</h2>
        <span>{recorded ? "1 approved fix" : patching ? "1 fix in progress" : "Awaiting verification"}</span>
      </div>
      {active !== null && active < 5 ? (
        <section className="tw-card tw-empty">
          <h3>Fix work starts after verification</h3>
          <p>Confirmed bugs will appear here when the Crew starts a patch.</p>
        </section>
      ) : (
        <div className="tw-fixes">
          <section id="fix-summary" className="tw-card tw-patch" aria-labelledby="patch-title">
            <div className="tw-patch__hero">
              <div>
                <h3 id="patch-title">{BUG_TITLE}</h3>
                <p>On Lord Howe Island, a repeated half-hour could send the scheduler back to the same instant until it threw an error.</p>
                <button type="button" onClick={onFindings} className="tw-text-link">Read the finding <span aria-hidden="true">↗</span></button>
              </div>
              <div className="tw-patch__art" aria-hidden="true">
                <DoctorStitch key={String(recorded)} state={recorded ? "approved" : "working"} />
              </div>
            </div>
            <dl className="tw-patch__brief">
              <div><dt>{recorded ? "What changed" : "Proposed change"}</dt><dd>The scheduler keeps moving forward through the repeated half-hour.</dd></div>
              <div><dt>Why it matters</dt><dd>Hourly jobs can reach the next scheduled time when daylight saving ends.</dd></div>
            </dl>
            <section className="tw-verification" aria-labelledby="verification-title">
              <div className="tw-verification__head">
                <h4 id="verification-title">Patch verification</h4>
                <span data-tone={recorded ? "good" : "live"}>{recorded ? "8 of 8 gates passed" : `${gatesChecked} of 8 gates checked`}</span>
              </div>
              <ol className="tw-gates">
                {GATES.map(([name], index) => {
                  const done = index < gatesChecked;
                  return <li key={name} data-done={done}><span aria-hidden="true">{done ? "✓" : "·"}</span>{name}<span className="tw-sr-only">{done ? " complete" : " pending"}</span></li>;
                })}
              </ol>
            </section>
            {recorded && (
              <div className="tw-evidence">
                <Disclosure title="View fix details" hint="2 files · +12 −1">
                  <ul className="tw-file-list">
                    <li><code>src/CronDate.ts</code><span>Keep the elapsed-hour step if rounding would return the starting instant.</span></li>
                    <li><code>src/CronExpression.ts</code><span>Continue from the minute reached after the offset drops.</span></li>
                  </ul>
                </Disclosure>
                <Disclosure title="Verification evidence" hint="8 gates">
                  <dl className="tw-evidence-list">
                    {GATES.map(([name, description]) => <div key={name}><dt>{name}</dt><dd>{description}</dd></div>)}
                  </dl>
                </Disclosure>
                <Disclosure title="Retest and share" hint="2 recorded retests">
                  <dl className="tw-evidence-list">
                    <div><dt><code>master</code></dt><dd>Bug reproduced.</dd></div>
                    <div><dt><code>refs/pull/453/head</code></dt><dd>Fix verified on this ref.</dd></div>
                    <div><dt>Sharing</dt><dd>Open the recorded case for the patch, branch, and GitHub review tools. <a href={`${CASE_PATH}/fixes`}>Open Fixes</a></dd></div>
                  </dl>
                </Disclosure>
              </div>
            )}
          </section>
          <FixRail recorded={recorded} />
        </div>
      )}
    </>
  );
}

function Overview({ onFixes }: { readonly onFixes: () => void }) {
  return (
    <>
      <div className="tw-section-title"><h2>Overview</h2><span>Recorded case brief</span></div>
      <div className="tw-overview">
        <section className="tw-card tw-brief">
          <span className="tw-pill" data-tone="good">✓ Fix approved</span>
          <h3>{BUG_TITLE}</h3>
          <p>The Crew confirmed the failure at Lord Howe’s autumn clock change and verified a patch that keeps the schedule moving forward.</p>
          <button type="button" onClick={onFixes} className="tw-text-link">Review the fix <span aria-hidden="true">↗</span></button>
        </section>
        <section className="tw-card tw-brief">
          <h3>Run details</h3>
          <dl className="tw-run-facts">
            <div><dt>Active time</dt><dd>1h 18m 50s</dd></div>
            <div><dt>Clock points</dt><dd>18,779</dd></div>
            <div><dt>Experiments</dt><dd>8</dd></div>
            <div><dt>Agent calls</dt><dd>18</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}

function Plan({ stage, selected }: { readonly stage: number | null; readonly selected: number | null }) {
  return (
    <>
      <div className="tw-section-title"><h2>Plan</h2><span>8 experiments</span></div>
      <PlanOrchestration headingId="mock-plan-experiments" title="What the Crew tested"
        state={stage === null || stage >= 3 ? "complete" : "planning"}>
        <ol className="tw-plan-cards">
          <li className="case-card tw-card tw-plan-card" data-selected={selected === 1}><span className="tw-label">Discovery</span><h4>Find clock-sensitive code</h4><p>60 candidates narrowed to 8 experiments.</p></li>
          <li className="case-card tw-card tw-plan-card" data-selected={selected === 2}><span className="tw-label">Design</span><h4>Check what must hold</h4><p>The next scheduled time must be later than the current time.</p></li>
          <li className="case-card tw-card tw-plan-card" data-selected={selected === 3}><span className="tw-label">Execution</span><h4>Sweep the clock</h4><p>18,779 recorded clock points, including 30-minute offset changes.</p></li>
        </ol>
      </PlanOrchestration>
      <a className="tw-text-link" href={`${CASE_PATH}/plan`}>See all 8 experiments <span aria-hidden="true">↗</span></a>
    </>
  );
}

function Findings() {
  const [replay, setReplay] = useState(0);
  const { reduceMotion } = useReduceMotion();
  return (
    <>
      <div className="tw-section-title"><h2>Findings</h2>
        {!reduceMotion && <button type="button" className="tw-text-link" onClick={() => setReplay((value) => value + 1)}>Replay the bats</button>}
      </div>
      <div className="tw-findings">
        <article className="tw-card tw-findings__card">
          <div className="case-finding__intro">
            <div><span className="tw-pill" data-tone="warning">Reproduced bug</span><h3>{BUG_TITLE}</h3><p>An hourly job could throw when only half of an hour repeated.</p></div>
            <FindingsBat key={replay} />
          </div>
          <Disclosure title="Reproduction details"><p>On the pinned commit, Lord Howe’s clocks went from 02:00 back to 01:30. Rounding to 01:00 returned the original instant.</p></Disclosure>
        </article>
        <article className="tw-card tw-findings__card">
          <div className="case-finding__intro">
            <div><span className="tw-pill">Intended behaviour</span><h3>Schedules stop at the configured end date</h3><p>The next match beyond <code>endDate</code> is rejected by design.</p></div>
            <FindingsBat key={replay} flightDelay={0.18} />
          </div>
        </article>
      </div>
    </>
  );
}

function Activity({ active }: { readonly active: number | null }) {
  const outcomes = OUTCOMES.slice(active === null ? 0 : active === 5 ? 1 : active === 4 ? 2 : 3);
  return (
    <>
      <div className="tw-section-title"><h2>Activity</h2><span>{active === null ? "Recorded milestones" : "Simulated milestones"}</span></div>
      <section className="tw-card tw-activity">
        {active !== null && <p className="tw-activity__now"><span className="tw-dot" />{RUN_STAGES[active]!.live}</p>}
        <ol>
          {outcomes.map(({ phase, title, detail }) => (
            <li key={phase}><span className="tw-label">{phase}</span><div><h3>{title}</h3><p>{detail}</p></div></li>
          ))}
        </ol>
        <a className="tw-text-link" href={`${CASE_PATH}/activity`}>Open the full case log <span aria-hidden="true">↗</span></a>
      </section>
    </>
  );
}

function Mockup() {
  const [tab, setTab] = useState<Tab>("Fixes");
  const [selected, setSelected] = useState<number | null>(5);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const view = useRef<HTMLDivElement>(null);
  const { reduceMotion, setReduceMotion } = useReduceMotion();
  const simulated = startedAt !== null;
  const active = !simulated || elapsed >= SIMULATION_SECONDS ? null : elapsed < 5 ? 3 : elapsed < 10 ? 4 : 5;
  const runLabel = active !== null ? "Simulated live run" : simulated ? "Simulation complete" : "Run complete";
  const simulationAction = active !== null ? "End simulation" : simulated ? "Return to recorded run" : "Simulate live run";

  useEffect(() => {
    if (startedAt === null) return;
    const clock = window.setInterval(() => {
      const seconds = Math.min(SIMULATION_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
      setElapsed(seconds);
      if (seconds === SIMULATION_SECONDS) window.clearInterval(clock);
    }, 250);
    return () => window.clearInterval(clock);
  }, [startedAt]);

  function openTab(next: Tab, jump = false) {
    setTab(next);
    setSelected(next === "Activity" ? null : RUN_STAGES.findIndex((stage) => stage.tab === next));
    if (jump) requestAnimationFrame(() => {
      view.current?.scrollIntoView({ block: "start" });
      view.current?.focus({ preventScroll: true });
    });
  }

  function toggleSimulation() {
    setElapsed(0);
    setStartedAt(startedAt === null ? Date.now() : null);
  }

  return (
    <>
      <a className="tw-skip" href="#case-view">Skip to case content</a>
      <header className="tw-header">
        <div className="tw-shell tw-header__inner">
          <a href="/#/" className="tw-brand">TimeWraith<span aria-hidden="true">.</span></a>
          <span className="tw-header__label">Case layout mockup</span>
          <a className="tw-header__link" href={`${CASE_PATH}/fixes`}>Open recorded case <span aria-hidden="true">↗</span></a>
        </div>
      </header>
      <main className="tw-shell">
        <div className="tw-case-title">
          <a href="/#/cases">Cases</a><span aria-hidden="true">/</span><h1>harrisiirak/cron-parser</h1>
          <code>5c378949</code>
        </div>
        <section className="tw-run" aria-label="Run status">
          <div className="tw-run__text" role="status">
            <span className="tw-pill" data-tone={active === null ? "good" : "live"}><span className="tw-dot" />{runLabel}</span>
            <strong>{active === null ? "One fix approved" : RUN_STAGES[active]!.live}</strong>
          </div>
          <div className="tw-run__controls" data-simulated={simulated}>
            <span className="tw-run__time" role={active === null ? undefined : "timer"}>{simulated ? elapsedTime(elapsed) : "1h 18m 50s active"}</span>
            <button type="button" className="tw-button" onClick={toggleSimulation}>
              <span aria-hidden="true">{simulated ? "■" : "▸"}</span> {simulationAction}
            </button>
          </div>
        </section>
        <RunGraph active={active} selected={selected} onStage={(index) => {
          setSelected(index);
          setTab(RUN_STAGES[index]!.tab);
        }} />
        <nav className="tw-tabs" aria-label="Case sections">
          {TABS.map((name) => <button type="button" key={name} aria-current={tab === name ? "page" : undefined}
            onClick={() => openTab(name)}>{name}</button>)}
        </nav>
        <div id="case-view" tabIndex={-1} className="tw-view" ref={view}>
          {tab === "Overview" && <Overview onFixes={() => openTab("Fixes", true)} />}
          {tab === "Plan" && <Plan stage={active} selected={selected} />}
          {tab === "Findings" && <Findings />}
          {tab === "Fixes" && <Fixes active={active} elapsed={elapsed} onFindings={() => openTab("Findings", true)} />}
          {tab === "Activity" && <Activity active={active} />}
        </div>
        <footer className="tw-footer">
          <label><input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.currentTarget.checked)} /> Reduce motion</label>
        </footer>
      </main>
    </>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing mockup root");
createRoot(container).render(<ReduceMotionProvider><Mockup /></ReduceMotionProvider>);
