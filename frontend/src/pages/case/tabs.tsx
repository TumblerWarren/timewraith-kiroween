import { useState, type ReactNode } from "react";
import { useApi } from "../../api/ApiProvider";
import { ApiError } from "../../api/client";
import type { Bug, DecisionRecord, FixAttempt, IntendedFinding, Investigation, Phase, ReplayEventMsg } from "../../api/types";
import { caseHref, type PlanView } from "../../app/router";
import { DiffView } from "../../cases/fix/DiffView";
import { parseUnifiedDiff } from "../../cases/fix/parseDiff";
import { CASE_PAGE } from "../../content/app";
import {
  FIX_CHANGE_CAPTION,
  GATE_LABELS,
  INV_ACCEPT_FIX,
  INV_APPROVAL_NOTE,
  INV_ATTEMPT,
  INV_CANDIDATES_TITLE,
  INV_CAPABILITIES_TITLE,
  INV_DECISION_WORDS,
  INV_DECISIONS_TITLE,
  INV_DROPPED,
  INV_EXPERIMENTS_TITLE,
  INV_ISSUE_TERM,
  INV_KEPT,
  INV_NO_BUGS,
  INV_POINTS,
  INV_REJECT_FIX,
  INV_ROOT_CAUSE,
  INV_RULE_TERM,
  INV_SWEEP_LINE,
  INV_SWEEPS_TITLE,
  INV_TEST_TERM,
  INV_WHERE_TERM,
  INVARIANT_LABELS,
} from "../../content/caseView";
import { CREW_BY_ID } from "../../content/crew";
import { FLOW_STEPS } from "../../content/flow";
import { CaseDisclosure } from "./CaseDisclosure";
import { CrewSigil } from "./CrewSigil";
import { DoctorStitch, type DoctorStitchState } from "../../animation/react/DoctorStitch";
import { FindingsBat } from "../../animation/react/FindingsBat";
import { PumpkinGhost } from "../../animation/react/PumpkinGhost";
import { PlanOrchestration } from "../../animation/react/PlanOrchestration";
import { CASE_ADDITIONS, CASE_LIVE } from "../../content/copy";
import { ATTENTION_PREFIX, isKiroAccountNote } from "../../app/status";
import { PlanCoverage, PlannerRounds } from "./PlanEvidence";
import { BugReproduction } from "./BugReproduction";
import { BugRetest } from "./BugRetest";
import { WrapUpNotes } from "./WrapUpNotes";
import { FixBranchPanel } from "./FixBranchPanel";
import { activityItems, observedAnomalies, visibleAttempts } from "./liveCase";

const GATE_ORDER = ["test_first", "diff_limits", "fixed", "mutation_check", "no_regressions", "no_new_anomalies", "static_checks", "independent_review"] as const;
const GATE_SHORT = ["Reproduce", "Patch size", "Fix verified", "Test sensitivity", "Regressions", "Fresh sweep", "Static checks", "Independent review"] as const;

const agentName = (id: string) => CREW_BY_ID[id as keyof typeof CREW_BY_ID]?.name ?? id;
const label = (map: Readonly<Record<string, string>>, id: string) => map[id] ?? id.replace(/_/g, " ");
const candTitle = (inv: Investigation, id: string) => inv.feature_map?.candidates.find((x) => x.id === id)?.title ?? id;

const sentences = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "sentence" }) : null;

// Crew notes sometimes use lowercase identifiers at the start of a sentence.
function shortNote(value: string | null | undefined, max = 230): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const first = sentences?.segment(text).containing(0)?.segment.trim() ?? text;
  if (first.length <= max) return first;
  const line = first.split(/(?<=[.!?])\s+/, 1)[0] ?? first;
  if (line.length <= max) return line;
  return `${line.slice(0, max).replace(/\s+\S*$/, "").trimEnd()}…`;
}

function fixStatus(bug: Bug): string {
  if (bug.fix.state !== "verified") return bug.fix.label;
  switch (bug.fix.user_decision) {
    case "accepted": return "Approved";
    case "rejected": return "Rejected";
    default: return "Verified · awaiting review";
  }
}

