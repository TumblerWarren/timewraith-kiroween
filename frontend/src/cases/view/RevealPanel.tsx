import { paperTilt, stampTilt } from "../../components/tilt";
import { REVEAL_HIDDEN_NOTE, REVEAL_HIDDEN_TITLE, REVEAL_SHOWN_LEAD, REVEAL_SHOWN_NOTE } from "../../content/caseView";
import { REVEAL_MATCH, REVEAL_NO_MATCH } from "../../content/copy";
import type { SampleCase } from "../model";

/** The recorded outcome of a Blind hunt, from the case data (Requirement 23.4): no recorded match is "Did not match". */
export function revealOutcomeText(c: SampleCase): string {
  return c.reveal?.outcome === "match" ? REVEAL_MATCH : REVEAL_NO_MATCH;
}

/** A face-down card's back: a hand-inked lattice. Decorative. */
function CardBack() {
  return (
    <svg className="reveal-card__lattice" viewBox="0 0 120 60" preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <path d="M0 10 L20 0 M0 30 L60 0 M0 50 L100 0 M10 60 L120 5 M50 60 L120 25 M90 60 L120 45" />
      <path d="M0 50 L20 60 M0 30 L60 60 M0 10 L100 60 M10 0 L120 55 M50 0 L120 35 M90 0 L120 15" />
    </svg>
  );
}

export interface RevealPanelProps {
  readonly c: SampleCase;
  readonly revealed: boolean;
}

/**
 * Blind hunt reveal (design: "Reveal"; Requirements 23.2 to 23.6, 16.5). Before the reveal index the panel is a
 * face-down paper card and the DOM holds nothing that identifies the hidden report: no number, no title, no link,
 * no accessible name. From the reveal on, the card is face up with the third-party report, its link and the
 * recorded outcome stamp; a decorative back layer (`.reveal-card__back`, hidden at rest) lets `replay.reveal`
 * turn the card over. Scrubbing back renders the face-down card again, without animation.
 */
export function RevealPanel({ c, revealed }: RevealPanelProps) {
  if (!revealed) {
    return (
      <div className="reveal-card reveal-card--down" data-face="down" style={paperTilt(`reveal-${c.id}`, 1.2, 2)}>
        <div className="reveal-card__face">
          <p className="reveal-card__title">{REVEAL_HIDDEN_TITLE}</p>
          <p className="reveal-card__note">{REVEAL_HIDDEN_NOTE}</p>
        </div>
        <CardBack />
      </div>
    );
  }
  const outcome = revealOutcomeText(c);
  return (
    <div className="reveal-card reveal-card--up" data-face="up" style={paperTilt(`reveal-${c.id}`, 1.2, 2)}>
      <div className="reveal-card__front reveal-card__face">
        <p className="reveal-card__lead">
          {REVEAL_SHOWN_LEAD}{" "}
          <a href={c.issue.href} rel="noreferrer">
            {c.issue.label}
          </a>
        </p>
        <p className="reveal-card__title">{c.title}</p>
        <p className="reveal-card__note">{REVEAL_SHOWN_NOTE}</p>
        <p
          className="reveal-card__stamp stamp"
          data-outcome={c.reveal?.outcome === "match" ? "match" : "no-match"}
          style={stampTilt(`reveal-stamp-${c.id}`, 4)}
        >
          {outcome}
        </p>
      </div>
      <div className="reveal-card__back" aria-hidden="true">
        <CardBack />
      </div>
    </div>
  );
}
