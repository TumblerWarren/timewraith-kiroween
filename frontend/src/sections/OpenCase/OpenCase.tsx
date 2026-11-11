import { Clock } from "../../components/Clock";
import { SetupChecklist } from "../../components/SetupChecklist";
import { paperTilt } from "../../components/tilt";
import { OpenCaseForm } from "../../cases/form/OpenCaseForm";
import { HEADLINE, NOT_CONTACTED, POSITIONING, SUBHEAD } from "../../content/copy";
import { OPEN_FORM_HEADING, OPEN_FORM_NOTE_TAIL } from "../../content/sections";
import { inkPath } from "../../mascots/placeholder/inkPath";
import { Mascot } from "../../mascots/Mascot";

/** The headline's last word gets a hand-inked underline; the text content stays exactly HEADLINE. */
const HEADLINE_PARTS = /^(.*\s)(\S+)$/.exec(HEADLINE);

/** A crooked gothic window behind the clock (decorative, hidden below 768px). */
const ARCH = {
  outline: inkPath(
    [
      [56, 520],
      [52, 300],
      [74, 180],
      [150, 82],
      [260, 14, 1],
      [372, 82],
      [446, 180],
      [468, 300],
      [464, 520],
    ],
    { seed: 11, amp: 3, closed: false },
  ),
  // Brick courses: short ink strokes that stop before the edges.
  bricks: [150, 230, 310, 390, 470].map((y, i) =>
    inkPath(
      [
        [86 + (i % 2) * 18, y],
        [434 - ((i + 1) % 2) * 18, y + 3],
      ],
      { seed: 60 + i, amp: 2, closed: false },
    ),
  ),
};

/**
 * Open-a-case panel (region 1, night; was the Hero). One big figure: the Wraith Director rises from below the ledge
 * on the left in front of the Clock, lantern raised toward the form. The headline, subhead and positioning line sit
 * in the right column above the paper form sheet; the setup checklist is the notice board pinned under it, with the
 * Watchtower Warden small and peering over its corner. The Mini Bat roosts on the Clock ring (Requirements 3.1, 3.2,
 * 6.1 to 6.4). The Open_Case_Form sits on the sheet (`data-slot="open-case-form"`, task 7.4); its submit note carries
 * "Draft, not run", and the "Not contacted in demo mode" line follows the form.
 */
export function OpenCase() {
  return (
    <section id="open" className="section section--open" aria-labelledby="open-title">
      <div className="section__inner">
        <div className="rail" aria-hidden="true" data-thread-anchor="" />
        <div className="content">
          <div className="hero__grid">
            {/* Copy first in source order, so assistive technology reads the headline before the stage. */}
            <div className="hero__copy">
              <h1 id="open-title" className="hero__title" tabIndex={-1}>
                {HEADLINE_PARTS ? (
                  <>
                    {HEADLINE_PARTS[1]}
                    <span className="hero__time">{HEADLINE_PARTS[2]}</span>
                  </>
                ) : (
                  HEADLINE
                )}
              </h1>
              <p className="hero__subhead">{SUBHEAD}</p>
              <p className="open__positioning">{POSITIONING}</p>

              <div className="open__sheet paper-sheet theme-paper" style={paperTilt("open-form-sheet", 0.5, 0)} data-slot="open-case-form">
                <h2 id="open-case-title" className="open__sheet-title" tabIndex={-1}>
                  {OPEN_FORM_HEADING}
                </h2>
                <OpenCaseForm />
                <p className="open__sheet-note">
                  <strong>{NOT_CONTACTED}:</strong> {OPEN_FORM_NOTE_TAIL}
                </p>
              </div>
            </div>

            <div className="hero__stage">
              <svg
                className="hero__arch"
                viewBox="0 0 520 520"
                width={520}
                height={520}
                preserveAspectRatio="none"
                focusable="false"
                aria-hidden="true"
              >
                <path d={ARCH.outline} fill="var(--ink-900)" stroke="var(--walnut-700)" strokeWidth={8} strokeLinejoin="round" />
                {ARCH.bricks.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke="var(--walnut-700)" strokeWidth={3} strokeLinecap="round" />
                ))}
              </svg>
              <div className="hero__clock">
                <Clock id="hero-clock" hours={23} minutes={59} />
              </div>
              <div className="hero__bat">
                <Mascot id="mini-bat" decorative eager />
              </div>
              <div className="hero__wraith" data-hero-figure="wraith-director">
                <Mascot id="wraith-director" eager width={640} />
              </div>
            </div>

            <div className="hero__notice">
              <div className="hero__warden" data-hero-figure="watchtower-warden">
                <Mascot id="watchtower-warden" eager width={96} />
              </div>
              <SetupChecklist />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
