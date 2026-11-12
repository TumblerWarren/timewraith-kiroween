import { caseHref } from "../app/router";
import { caseState } from "../app/status";
import { StatusPill } from "../app/StatusPill";
import { ModeShape } from "../cases/library/ModeShape";
import { targetLine, visibleTitle, type Case } from "../cases/model";
import { CASES } from "../content/app";
import { NOT_SAVED } from "../content/copy";
import { CASE_MODE_BY_ID } from "../content/modes";

const opened = (c: Case) => (c.kind === "draft" ? c.createdAt : c.summary.created_at);

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Cases as a list of rows: repository and ref, mode, status pill, what is happening now (or why it stopped), and
 * when it was opened. The whole title is the link to the case page.
 */
export function CaseRows({ cases, onRemove }: { readonly cases: readonly Case[]; readonly onRemove?: (id: string) => void }) {
  return (
    <ol role="list" className="case-rows">
      {cases.map((c) => {
        const st = caseState(c);
        const mode = CASE_MODE_BY_ID[c.mode];
        return (
          <li key={c.id} className="case-row" data-state={st.id} data-case-id={c.id} data-case-kind={c.kind}>
            <div className="case-row__main">
              <a className="case-row__title" href={caseHref(c.id)}>
                {visibleTitle(c)}
              </a>
              <span className="case-row__target mono">{targetLine(c.target)}</span>
            </div>
            <span className="case-row__mode">
              <ModeShape shape={mode.shape} size={18} />
              <span>{mode.label}</span>
            </span>
            <span className="case-row__status">
              <StatusPill state={st.id} label={st.label} />
            </span>
            <span className="case-row__now">{c.kind === "draft" && !c.saved ? NOT_SAVED : st.detail}</span>
            <time className="case-row__when" dateTime={opened(c)}>
              {when(opened(c))}
            </time>
            {c.kind === "draft" && onRemove ? (
              <button type="button" className="btn btn--small" onClick={() => onRemove(c.id)}>
                {CASES.remove}
                <span className="visually-hidden">: {visibleTitle(c)}</span>
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
