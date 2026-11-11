import { useRef } from "react";
import { paperTilt, stampTilt } from "../../components/tilt";
import {
  FIX_CHANGE_CAPTION,
  FIX_OURS_TITLE,
  FIX_REPORTED_RESULT,
  FIX_SAME_APPROACH,
  FIX_STATUS_TERM,
  FIX_TEST_CAPTION,
  FIX_UPSTREAM_HIDDEN,
  FIX_UPSTREAM_PASSES,
  FIX_UPSTREAM_TITLE,
} from "../../content/caseView";
import { FIXED_CHECK_NOT_RUN, ILLUSTRATIVE_DIFF, NO_UPSTREAM_FIX, SUGGESTED_FIX } from "../../content/copy";
import { CASE_FIX_NOTE } from "../../content/sections";
import { Mascot } from "../../mascots/Mascot";
import type { SampleCase } from "../model";
import { DiffView } from "./DiffView";
import { fixLabel, hasFixedPass, NOT_VERIFIED } from "./fixLabel";
import { useStitchSew } from "./useStitchSew";

/** A cross-stitch line down the diff's margin (12 x 100 box, stretched). */
const STITCHES = "M2 0 L10 6 M10 6 L2 12 M2 12 L10 18 M10 18 L2 24 M2 24 L10 30 M10 30 L2 36 M2 36 L10 42 M10 42 L2 48 M2 48 L10 54 M10 54 L2 60 M2 60 L10 66 M10 66 L2 72 M2 72 L10 78 M10 78 L2 84 M2 84 L10 90 M10 90 L2 96";

/** Doctor Stitch's needle arm: a curved needle with its eye up and a short trailing thread (40 x 56 box). */
function Needle() {
  return (
    <svg viewBox="0 0 40 56" width={40} height={56} focusable="false" aria-hidden="true">
      <path className="fix-needle__thread" d="M30 6 C40 14 38 28 26 30 C16 32 10 40 12 54" />
      <path className="fix-needle__steel" d="M30 4 C24 12 14 24 6 40" />
      <ellipse className="fix-needle__eye" cx={30} cy={6} rx={2.2} ry={3.6} transform="rotate(32 30 6)" />
    </svg>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface SuggestedFixProps {
  readonly c: SampleCase;
  /** False before a Blind hunt's reveal: the upstream column does not name or link the report yet. */
  readonly revealed: boolean;
}

/**
 * Doctor Stitch's suggested fix (design: "Suggested fix"; Requirements 24.1 to 24.7, 16.8, 12.5). Always headed
 * "Suggested fix". Left column: the proposed change and the regression test as diffs. Right column: the upstream
 * fix with its source and link, or "No upstream fix found". The status comes from `fixLabel(case)` and is
 * "Verified on ..." only under the design's rule; the word "merged" is never produced. Illustrative diffs are
 * labelled "Illustrative diff". Doctor Stitch stands at the sheet's left edge with his needle on the margin.
 */
export function SuggestedFix({ c, revealed }: SuggestedFixProps) {
  const fix = c.fix;
  const sheetRef = useRef<HTMLDivElement>(null);
  const diffsRef = useRef<HTMLDivElement>(null);
  const sew = useStitchSew(c.id, sheetRef, diffsRef);
  const status = fixLabel(c);
  const fixedPass = hasFixedPass(c);
  const upstream = fix.upstream;
  const sameApproach = upstream?.kind === "described-in-report" && status === NOT_VERIFIED;

  return (
    <div className="case__fix" data-fix-sheet="" data-case={c.id}>
      <div className="case__stitch" data-case-mascot="doctor-stitch">
        <Mascot id="doctor-stitch" width={150} />
      </div>
      <div
        ref={sheetRef}
        className="fix-sheet paper-sheet theme-paper"
        role="group"
        aria-labelledby="fix-title"
        data-sew={sew}
        style={paperTilt("case-fix-sheet", 0.6, 0)}
      >
        <h3 id="fix-title" className="fix-sheet__title">
          {SUGGESTED_FIX}
        </h3>
        <ul className="fix-sheet__labels" role="list">
          <li className="fix-sheet__label stamp" data-label="status" style={stampTilt("fix-label-status", 2)}>
            {`${SUGGESTED_FIX} · ${lowerFirst(status)}`}
          </li>
          {fix.illustrative ? (
            <li className="fix-sheet__label stamp" data-label="illustrative" style={stampTilt("fix-label-diff", 2)}>
              {ILLUSTRATIVE_DIFF}
            </li>
          ) : null}
        </ul>
        <p className="fix-sheet__summary">{fix.summary}</p>

        <div className="fix-sheet__cols">
          <div className="fix-sheet__ours">
            <h4 className="fix-sheet__col-title">{FIX_OURS_TITLE}</h4>
            <p className="fix-sheet__status" data-status={status === NOT_VERIFIED ? "not-verified" : "verified"}>
              {FIX_STATUS_TERM}: <span className="fix-sheet__status-value">{status}</span>
              {sameApproach ? <span> · {FIX_SAME_APPROACH}</span> : null}
            </p>
            <div ref={diffsRef} className="fix-diffs">
              <span className="fix-diffs__thread" aria-hidden="true">
                <svg viewBox="0 0 12 96" preserveAspectRatio="none" focusable="false">
                  <path d={STITCHES} />
                </svg>
              </span>
              <span className="fix-needle" aria-hidden="true">
                <Needle />
              </span>
              <DiffView caption={FIX_CHANGE_CAPTION} file={fix.change.file} lines={fix.change.lines} />
              <DiffView caption={FIX_TEST_CAPTION} file={fix.regressionTest.file} lines={fix.regressionTest.lines} />
            </div>
          </div>

          <div className="fix-sheet__upstream">
            <h4 className="fix-sheet__col-title">{FIX_UPSTREAM_TITLE}</h4>
            {!upstream ? (
              <p className="fix-sheet__upstream-none">{NO_UPSTREAM_FIX}</p>
            ) : !revealed ? (
              <p className="fix-sheet__upstream-hidden">{FIX_UPSTREAM_HIDDEN}</p>
            ) : (
              <div className="fix-sheet__upstream-body">
                <p>
                  <a href={upstream.href} rel="noreferrer">
                    {upstream.label}
                  </a>
                </p>
                {upstream.reportedResult ? (
                  <p>
                    {FIX_REPORTED_RESULT} <span className="mono">{upstream.reportedResult}</span>
                  </p>
                ) : null}
                {fixedPass ? <p className="fix-sheet__upstream-pass">{FIX_UPSTREAM_PASSES}</p> : null}
              </div>
            )}
          </div>
        </div>

        <p className="fix-sheet__note">{CASE_FIX_NOTE}</p>
        {fixedPass ? null : <p className="fix-sheet__check">{FIXED_CHECK_NOT_RUN}</p>}
      </div>
    </div>
  );
}
