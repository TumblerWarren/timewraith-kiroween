import { useState } from "react";
import { href } from "../app/router";
import { caseState, STATE_LABELS, type CaseStateId } from "../app/status";
import { useCaseActions } from "../cases/actions";
import { CASES, HOME } from "../content/app";
import { CaseRows } from "./CaseRows";

const FILTERS: readonly CaseStateId[] = ["running", "waiting", "failed", "done", "draft"];

/** `#/cases`: every case with its status, filterable by state. */
export function CasesPage() {
  const { store } = useCaseActions();
  const [filter, setFilter] = useState<CaseStateId | "all">("all");
  const shown = filter === "all" ? store.cases : store.cases.filter((c) => caseState(c).id === filter);
  const count = (id: CaseStateId) => store.cases.filter((c) => caseState(c).id === id).length;

  return (
    <article className="page" aria-labelledby="page-title">
      <header className="page__head page__head--row">
        <div>
          <p className="midnight-kicker">
            <span />
            Investigation archive
          </p>
          <h1 id="page-title" className="page__title" tabIndex={-1}>
            <em>{CASES.title}</em>
          </h1>
          <p className="page__lead">{CASES.lead}</p>
        </div>
        <a className="btn btn--primary" href={href({ page: "new" })}>
          {HOME.start}
        </a>
      </header>

      {store.cases.length === 0 ? (
        <p className="empty">{CASES.empty}</p>
      ) : (
        <>
          <div className="filters" role="group" aria-label={CASES.filterLabel}>
            <button type="button" className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              {CASES.all} ({store.cases.length})
            </button>
            {FILTERS.filter((f) => count(f) > 0).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {STATE_LABELS[f]} ({count(f)})
              </button>
            ))}
          </div>
          <CaseRows cases={shown} />
        </>
      )}
    </article>
  );
}
