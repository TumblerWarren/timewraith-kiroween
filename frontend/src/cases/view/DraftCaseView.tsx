import { stampTilt } from "../../components/tilt";
import { CASE_AREA_TERM, CASE_ISSUE_TERM, CASE_MODE_TERM, CASE_TARGET_TERM, DRAFT_NO_EVENTS, DRAFT_RESULT, DRAFT_VERSION_TERM } from "../../content/caseView";
import { DRAFT_NOT_RUN, ISSUE_HIDDEN } from "../../content/copy";
import { CASE_MODE_BY_ID } from "../../content/modes";
import { ModeShape } from "../library/ModeShape";
import { DraftShape, ResultShape } from "../library/ResultShape";
import { draftTitle, draftVersions, targetLine, type DraftCase } from "../model";

/** Only http(s) URLs become links; anything else is shown as text (the form validates, this is belt and braces). */
const isWebUrl = (s: string) => /^https?:\/\//i.test(s);

const EMPTY_PEGS = 8;

/**
 * A draft in the Case view (Requirements 22.8, 20.2, 20.3, 16.7; Property 33). It has never run, so there are no
 * replay tracks: the target, the mode, the area, the issue link (Known issue only; a Blind hunt says "Issue hidden
 * until the reveal"), the label "Draft, not run: cases run in the next milestone", an empty dashed peg row and the
 * one version entry with "not run". No suggested fix, no lit rung.
 */
export function DraftCaseView({ d }: { readonly d: DraftCase }) {
  const mode = CASE_MODE_BY_ID[d.mode];
  const version = draftVersions(d)[0];
  return (
    <div className="draft-view" data-draft={d.id}>
      <div className="case-head">
        <div className="case-file__head">
          <h3 id="case-file-title">{draftTitle(d)}</h3>
          <p className="case-file__sample case-file__sample--draft stamp" style={stampTilt(`draft-label-${d.id}`, 2.5)}>
            <DraftShape size={20} />
            {DRAFT_NOT_RUN}
          </p>
        </div>
        <dl className="case-head__facts">
          <div className="case-head__fact">
            <dt>{CASE_MODE_TERM}</dt>
            <dd className="case-head__mode">
              <ModeShape shape={mode.shape} size={22} />
              {mode.label}
            </dd>
          </div>
          <div className="case-head__fact">
            <dt>{CASE_TARGET_TERM}</dt>
            <dd className="mono">{targetLine(d.target)}</dd>
          </div>
          {d.area ? (
            <div className="case-head__fact">
              <dt>{CASE_AREA_TERM}</dt>
              <dd>{d.area}</dd>
            </div>
          ) : null}
          {d.mode === "open-hunt" ? null : (
            <div className="case-head__fact">
              <dt>{CASE_ISSUE_TERM}</dt>
              <dd>
                {d.mode === "blind-hunt" ? (
                  ISSUE_HIDDEN
                ) : d.issueUrl && isWebUrl(d.issueUrl) ? (
                  <a className="mono" href={d.issueUrl} rel="noreferrer noopener">
                    {d.issueUrl}
                  </a>
                ) : (
                  <span className="mono">{d.issueUrl}</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="draft-view__track" aria-hidden="true">
        <ol className="draft-view__pegs" role="list">
          {Array.from({ length: EMPTY_PEGS }, (_, i) => (
            <li key={i} className="draft-view__peg" />
          ))}
        </ol>
      </div>
      <p className="draft-view__empty">{DRAFT_NO_EVENTS}</p>

      {version ? (
        <dl className="draft-view__version">
          <div className="case-head__fact">
            <dt>{DRAFT_VERSION_TERM}</dt>
            <dd>
              <span className="mono">{version.label}</span>
              <span className="draft-view__result">
                <ResultShape result="not-run" size={18} />
                {DRAFT_RESULT}
              </span>
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
