import { Cta } from "../../components/Cta";
import { paperTilt, stampTilt } from "../../components/tilt";
import { FINAL_HEADING, FINAL_INTRO, FINAL_STAMP } from "../../content/sections";
import { Mascot } from "../../mascots/Mascot";

/** Skeleton Scribe's pen stroke under the heading: one hand-inked wavy line in a 200 x 12 box. Decorative. */
const UNDERLINE = "M3 8 C30 3 52 10 80 6 S130 3 152 7 S186 9 197 4";

/**
 * Closing (region 7, dawn, moon-200; was Final_CTA, decision D19): a centered paper sheet with the heading "Open a
 * case", one "Open a case" button that returns to the Open-a-case panel, and the demo and GitHub Placeholder_Links
 * with the shared footnote (Requirements 3.10, 5.6 to 5.8). The page footer is rendered by App after <main>
 * (decision D5). The Raven's stamp "Filed 06:58" is DOM text, so it stays accessible (Requirement 3.11). When the
 * region enters, BoardMotion requests `raven.stamp`: the stamp thumps onto the sheet and Skeleton Scribe's hand
 * draws the underline under the prompt (`data-scribe-underline`). Reduce Motion: both shown, 120 ms fade.
 */
export function Closing() {
  return (
    <section id="close" className="section section--close" aria-labelledby="close-title">
      <div className="section__inner">
        <div className="rail" aria-hidden="true" data-thread-anchor="" />
        <div className="content final__layout">
          <div className="cta-sheet paper-sheet" style={paperTilt("final-cta-sheet", 0.6, 0)} data-closing-sheet="">
            <div className="final__raven">
              <Mascot id="raven-archivist" width={184} />
            </div>
            <p className="cta-sheet__stamp stamp mono" data-raven-stamp="" style={stampTilt("final-raven-stamp")}>
              {FINAL_STAMP}
            </p>

            <h2 id="close-title" tabIndex={-1} className="cta-sheet__title">
              {FINAL_HEADING}
              <svg className="cta-sheet__underline" viewBox="0 0 200 12" preserveAspectRatio="none" focusable="false" aria-hidden="true" data-scribe-underline="">
                <path d={UNDERLINE} />
              </svg>
            </h2>
            <p className="cta-sheet__intro">{FINAL_INTRO}</p>

            <Cta className="cta-sheet__actions" />

            <div className="final__scribe">
              <Mascot id="skeleton-scribe" width={104} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
