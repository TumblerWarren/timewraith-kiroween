import { useState, type ReactNode } from "react";
import { useApi } from "../../api/ApiProvider";
import { ApiError } from "../../api/client";
import type { Bug, DecisionRecord, FixAttempt, IntendedFinding, Investigation, Phase, ReplayEventMsg } from "../../api/types";
import { caseHref } from "../../app/router";
import { pendingFixes } from "../../app/status";
import { DiffView } from "../../cases/fix/DiffView";
import { parseUnifiedDiff } from "../../cases/fix/parseDiff";
import { CASE_PAGE, FIG } from "../../content/app";
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
  INV_DOWNLOAD_PATCH,
  INV_DROPPED,
  INV_EXPERIMENTS_TITLE,
  INV_FIX_ACCEPTED,
  INV_FIX_REJECTED,
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
import { Mascot } from "../../mascots/Mascot";

const GATE_ORDER = ["test_first", "diff_limits", "fixed", "mutation_check", "no_regressions", "no_new_anomalies", "static_checks", "independent_review"] as const;

const agentName = (id: string) => CREW_BY_ID[id as keyof typeof CREW_BY_ID]?.name ?? id;
const label = (map: Readonly<Record<string, string>>, id: string) => map[id] ?? id.replace(/_/g, " ");
const candTitle = (inv: Investigation, id: string) => inv.feature_map?.candidates.find((x) => x.id === id)?.title ?? id;

