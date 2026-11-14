import { NewCaseAwakening } from "../animation/react/NewCaseAwakening";
import { OpenCaseForm } from "../cases/form/OpenCaseForm";
import { ModeShape } from "../cases/library/ModeShape";
import { NEW_CASE } from "../content/app";
import { CASE_MODES } from "../content/modes";
import { ReadinessNote } from "./ReadinessNote";

/** `#/new`: the form, with the readiness note and what each mode does beside it. */
export function NewCasePage({ repoUrl }: { readonly repoUrl?: string | undefined }) {
  return (
    <article className="page new-case-page" aria-labelledby="page-title">
      <header className="page__head">
        <h1 id="page-title" className="page__title" tabIndex={-1}>
          Lay the <em>trap</em>
        </h1>
        <p className="page__lead">{NEW_CASE.lead}</p>
      </header>
      <NewCaseAwakening />
      <div className="split">
        <section className="sheet" aria-labelledby="page-title">
          <OpenCaseForm labelledBy="page-title" initial={repoUrl ? { repoUrl } : {}} />
        </section>
        <aside className="split__aside">
          <ReadinessNote />
          <section className="panel" aria-labelledby="modes-title">
            <h2 id="modes-title" className="panel__title">
              {NEW_CASE.modesTitle}
            </h2>
            <dl className="modes">
              {CASE_MODES.map((m) => (
                <div key={m.id}>
                  <dt>
                    <ModeShape shape={m.shape} size={18} /> {m.label}
                  </dt>
                  <dd>{m.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </article>
  );
}
