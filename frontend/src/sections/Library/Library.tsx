import { CaseLibrary } from "../../cases/library/CaseLibrary";
import { LIBRARY_HEADING, LIBRARY_INTRO } from "../../content/sections";
import { Mascot } from "../../mascots/Mascot";

/**
 * Case library (region 3, dusk, walnut-700). The paper folders come from `cases/catalog.ts` through `CaseLibrary`:
 * the two sample cases first, then the visitor's drafts newest first (task 8.3). Skeleton Scribe's hand rests on the
 * shelf and a Mini Bat hangs from its edge.
 */
export function Library() {
  return (
    <section id="library" className="section section--library" aria-labelledby="library-title">
      <div className="section__inner">
        <div className="rail" aria-hidden="true" data-thread-anchor="" />
        <div className="content">
          <div className="library__intro">
            <h2 id="library-title" tabIndex={-1}>
              {LIBRARY_HEADING}
            </h2>
            <p>{LIBRARY_INTRO}</p>
          </div>

          <div className="library__shelf">
            <CaseLibrary />

            <div className="library__scribe" aria-hidden="true" data-library-mascot="skeleton-scribe">
              <Mascot id="skeleton-scribe" decorative width={120} />
            </div>
            <div className="library__bat" aria-hidden="true" data-library-mascot="mini-bat">
              <Mascot id="mini-bat" decorative width={80} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