function Panel({ title, children, id }: { readonly title: string; readonly children: ReactNode; readonly id: string }) {
  return (
    <section className="panel" aria-labelledby={id}>
      <h3 id={id} className="panel__title">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- overview

export function OverviewTab({ inv, events }: { readonly inv: Investigation; readonly events: readonly ReplayEventMsg[] }) {
  const needs: { text: string; href: string }[] = [];
  if (inv.stage === "awaiting-plan-approval") needs.push({ text: "Approve the plan so the experiments can run.", href: caseHref(inv.id, "plan") });
  const pending = pendingFixes(inv);
  if (pending > 0) needs.push({ text: `Accept or reject ${pending === 1 ? "a verified fix" : `${pending} verified fixes`}.`, href: caseHref(inv.id, "fixes") });
  return (
    <div className="tab-grid">
      <Panel id="ov-needs" title={CASE_PAGE.needsYou}>
        {needs.length === 0 ? (
          <p className="muted-note">{CASE_PAGE.nothingNeeded}</p>
        ) : (
          <ul role="list" className="needs">
            {needs.map((n) => (
              <li key={n.href}>
                <a href={n.href}>{n.text}</a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel id="ov-results" title={CASE_PAGE.results}>
        {inv.bugs.length === 0 ? (
          <p className="muted-note">{inv.stage === "completed" ? INV_NO_BUGS : CASE_PAGE.noBugsYet}</p>
        ) : (
          <ul role="list" className="result-list">
            {inv.bugs.map((b) => (
              <li key={b.id}>
                <a href={caseHref(inv.id, "findings")}>{b.title}</a>
                <span className="result-list__fix" data-fix-state={b.fix.state}>
                  {b.fix.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel id="ov-latest" title={CASE_PAGE.latest}>
        <EventList events={events.slice(-8).reverse()} />
        <p>
          <a href={caseHref(inv.id, "activity")}>{CASE_PAGE.allActivity}</a>
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- plan

export function PlanTab({ inv, onApprove, busy }: { readonly inv: Investigation; readonly onApprove: () => void; readonly busy: boolean }) {
  const candidates = inv.feature_map?.candidates ?? [];
  const experiments = inv.test_plan?.experiments ?? [];
  if (!inv.capabilities && candidates.length === 0) return <p className="muted-note">{CASE_PAGE.planNotReady}</p>;
  return (
    <div className="tab-stack">
      {inv.stage === "awaiting-plan-approval" ? (
        <section className="panel panel--action" aria-labelledby="plan-approve">
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

      {experiments.length > 0 ? (
        <Panel id="plan-exps" title={`${INV_EXPERIMENTS_TITLE} (${experiments.length})`}>
          <ol role="list" className="rows">
            {experiments.map((e) => (
              <li key={e.id} className="row" data-status={e.status}>
                <p className="row__head">
                  <strong>{candTitle(inv, e.candidate_id)}</strong> <span className="tag mono">{e.status.replace(/_/g, " ")}</span>
                </p>
                {e.point_count > 0 ? <p className="row__meta">{INV_POINTS(e.point_count, e.zones.length)}</p> : null}
                {e.claim ? <p>{e.claim}</p> : null}
                {e.invariants.length > 0 ? (
                  <ul role="list" className="row__sub">
                    {e.invariants.map((iu) => (
                      <li key={iu.id}>
                        <strong>{label(INVARIANT_LABELS, iu.id)}</strong>: {iu.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {e.executability_reason ? <p className="row__meta">{e.executability_reason}</p> : null}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      {candidates.length > 0 ? (
        <Panel id="plan-cands" title={`${INV_CANDIDATES_TITLE} (${candidates.length})`}>
          {inv.feature_map?.note ? <p className="muted-note">{inv.feature_map.note}</p> : null}
          <ol role="list" className="rows">
            {candidates.map((x) => (
              <li key={x.id} className="row" data-selected={x.selected ? "true" : "false"}>
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
        </Panel>
      ) : null}

      {inv.capabilities ? (
        <Panel id="plan-caps" title={INV_CAPABILITIES_TITLE}>
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
        </Panel>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- findings

function BugFinding({ bug }: { readonly bug: Bug }) {
  return (
    <li className="row row--bug">
      <h4 className="row__title">{bug.title}</h4>
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
      <details className="disclosure">
        <summary>
          {INV_TEST_TERM} <span className="mono">{bug.regression_test_path}</span>
        </summary>
        <pre className="code mono">{bug.regression_test}</pre>
      </details>
    </li>
  );
}

function IntendedItem({ f }: { readonly f: IntendedFinding }) {
  return (
    <li className="row" data-intended={f.id}>
      <h4 className="row__title">{f.title}</h4>
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
    </li>
  );
}

export function FindingsTab({ inv }: { readonly inv: Investigation }) {
  const intended = inv.intended ?? [];
  if (inv.sweeps.length === 0 && inv.bugs.length === 0 && intended.length === 0) return <p className="muted-note">{CASE_PAGE.findingsNone}</p>;
  const experiments = inv.test_plan?.experiments ?? [];
  return (
    <div className="tab-stack">
      {intended.length > 0 ? (
        <Panel id="find-intended" title={`Intended behaviour, not bugs (${intended.length})`}>
          <p className="muted-note">These broke a rule on purpose: the repository's own tests or docs say this is how it should behave. No fix is attempted.</p>
          <ol role="list" className="rows">
            {intended.map((f) => (
              <IntendedItem key={f.id} f={f} />
            ))}
          </ol>
        </Panel>
      ) : null}
      <Panel id="find-bugs" title={`Reproduced bugs (${inv.bugs.length})`}>
        {inv.bugs.length === 0 ? (
          <p className="muted-note">{inv.stage === "completed" ? INV_NO_BUGS : CASE_PAGE.noBugsYet}</p>
        ) : (
          <ol role="list" className="rows">
            {inv.bugs.map((b) => (
              <BugFinding key={b.id} bug={b} />
            ))}
          </ol>
        )}
      </Panel>
      {inv.sweeps.length > 0 ? (
        <Panel id="find-sweeps" title={INV_SWEEPS_TITLE}>
          <ul role="list" className="rows">
            {inv.sweeps.map((sw) => (
              <li key={sw.experiment_id} className="row">
                <strong>{candTitle(inv, experiments.find((e) => e.id === sw.experiment_id)?.candidate_id ?? sw.experiment_id)}</strong>
                <p className="row__meta">{INV_SWEEP_LINE(sw.points_run, sw.zones.length, sw.violations.length)}</p>
              </li>
            ))}
          </ul>
        </Panel>
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

function BugFix({ bug, invId, onChanged }: { readonly bug: Bug; readonly invId: string; readonly onChanged: () => void }) {
  const { api } = useApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const last = bug.fix.attempts[bug.fix.attempts.length - 1];
  const decide = async (accept: boolean) => {
    if (!api) return;
    setBusy(true);
    try {
      await api.decideFix(invId, bug.id, accept);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="row row--bug" data-fix-state={bug.fix.state}>
      <div className="row__headline">
        <span aria-hidden="true">
          <Mascot id="doctor-stitch" width={FIG.avatar} decorative idle={false} />
        </span>
        <h4 className="row__title">{bug.title}</h4>
        <span className="fix-state" data-fix-state={bug.fix.state}>
          {bug.fix.label}
        </span>
      </div>
      {bug.fix.attempts.map((a) => (
        <details key={a.attempt} className="disclosure" open={a === last}>
          <summary>
            {INV_ATTEMPT(a.attempt)}: {a.summary}
          </summary>
          {a.tool_calls ? (
            <p className="row__meta">
              {a.tool_calls} tool calls · regression test run {a.test_runs ?? 0} {a.test_runs === 1 ? "time" : "times"} in his session
            </p>
          ) : null}
          {a.root_cause ? (
            <p>
              <strong>{INV_ROOT_CAUSE}:</strong> {a.root_cause}
            </p>
          ) : null}
          <GateList attempt={a} />
          {parseUnifiedDiff(a.diff).map((f) => (
            <DiffView key={f.file} caption={FIX_CHANGE_CAPTION} file={f.file} lines={f.lines} />
          ))}
        </details>
      ))}
      {bug.fix.state === "verified" ? (
        <div className="actions">
          {bug.fix.user_decision === "pending" ? (
            <>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void decide(true)}>
                {INV_ACCEPT_FIX}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void decide(false)}>
                {INV_REJECT_FIX}
              </button>
            </>
          ) : bug.fix.user_decision === "accepted" ? (
            <>
              <span>{INV_FIX_ACCEPTED}</span>
              {api ? (
                <a className="btn" href={api.patchUrl(invId, bug.id)} download>
                  {INV_DOWNLOAD_PATCH}
                </a>
              ) : null}
            </>
          ) : (
            <span>{INV_FIX_REJECTED}</span>
          )}
        </div>
      ) : null}
      {err ? (
        <p className="alert" role="alert">
          {err}
        </p>
      ) : null}
    </li>
  );
}

export function FixesTab({ inv, onChanged }: { readonly inv: Investigation; readonly onChanged: () => void }) {
  if (inv.bugs.length === 0) return <p className="muted-note">{CASE_PAGE.fixesNone}</p>;
  return (
    <ol role="list" className="rows">
      {inv.bugs.map((b) => (
        <BugFix key={b.id} bug={b} invId={inv.id} onChanged={onChanged} />
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- activity

export function EventList({ events }: { readonly events: readonly ReplayEventMsg[] }) {
  if (events.length === 0) return <p className="muted-note">{CASE_PAGE.noEvents}</p>;
  return (
    <ol role="list" className="events">
      {events.map((e) => (
        <li key={e.seq} data-kind={e.kind}>
          <span className="events__who">{agentName(e.actor)}</span>
          <span className="events__text">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

function DecisionItem({ d }: { readonly d: DecisionRecord }) {
  return (
    <li className="row" data-decision={d.decision}>
      <p className="row__head">
        <strong>{agentName(d.agent)}</strong> <span className="mono">{d.step.replace(/_/g, " ")}</span>{" "}
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

export function ActivityTab({ inv, events }: { readonly inv: Investigation; readonly events: readonly ReplayEventMsg[] }) {
  const [phase, setPhase] = useState<Phase | "all">("all");
  const shown = phase === "all" ? events : events.filter((e) => e.phase === phase);
  const decisions = phase === "all" ? inv.decisions : inv.decisions.filter((d) => d.phase === phase);
  return (
    <div className="tab-stack">
      <div className="field field--inline">
        <label htmlFor="activity-phase">{CASE_PAGE.phaseFilter}</label>
        <select id="activity-phase" value={phase} onChange={(e) => setPhase(e.currentTarget.value as Phase | "all")}>
          <option value="all">{CASE_PAGE.allPhases}</option>
          {FLOW_STEPS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sign}
            </option>
          ))}
        </select>
      </div>
      <Panel id="act-events" title={`Event log (${shown.length})`}>
        <EventList events={shown} />
      </Panel>
      <Panel id="act-decisions" title={`${INV_DECISIONS_TITLE} (${decisions.length})`}>
        {decisions.length === 0 ? (
          <p className="muted-note">No decisions yet.</p>
        ) : (
          <ol role="list" className="rows">
            {decisions.map((d) => (
              <DecisionItem key={d.id} d={d} />
            ))}
          </ol>
        )}
      </Panel>
      {inv.notes.length > 0 ? (
        <Panel id="act-notes" title="Notes from the Crew">
          <ul role="list" className="rows">
            {inv.notes.map((n, i) => (
              <li key={i} className="row">
                {n}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
