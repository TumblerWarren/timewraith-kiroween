import { stampTilt } from "../../components/tilt";
import { CASE_AREA_TERM, CASE_MODE_TERM, CASE_TARGET_TERM } from "../../content/caseView";
import { FIXED_CHECK_NOT_RUN } from "../../content/copy";
import { CASE_MODE_BY_ID } from "../../content/modes";
import { ModeShape } from "../library/ModeShape";
import { targetLine, visibleTitle, type SampleCase } from "../model";

export interface CaseHeaderProps {
  readonly c: SampleCase;
  /** False before a Blind hunt's reveal: the target-based title is shown. */
  readonly revealed: boolean;
  /** True when the stream holds a passed fixed-version check. */
  readonly fixedPass: boolean;
}

/**
 * Case header (Requirements 22.1, 22.7, 23.2): the title (the target-based one until a Blind hunt's reveal), the
 * sample label as a stamp, the mode with its shape, the target in mono, the area, and "Fixed-version check not
 * run" where the stream has no passed fixed-version check.
 */
export function CaseHeader({ c, revealed, fixedPass }: CaseHeaderProps) {
  const mode = CASE_MODE_BY_ID[c.mode];
  return (
    <div className="case-head">
      <div className="case-file__head">
        <h3 id="case-file-title">{visibleTitle(c, revealed)}</h3>
        <p className="case-file__sample stamp" style={stampTilt(`case-sample-${c.id}`, 2.5)}>
          {c.sampleLabel}
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
          <dd className="mono">{targetLine(c.target)}</dd>
        </div>
        {c.area ? (
          <div className="case-head__fact">
            <dt>{CASE_AREA_TERM}</dt>
            <dd>{c.area}</dd>
          </div>
        ) : null}
      </dl>
      {fixedPass ? null : (
        <p className="case-head__check" data-check="not-run">
          <span className="case-head__check-shape" aria-hidden="true" />
          {FIXED_CHECK_NOT_RUN}
        </p>
      )}
    </div>
  );
}
