import { useId } from "react";
import type { Investigation } from "../../api/types";
import { CASE_ADDITIONS } from "../../content/copy";
import { INVARIANT_LABELS } from "../../content/caseView";

const copy = CASE_ADDITIONS;

export function PlanCoverage({ inv }: { readonly inv: Investigation }) {
  const id = useId();
  const coverage = inv.coverage ?? [];
  if (coverage.length === 0 && !inv.sweep_window) return null;
  const tested = coverage.filter((row) => row.status === "clean" || row.status === "violations").length;
  const violations = coverage.filter((row) => row.status === "violations").length;
  return (
    <section className="case-section" aria-labelledby={id}>
      <h3 id={id} className="panel__title">{copy.coverage.title}</h3>
      {inv.sweep_window && <p className="case-note">Testing window · {new Date(inv.sweep_window.start_ms).toISOString().slice(0, 10)} through {new Date(inv.sweep_window.end_ms - 1).toISOString().slice(0, 10)} UTC</p>}
      <p className="case-note">{copy.coverage.summary(tested, coverage.length, violations)}</p>
      <div className="case-table-scroll" role="region" aria-label={copy.coverage.tableLabel} tabIndex={0}>
        <table className="case-coverage">
          <thead><tr>{[copy.coverage.unit, copy.coverage.status, copy.coverage.rules, copy.coverage.edges, copy.coverage.outcome].map((title) => <th key={title} scope="col">{title}</th>)}</tr></thead>
          <tbody>{coverage.map((row) => <tr key={row.candidate_id}>
            <th scope="row"><span>{row.unit}</span><span className="case-note mono case-coverage__path">{row.path}</span></th>
            <td><span className={`tag${row.status === "clean" ? " tag--good" : row.status === "violations" ? " tag--bad" : row.status === "adapter_invalid" ? " tag--warn" : ""}`}>{copy.coverage.statusLabels[row.status]}</span></td>
            <td>{row.rules.length ? <ul role="list">{row.rules.map((rule) => <li key={rule}>{INVARIANT_LABELS[rule] ?? rule.replaceAll("_", " ")}</li>)}</ul> : copy.coverage.none}</td>
            <td>{row.edges.length ? <ul role="list">{row.edges.map((edge) => <li key={edge}>{edge}</li>)}</ul> : copy.coverage.none}</td>
            <td>{row.outcome || copy.coverage.none}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function PlannerRounds({ inv }: { readonly inv: Investigation }) {
  const id = useId();
  const intents = inv.intents ?? [];
  const decisions = inv.decisions.filter((decision) => decision.step === "plan_round");
  const roundOf = (subject: string) => {
    const match = /^round (\d+)$/i.exec(subject.trim());
    return match ? Number(match[1]) : null;
  };
  const rounds = [...new Set([...intents.map((intent) => intent.round), ...decisions.flatMap((decision) => {
    const round = roundOf(decision.subject);
    return round === null ? [] : [round];
  })])].sort((a, b) => a - b);
  if (rounds.length === 0) return null;
  const unitName = (candidate: string) => inv.coverage?.find((row) => row.candidate_id === candidate)?.unit
    ?? inv.feature_map?.candidates.find((row) => row.id === candidate)?.title ?? candidate;
  return (
    <section className="case-section" aria-labelledby={id}>
      <h3 id={id} className="panel__title">{copy.planner.title}</h3>
      {rounds.map((round) => <section key={round} className="case-planner-round" aria-labelledby={`${id}-${round}`}>
        <h4 id={`${id}-${round}`}>{copy.planner.round(round)}</h4>
        {intents.some((intent) => intent.round === round) && <ul role="list" className="case-card-grid">
          {intents.filter((intent) => intent.round === round).map((intent) => <li key={intent.id} className="case-card">
            <div className="case-card__head"><h5 className="case-planner-focus">{intent.focus}</h5><span className={`tag${intent.status === "swept" || intent.status === "designed" ? " tag--good" : intent.status === "rejected" ? " tag--warn" : ""}`}>{copy.planner.statusLabels[intent.status]}</span></div>
            <p className="case-note">{unitName(intent.candidate_id)}</p>
            {intent.rationale && <p className="case-note">{intent.rationale}</p>}
            {intent.reason && <p><span className="case-note">{copy.planner.reason}: </span>{intent.reason}</p>}
          </li>)}
        </ul>}
        {decisions.filter((decision) => roundOf(decision.subject) === round).map((decision) => <div key={decision.id} className="case-round-decision">
          <p>{decision.rule}</p>
          {decision.claim && <p className="case-note">{decision.claim}</p>}
        </div>)}
      </section>)}
    </section>
  );
}