function Panel({ title, children, id, controls }: {
  readonly title: string;
  readonly children: ReactNode;
  readonly id: string;
  readonly controls?: ReactNode;
}) {
  return (
    <section className="case-section" aria-labelledby={id}>
      {controls ? (
        <div className="case-section__header">
          <h3 id={id} className="panel__title">{title}</h3>
          {controls}
        </div>
      ) : <h3 id={id} className="panel__title">{title}</h3>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- overview

function SavedSummary({ text, label }: { readonly text: string; readonly label: string }) {
  const preview = shortNote(text);
  const complete = text.replace(/\s+/g, " ").trim();
  return <>
    {preview && <p>{preview}</p>}
    {preview !== complete && <CaseDisclosure label={label}><p className="case-saved-text">{text.trim()}</p></CaseDisclosure>}
  </>;
}

export function OverviewTab({ inv, runDetails }: { readonly inv: Investigation; readonly runDetails: ReactNode }) {
  const intended = inv.intended?.length ?? 0;
  const assessment = inv.feature_map?.note.trim();
  const notes = [...new Set(inv.notes.map((note) => note.trim()).filter((note) =>
    note && !note.startsWith(CASE_ADDITIONS.wrapUp.prefix) && !note.startsWith(ATTENTION_PREFIX) && !isKiroAccountNote(note)))];
  const latestNote = notes.at(-1);
  return (
    <div className="tab-stack">
    <WrapUpNotes notes={inv.notes} />
    <div className="case-overview">
    <section className="case-card case-overview__brief" aria-labelledby="ov-results">
      <h3 id="ov-results" className="panel__title">Case brief</h3>
      {inv.bugs.length === 0 && intended === 0 && (
        <p>{inv.stage === "completed" ? INV_NO_BUGS : CASE_PAGE.noBugsYet}</p>
      )}
      {inv.bugs.length > 0 && <ul role="list" className="case-overview__findings">
        {inv.bugs.slice(0, 3).map((bug) => {
          const summary = bug.fix.attempts.at(-1)?.summary.trim();
          return (
          <li key={bug.id} className="case-overview__finding">
            <div className="case-card__heading">
              <h4>{bug.title}</h4>
              <div className="case-card__meta">
                <span className="tag tag--bad">Reproduced bug</span>
                <span className="case-note">{fixStatus(bug)}</span>
              </div>
            </div>
            {summary && <div className="case-saved-summary">
              <h5>{bug.fix.state === "verified" ? "Fix summary" : "Latest fix attempt"}</h5>
              <SavedSummary text={summary} label="Read full fix summary" />
            </div>}
            <a className="case-overview__action" href={caseHref(inv.id, "fixes")}>Review the fixes <span aria-hidden="true">↗</span></a>
          </li>
          );
        })}
      </ul>}
      {inv.bugs.length + intended > 0 && <footer className="case-overview__footer">
        {intended > 0 && <p className="case-note">{intended} {intended === 1 ? "finding matches" : "findings match"} behavior documented by the repository.</p>}
        <a className="case-overview__action" href={caseHref(inv.id, "findings")}>View all findings</a>
      </footer>}
    </section>
    <section className="case-card case-run-details" aria-labelledby="case-run-details-title">
      <h3 id="case-run-details-title" className="panel__title">Run details</h3>
      {runDetails}
    </section>
    </div>
    {(assessment || latestNote) && <CaseDisclosure label="Saved notes">
      <div className="case-card-grid">
        {assessment && <div className="case-card">
          <h4>Repository assessment</h4>
          <SavedSummary text={assessment} label="Read full repository assessment" />
        </div>}
        {latestNote && <div className="case-card">
          <h4>Latest run note</h4>
          <SavedSummary text={latestNote} label="Read full run note" />
          {notes.length > 1 && <CaseDisclosure label={`Earlier run notes (${notes.length - 1})`}>
            <ul role="list" className="case-saved-summary">{notes.slice(0, -1).map((note) => <li key={note} className="case-saved-text">{note}</li>)}</ul>
          </CaseDisclosure>}
        </div>}
      </div>
    </CaseDisclosure>}
    </div>
  );
}

// ---------------------------------------------------------------- plan

export function PlanTab({ inv, view, onApprove, busy }: {
  readonly inv: Investigation;
  readonly view?: PlanView;
  readonly onApprove: () => void;
  readonly busy: boolean;
}) {
  const candidates = inv.feature_map?.candidates ?? [];
  const experiments = inv.test_plan?.experiments ?? [];
  const waiting = inv.stage === "awaiting-plan-approval";
  const ghost = <PumpkinGhost state={waiting ? "review" : inv.stage === "completed" ? "complete" : "planning"} />;
  const hasPlanEvidence = (inv.coverage?.length ?? 0) > 0 || (inv.intents?.length ?? 0) > 0 || inv.decisions.some((decision) => decision.step === "plan_round");
  const sweeps = inv.sweeps;
  if (!view && !waiting && !inv.capabilities && candidates.length === 0 && experiments.length === 0 && !hasPlanEvidence) return <div className="case-card plan-empty"><p>{CASE_PAGE.planNotReady}</p>{ghost}</div>;
  return (
    <div className="tab-stack">
      <nav className="case-plan-paths" aria-label="Plan stages">
        <a href={caseHref(inv.id, "plan", "discovery")} aria-current={view === "discovery" ? "location" : undefined}>
          <strong>Discovery</strong><span>{candidates.length} candidates · {candidates.filter((candidate) => candidate.selected).length} kept</span>
        </a>
        <a href={caseHref(inv.id, "plan")} aria-current={!view ? "location" : undefined}>
          <strong>Design</strong><span>{experiments.length} {experiments.length === 1 ? "experiment" : "experiments"}</span>
        </a>
        <a href={caseHref(inv.id, "plan", "execution")} aria-current={view === "execution" ? "location" : undefined}>
          <strong>Execution</strong><span>{sweeps.reduce((total, sweep) => total + sweep.points_run, 0).toLocaleString()} clock points</span>
        </a>
      </nav>
      {!view && experiments.length === 0 && <div className="case-section__intro"><h3 className="panel__title">Experiment plan</h3>{ghost}</div>}
      {waiting ? (
        <section className="case-card case-card--action" aria-labelledby="plan-approve">
          <h3 id="plan-approve" className="panel__title">
            {CASE_PAGE.approve}
          </h3>
          <p>{INV_APPROVAL_NOTE}</p>
          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={onApprove}>
              {CASE_PAGE.approve}
            </button>
          </div>
        </section>
      ) : null}

      {!view && experiments.length > 0 ? (
        <section className="case-section" aria-labelledby="plan-exps">
        <PlanOrchestration headingId="plan-exps" title={`${INV_EXPERIMENTS_TITLE} (${experiments.length})`}
          state={waiting ? "review" : inv.stage === "completed" ? "complete" : "planning"}>
          <ol role="list" className="case-card-grid case-experiments">
            {experiments.map((e) => (
              <li key={e.id} className="case-card" data-status={e.status}>
                <div className="case-card__head">
                  <h4>{candTitle(inv, e.candidate_id)}</h4>
                  <span className="tag">{{ planned: "Planned", designed: "Ready", not_designed: "Skipped", adapter_invalid: "Invalid adapter", not_run: "No tests executed", swept: "Tested" }[e.status] ?? e.status}</span>
                </div>
                {e.invariants[0] && <p>{label(INVARIANT_LABELS, e.invariants[0].id)}</p>}
                {e.point_count > 0 && <p className="case-note">{INV_POINTS(e.point_count, e.zones.length)}</p>}
                {(e.claim || e.zones.length > 0 || e.invariants.length > 0 || e.executability_reason) && (
                  <CaseDisclosure label="View experiment details">
                    {e.claim && <p>{e.claim}</p>}
                    {e.invariants.length > 0 && <ul role="list" className="row__sub">
                      {e.invariants.map((iu) => <li key={iu.id}><strong>{label(INVARIANT_LABELS, iu.id)}</strong><p>{iu.reason}</p></li>)}
                    </ul>}
                    {e.zones.length > 0 && <p>{e.zones.join(", ")}</p>}
                    {e.executability_reason && <p>{e.executability_reason}</p>}
                  </CaseDisclosure>
                )}
              </li>
            ))}
          </ol>
        </PlanOrchestration>
        </section>
      ) : null}

      {view === "execution" && (
        <Panel id="plan-execution" title={INV_SWEEPS_TITLE}>
          {sweeps.length ? <SweepList inv={inv} /> : <p className="case-card">Clock sweeps appear here as the Crew runs the experiments.</p>}
        </Panel>
      )}
      {!view && <PlanCoverage inv={inv} />}
      {!view && <PlannerRounds inv={inv} />}

      {view === "discovery" && candidates.length === 0 && <p className="case-card">Candidates appear here as the Crew reviews time-sensitive code.</p>}
      {view !== "execution" && candidates.length > 0 ? (
        <CaseDisclosure key={view ?? "design"} label={`${INV_CANDIDATES_TITLE} (${candidates.length})`} initiallyOpen={view === "discovery"}>
          {inv.feature_map?.note ? <p className="muted-note">{inv.feature_map.note}</p> : null}
          <ol role="list" className="rows">
            {candidates.map((x, i) => (
              <li key={`${x.id}-${i}`} className="row" data-selected={x.selected ? "true" : "false"}>
                <p className="row__head">
                  <strong>{x.title}</strong> {x.selected ? <span className="tag tag--good">{INV_KEPT}</span> : null}
                </p>
                <p className="row__meta mono">
                  {x.unit.path}:{x.unit.start_line} · {x.bug_categories.join(", ").replace(/_/g, " ")} · score {x.score}
                </p>
                {x.rationale ? <p>{x.rationale}</p> : null}
              </li>
            ))}
          </ol>
        </CaseDisclosure>
      ) : null}

      {view === "discovery" && <PlanCoverage inv={inv} />}
      {view !== "execution" && inv.capabilities ? (
        <CaseDisclosure label={INV_CAPABILITIES_TITLE}>
          <ul role="list" className="checks">
            {inv.capabilities.items.map((it) => (
              <li key={it.id} data-state={it.status === "supported" ? "pass" : it.status === "unsupported" ? "fail" : "unknown"}>
                <span className="checks__mark" aria-hidden="true">
                  {it.status === "supported" ? "✓" : it.status === "unsupported" ? "✕" : "?"}
                </span>
                <span>
                  <span className="mono">{it.id}</span> {it.status}: {it.reason}
                </span>
              </li>
            ))}
          </ul>
        </CaseDisclosure>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- findings

function BugFinding({ bug, invId, replay, flightDelay = 0 }: { readonly bug: Bug; readonly invId: string; readonly replay: number; readonly flightDelay?: number }) {
  return (
    <li className="case-card case-finding-card">
      <div className="case-finding__intro">
        <div className="case-card__heading">
          <div className="case-card__meta"><span className="tag tag--bad">Reproduced</span></div>
          <h4>{bug.title}</h4>
          <p>{label(INVARIANT_LABELS, bug.invariant)}</p>
          {bug.violation.zone && <p className="case-note">{bug.violation.zone.replaceAll("_", " ")} · {bug.violation.local}</p>}
        </div>
        <FindingsBat key={replay} flightDelay={flightDelay} />
      </div>
      <a href={caseHref(invId, "fixes")}>Review the fixes <span aria-hidden="true">↗</span></a>
      <BugReproduction bug={bug} />
      <CaseDisclosure label="View reproduction and evidence">
      <dl className="facts">
        <div>
          <dt>{INV_RULE_TERM}</dt>
          <dd>{label(INVARIANT_LABELS, bug.invariant)}</dd>
        </div>
        <div>
          <dt>{INV_WHERE_TERM}</dt>
          <dd>
            <span className="mono">{bug.violation.local}</span> ({bug.violation.zone}): {bug.violation.detail}
          </dd>
        </div>
        <div>
          <dt>{INV_ISSUE_TERM}</dt>
          <dd>
            {bug.issue_match ? (
              <a href={bug.issue_match.url} rel="noreferrer noopener">
                {bug.issue_match_label}
              </a>
            ) : (
              bug.issue_match_label
            )}
          </dd>
        </div>
      </dl>
      {bug.evidence.length > 0 && <ul role="list" className="row__sub">
        {bug.evidence.map((e, i) => <li key={i}><span className="mono">{e.ref}</span> {e.why}</li>)}
      </ul>}
      {bug.regression_test && <CaseDisclosure label={INV_TEST_TERM}>
        <p className="case-note mono">{bug.regression_test_path}</p>
        <pre className="code mono">{bug.contribution_test ?? bug.regression_test}</pre>
      </CaseDisclosure>}
      </CaseDisclosure>
    </li>
  );
}

function IntendedItem({ f, replay, flightDelay = 0 }: { readonly f: IntendedFinding; readonly replay: number; readonly flightDelay?: number }) {
  return (
    <li className="case-card case-finding-card" data-intended={f.id}>
      <div className="case-finding__intro">
        <div className="case-card__heading">
          <div className="case-card__meta"><span className="tag">Intended behaviour</span></div>
          <h4>{f.title}</h4>
          <p>Matches behavior documented by the repository.</p>
        </div>
        <FindingsBat key={replay} flightDelay={flightDelay} />
      </div>
      <CaseDisclosure label="View explanation and evidence">
      <p>{f.explanation}</p>
      <dl className="facts">
        <div>
          <dt>{INV_RULE_TERM}</dt>
          <dd>{label(INVARIANT_LABELS, f.invariant)}</dd>
        </div>
        <div>
          <dt>{INV_WHERE_TERM}</dt>
          <dd>
            <span className="mono">{f.violation.local}</span> ({f.violation.zone}): {f.violation.detail}
          </dd>
        </div>
        <div>
          <dt>Documented by</dt>
          <dd>
            <ul role="list" className="row__sub">
              {f.evidence
                .filter((e) => e.kind === "test" || e.kind === "doc")
                .map((e) => (
                  <li key={e.ref}>
                    <span className="mono">{e.ref}</span> {e.kind === "test" && f.confirmed_tests.some((t) => e.ref.startsWith(`${t}:`)) ? "(test passes on this revision)" : ""} {e.why}
                  </li>
                ))}
            </ul>
          </dd>
        </div>
      </dl>
      </CaseDisclosure>
    </li>
  );
}

function SweepList({ inv }: { readonly inv: Investigation }) {
  const experiments = inv.test_plan?.experiments ?? [];
  return (
    <ul role="list" className="rows case-sweep-list">
      {inv.sweeps.map((sweep) => (
        <li key={sweep.experiment_id} className="row">
          <strong>{candTitle(inv, experiments.find((experiment) => experiment.id === sweep.experiment_id)?.candidate_id ?? sweep.experiment_id)}</strong>
          {sweep.pytest_results?.length ? <ul className="row__sub">
            {sweep.pytest_results.map((run, index) => <li key={run.zone + run.instant + index}>
              <strong>{run.outcome}</strong> · {run.instant} · {run.zone}
              <p>{run.passed} passed · {run.failed} failed · {run.skipped} skipped{run.runtime && ` · ${run.runtime}`}</p>
              {run.detail && <pre className="code mono">{run.detail}</pre>}
            </li>)}
          </ul> : <p className="row__meta">{INV_SWEEP_LINE(sweep.points_run, sweep.zones.length, sweep.violations.length)}</p>}
        </li>
      ))}
    </ul>
  );
}

export function FindingsTab({ inv, events = [] }: { readonly inv: Investigation; readonly events?: readonly ReplayEventMsg[] }) {
  const [replay, setReplay] = useState(0);
  const intended = inv.intended ?? [];
  if (inv.sweeps.length === 0 && inv.bugs.length === 0 && intended.length === 0) return (
    <div className="case-card"><div className="case-finding__intro"><p>{CASE_PAGE.findingsNone}</p><FindingsBat /></div></div>
  );
  const experiments = inv.test_plan?.experiments ?? [];
  const anomalies = observedAnomalies(inv, events);
  return (
    <div className="tab-stack">
      {anomalies.length > 0 && (
        <Panel id="find-anomalies" title={CASE_LIVE.checkingTitle}>
          <ul role="list" className="case-card-grid">
            {anomalies.map(({ id, experimentId, violation, state, reason }) => {
              const candidate = experiments.find((experiment) => experiment.id === experimentId)?.candidate_id;
              return (
                <li key={id} className="case-card">
                  <div className="case-card__head">
                    <h4>{candidate ? candTitle(inv, candidate) : label(INVARIANT_LABELS, violation.invariant)}</h4>
                    <span className={`tag${state === "checking" ? " tag--warn" : state === "reproduced" ? " tag--bad" : ""}`}>{CASE_LIVE[state]}</span>
                  </div>
                  <p className="case-note">{CASE_LIVE.checkedAt(violation.local, violation.zone)}</p>
                  {reason && <p>{reason}</p>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <Panel id="find-bugs" title={`Reproduced bugs (${inv.bugs.length})`} controls={
        <button type="button" className="plan-stage__control case-findings__replay" onClick={() => setReplay((value) => value + 1)}>Replay the bats</button>
      }>
        {inv.bugs.length === 0 ? (
          <div className="case-card"><div className="case-finding__intro">
            <p>{inv.stage === "completed" ? INV_NO_BUGS : CASE_PAGE.noBugsYet}</p>
            {intended.length === 0 && <FindingsBat key={replay} />}
          </div></div>
        ) : (
          <ol role="list" className="case-card-grid">
            {inv.bugs.map((b, index) => (
              <BugFinding key={b.id} bug={b} invId={inv.id} replay={replay} flightDelay={(index % 4) * .18} />
            ))}
          </ol>
        )}
      </Panel>
      {intended.length > 0 && (
        <Panel id="find-intended" title={`Intended behaviour, not bugs (${intended.length})`}>
          <ol role="list" className="case-card-grid">
            {intended.map((finding, index) => (
              <IntendedItem key={finding.id} f={finding} replay={replay} flightDelay={((inv.bugs.length + index) % 4) * .18} />
            ))}
          </ol>
        </Panel>
      )}
      {inv.sweeps.length > 0 ? (
        <CaseDisclosure label={`${INV_SWEEPS_TITLE} (${inv.sweeps.length})`}>
          <SweepList inv={inv} />
        </CaseDisclosure>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- fixes

/** All eight gates in order: passed, failed, or not run (the gates stop at the first failure). */
export function GateList({ attempt }: { readonly attempt: FixAttempt }) {
  const by = new Map(attempt.gates.map((g) => [g.gate, g]));
  return (
    <ol role="list" className="checks checks--gates">
      {GATE_ORDER.map((id) => {
        const g = by.get(id);
        const st = g ? (g.passed ? "pass" : "fail") : "skip";
        return (
          <li key={id} data-state={st}>
            <span className="checks__mark" aria-hidden="true">
              {st === "pass" ? "✓" : st === "fail" ? "✕" : "–"}
            </span>
            <span className="visually-hidden">{st === "pass" ? "Passed: " : st === "fail" ? "Failed: " : "Not run: "}</span>
            <span>
              <strong>{label(GATE_LABELS, id)}</strong> {g ? g.detail : CASE_PAGE.gateNotRun}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AttemptDetails({ attempt }: { readonly attempt: FixAttempt }) {
  const files = parseUnifiedDiff(attempt.diff);
  return (
    <>
      {files.length > 0 && <CaseDisclosure label={`View code changes (${files.length} ${files.length === 1 ? "file" : "files"})`}>
        {files.map((file) => <DiffView key={file.file} caption={FIX_CHANGE_CAPTION} file={file.file} lines={file.lines} />)}
      </CaseDisclosure>}
      <CaseDisclosure label="View verification">
        <GateList attempt={attempt} />
      </CaseDisclosure>
      {(attempt.summary || attempt.root_cause) && <CaseDisclosure label="Read Crew notes">
        {attempt.summary && <p>{attempt.summary}</p>}
        {attempt.root_cause && <p><strong>{INV_ROOT_CAUSE}.</strong> {attempt.root_cause}</p>}
      </CaseDisclosure>}
    </>
  );
}

function GateStrip({ attempt }: { readonly attempt: FixAttempt }) {
  const outcomes = new Map(attempt.gates.map((gate) => [gate.gate, gate.passed]));
  const passed = GATE_ORDER.filter((name) => outcomes.get(name) === true).length;
  return (
    <section className="case-fix__gates" aria-label="Patch verification">
      <div className="case-section__header">
        <h4>Patch verification</h4>
        <p className="case-fix__gate-total mono" data-passed={passed === GATE_ORDER.length}>{passed} of {GATE_ORDER.length} gates passed</p>
      </div>
      <ol className="case-gate-strip" role="list">
        {GATE_ORDER.map((name, index) => {
          const passed = outcomes.get(name);
          return (
            <li key={name} data-state={passed === true ? "pass" : passed === false ? "fail" : "skip"}>
              <span className="case-gate-strip__mark" aria-hidden="true">{passed === true ? "✓" : passed === false ? "×" : "–"}</span>
              <span className="visually-hidden">{passed === true ? "Passed. " : passed === false ? "Failed. " : "Not checked. "}</span>
              <span>{GATE_SHORT[index]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BugFix({ bug, invId, onChanged, attempts, notes }: {
  readonly bug: Bug;
  readonly invId: string;
  readonly onChanged: () => Promise<void>;
  readonly attempts: readonly FixAttempt[];
  readonly notes: readonly string[];
}) {
  const { api } = useApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latest = attempts.at(-1);
  const verified = bug.fix.state === "verified";
  let portraitState: DoctorStitchState = "rest";
  if (bug.fix.state === "in-progress") portraitState = "working";
  else if (verified && bug.fix.user_decision === "pending") portraitState = "verified";
  else if (verified && bug.fix.user_decision === "accepted") portraitState = "approved";
  const accepted = verified ? bug.fix.attempts.findLast((attempt) => attempt.accepted_by_gates) : undefined;
  const featured = accepted ?? latest;
  const earlier = [...attempts].reverse().filter((attempt) => attempt !== featured);
  const files = featured ? parseUnifiedDiff(featured.diff) : [];
  const change = shortNote(featured?.summary, 260) ?? (files.length > 0
    ? `The patch changes ${files.length} ${files.length === 1 ? "file" : "files"}.`
    : null);
  const reason = shortNote(featured?.root_cause, 180) ?? shortNote(bug.violation.detail, 180);
  const [title, impact] = bug.title.split(/;\s+/, 2);
  const scenario = bug.violation.zone.replaceAll("_", " ");
  const decide = async (accept: boolean) => {
    if (!api) return;
    setBusy(true);
    try {
      await api.decideFix(invId, bug.id, accept);
      await onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="case-card case-fix" data-fix-state={bug.fix.state} aria-labelledby="case-fix-title">
      <div className="case-fix__hero">
        <div className="case-fix__intro">
          <h3 id="case-fix-title" tabIndex={-1}>{title}</h3>
          {(impact || scenario) && <p>{impact ? impact.charAt(0).toUpperCase() + impact.slice(1) : scenario}</p>}
          <a href={caseHref(invId, "findings")}>Read the finding <span aria-hidden="true">↗</span></a>
        </div>
        <div className="case-fix__portrait" aria-hidden="true">
          <DoctorStitch key={portraitState} state={portraitState} />
        </div>
      </div>
      {(change || reason) && <dl className="case-fix__brief">
        {change && <div><dt>{verified ? "What changed" : "What the Crew tried"}</dt><dd>{change}</dd></div>}
        {reason && <div><dt>Why it mattered</dt><dd>{reason}</dd></div>}
      </dl>}
      {verified && bug.fix.user_decision === "pending" && (
        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={busy || !api} onClick={() => void decide(true)}>
            {INV_ACCEPT_FIX}
          </button>
          <button type="button" className="btn" disabled={busy || !api} onClick={() => void decide(false)}>
            {INV_REJECT_FIX}
          </button>
        </div>
      )}
      {featured && <GateStrip attempt={featured} />}
      <div className="case-fix__details">
        {featured && (files.length > 0 || featured.summary || featured.root_cause) && (
          <CaseDisclosure label={files.length ? `View fix details · ${files.length} ${files.length === 1 ? "file" : "files"}` : "View fix details"}>
            {files.map((file) => <DiffView key={file.file} caption={FIX_CHANGE_CAPTION} file={file.file} lines={file.lines} />)}
            {featured.summary && <p>{featured.summary}</p>}
            {featured.root_cause && <p><strong>{INV_ROOT_CAUSE}.</strong> {featured.root_cause}</p>}
          </CaseDisclosure>
        )}
        {featured && <CaseDisclosure label="View verification"><GateList attempt={featured} /></CaseDisclosure>}
        {earlier.length > 0 && (
          <CaseDisclosure label={`Earlier attempts (${earlier.length})`}>
            {earlier.map((attempt) => <CaseDisclosure key={attempt.attempt} label={INV_ATTEMPT(attempt.attempt)}>
              <AttemptDetails attempt={attempt} />
            </CaseDisclosure>)}
          </CaseDisclosure>
        )}
        <CaseDisclosure label={verified && bug.fix.user_decision === "accepted" ? "Retest and share" : "Retest"}>
          {verified && bug.fix.user_decision === "accepted" && (
            <FixBranchPanel bug={bug} invId={invId} notes={notes} onChanged={onChanged} />
          )}
          <BugRetest bug={bug} invId={invId} onChanged={onChanged} />
        </CaseDisclosure>
      </div>
      {err ? (
        <p className="alert" role="alert">
          {err}
        </p>
      ) : null}
    </article>
  );
}

export function FixesTab({ inv, events = [], onChanged }: {
  readonly inv: Investigation;
  readonly events?: readonly ReplayEventMsg[];
  readonly onChanged: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(() =>
    inv.bugs.find((bug) => bug.fix.state === "in-progress")?.id ?? inv.bugs[0]?.id);
  const selected = inv.bugs.find((bug) => bug.id === selectedId) ?? inv.bugs[0];
  if (!selected) return <p className="case-card">{CASE_PAGE.fixesNone}</p>;
  const attempts = visibleAttempts(selected, events);
  const selectFix = (id: string) => {
    setSelectedId(id);
    if (id === selected.id) return;
    requestAnimationFrame(() => document.getElementById("case-fix-title")?.focus());
  };
  return (
    <section className="case-fixes" aria-label="Suggested fixes">
      <BugFix key={selected.id} bug={selected} invId={inv.id} onChanged={onChanged} attempts={attempts} notes={inv.notes} />
      <aside className="case-fix-rail" aria-label="Fix index and patch history">
        <section className="case-card case-fix-index" aria-labelledby="case-fix-index">
          <h3 id="case-fix-index" className="case-label">Fix index</h3>
          <ul role="list">
            {inv.bugs.map((bug) => (
              <li key={bug.id}>
                <button type="button" aria-pressed={selected.id === bug.id} aria-label={bug.title} onClick={() => selectFix(bug.id)}>
                  <span className={`tag${bug.fix.user_decision === "accepted" ? " tag--good" : ""}`}>{fixStatus(bug)}</span>
                  <span>{bug.title.split(/;\s+/, 1)[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        {attempts.length > 0 && (
          <section className="case-card case-fix-history" aria-labelledby="case-fix-history">
            <h3 id="case-fix-history" className="case-label">Patch attempts</h3>
            <ol role="list" reversed>
              {[...attempts].reverse().map((attempt) => {
                const failed = attempt.gates.find((gate) => !gate.passed);
                const outcome = attempt.accepted_by_gates
                  ? selected.fix.user_decision === "accepted" ? "Verified and approved" : "Verified"
                  : failed ? `Stopped at ${label(GATE_LABELS, failed.gate).toLowerCase()}`
                    : selected.fix.state === "in-progress" && attempt === attempts.at(-1) ? "In progress" : "Attempt recorded";
                return <li key={attempt.attempt} data-verified={attempt.accepted_by_gates}>
                  <span>{INV_ATTEMPT(attempt.attempt)}</span><small>{outcome}</small>
                </li>;
              })}
            </ol>
          </section>
        )}
      </aside>
    </section>
  );
}

// ---------------------------------------------------------------- activity

export function EventList({ events, inv }: { readonly events: readonly ReplayEventMsg[]; readonly inv?: Investigation }) {
  if (events.length === 0) return <p className="muted-note">{CASE_PAGE.noEvents}</p>;
  return (
    <div className="case-event-phases">
      {FLOW_STEPS.map((phase) => {
        const phaseEvents = events.filter((event) => event.phase === phase.id);
        if (!phaseEvents.length) return null;
        return (
          <section key={phase.id} className="case-event-phase" aria-label={phase.sign}>
            <h4>{phase.sign}</h4>
            <ol role="list" className="events">
              {activityItems(phaseEvents, inv).map((item) => {
                if ("first" in item) {
                  const label = [agentName(item.first.actor), item.subject, CASE_LIVE.tools(item.tools.length)].filter(Boolean).join(" · ");
                  return (
                    <li key={item.first.seq} className="case-event-session">
                      <CaseDisclosure label={label}>
                        <ol role="list" className="rows">
                          {item.tools.map((event) => <li key={event.seq} className="row">{event.text}</li>)}
                        </ol>
                      </CaseDisclosure>
                    </li>
                  );
                }
                return (
                  <li key={item.seq} data-kind={item.kind}>
                    <span className="events__who"><CrewSigil id={item.actor} />{agentName(item.actor)}</span>
                    <span className="events__text">{item.text}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function DecisionItem({ d }: { readonly d: DecisionRecord }) {
  return (
    <li className="row" data-decision={d.decision}>
      <p className="row__head">
        <strong>{agentName(d.agent)}</strong> <span>{label(CASE_ADDITIONS.decisionSteps, d.step)}</span>{" "}
        <span className={d.decision === "accepted" ? "tag tag--good" : d.decision === "rejected" ? "tag tag--bad" : "tag"}>{INV_DECISION_WORDS[d.decision]}</span>
      </p>
      {d.claim ? <p>{d.claim}</p> : null}
      <p className="row__meta">{d.rule}</p>
      {d.evidence.length > 0 ? (
        <ul role="list" className="row__sub">
          {d.evidence.map((e, i) => (
            <li key={i}>
              <span className="mono">{e.ref}</span> {e.why}
            </li>
          ))}
        </ul>
      ) : null}
      {d.dropped_evidence > 0 ? <p className="row__meta">{INV_DROPPED(d.dropped_evidence)}</p> : null}
    </li>
  );
}

function milestoneText(event: ReplayEventMsg): string | null {
  if (event.kind === "dispatch") return shortNote(event.text, 180);
  if (event.kind === "approval") {
    if (event.data?.approval === "plan") return event.data.pending ? "Plan ready for approval" : "Plan approved";
    if (event.data?.approval === "fix" && typeof event.data.accepted === "boolean") {
      return event.data.accepted ? "Fix approved" : "Fix rejected";
    }
  }
  if (event.kind === "fix" && event.text.startsWith("Suggested fix · verified")) return "Suggested fix verified";
  if (event.kind === "stage") return shortNote(event.text, 140);
  return null;
}

export function ActivityTab({ inv, events }: { readonly inv: Investigation; readonly events: readonly ReplayEventMsg[] }) {
  const [phase, setPhase] = useState<Phase | "all">("all");
  const shown = events.filter((e) => (phase === "all" || e.phase === phase) && !(e.kind === "note" && isKiroAccountNote(e.text)));
  const notes = inv.notes.filter((note) => !isKiroAccountNote(note));
  const decisions = phase === "all" ? inv.decisions : inv.decisions.filter((d) => d.phase === phase);
  const milestones = [...shown].reverse().flatMap((event) => {
    const text = milestoneText(event);
    return text ? [{ event, text }] : [];
  }).slice(0, 6);
  return (
    <div className="tab-stack">
      <Panel id="act-milestones" title="Crew milestones" controls={
        <div className="field field--inline">
          <label htmlFor="activity-phase">{CASE_PAGE.phaseFilter}</label>
          <select id="activity-phase" value={phase} onChange={(e) => setPhase(e.currentTarget.value as Phase | "all")}>
            <option value="all">{CASE_PAGE.allPhases}</option>
            {FLOW_STEPS.map((s) => <option key={s.id} value={s.id}>{s.sign}</option>)}
          </select>
        </div>
      }>
        {milestones.length > 0 ? (
          <ol role="list" className="case-card-list case-milestones">
            {milestones.map(({ event, text }) => <li key={event.seq}>
              <div className="case-milestones__phase">
                <CrewSigil id={event.actor} />
                <span className="case-label">{FLOW_STEPS.find((step) => step.id === event.phase)?.sign ?? event.phase}</span>
              </div>
              <div><p>{text}</p><p className="case-note">{agentName(event.actor)}</p></div>
            </li>)}
          </ol>
        ) : <p className="case-card">{shown.length > 0 ? "Open the event log to see this phase’s activity." : CASE_PAGE.noEvents}</p>}
      </Panel>
      <CaseDisclosure label={`Event log (${shown.length})`}>
        <EventList events={shown} inv={inv} />
      </CaseDisclosure>
      <CaseDisclosure label={`${INV_DECISIONS_TITLE} (${decisions.length})`}>
        {decisions.length === 0 ? (
          <p className="muted-note">No decisions yet.</p>
        ) : (
          <ol role="list" className="rows">
            {decisions.map((d) => (
              <DecisionItem key={d.id} d={d} />
            ))}
          </ol>
        )}
      </CaseDisclosure>
      {notes.length > 0 ? (
        <CaseDisclosure label={`Notes from the Crew (${notes.length})`}>
          <ul role="list" className="rows">
            {notes.map((n, i) => (
              <li key={i} className="row">
                {n}
              </li>
            ))}
          </ul>
        </CaseDisclosure>
      ) : null}
    </div>
  );
}
