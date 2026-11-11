import { CaseView as CaseViewBody } from "../../cases/view/CaseView";

/**
 * Case view (region 4, night, tower-950): a thin region shell around the selected case (`cases/view/CaseView`).
 * The case-file sheet holds the two-track Replay_Lab, then the case-scoped proof (Evidence Ladder marking the
 * current rung, "Browser time ≠ server time" on Jack's panel with the case's time control, Mummy Wrapper's hash
 * tag), then Doctor Stitch's suggested fix. Requirements 7, 8, 22 to 26.
 */
export function CaseView() {
  return (
    <section id="case" className="section section--case" aria-labelledby="case-title">
      <div className="section__inner">
        <div className="rail" aria-hidden="true" data-thread-anchor="" />
        <div className="content">
          <CaseViewBody />
        </div>
      </div>
    </section>
  );
}
