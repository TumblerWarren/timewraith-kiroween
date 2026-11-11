import type { ReactNode } from "react";
import { paperTilt } from "../components/tilt";
import { REPLAY_EVENT_NO_EVIDENCE } from "../content/sections";
import { CREW_BY_ID, type MascotId } from "../content/crew";
import { EVIDENCE_BY_ID } from "../content/evidence";
import type { ReplayEvent } from "../data/types";
import { Mascot } from "../mascots/Mascot";
import { formatOffset } from "./format";

/** Mascots that stand on the case-file sheet. Other actors get a small decorative thumbnail on the card. */
export const ON_SHEET: ReadonlySet<MascotId> = new Set(["spider-weaver", "bat-scout", "raven-archivist"]);

/**
 * Actor id of the figure that acts out an event: the figure on the sheet, or the card's thumbnail. Thumbnails
 * register under their own id, so they never replace the Jack panel's or the fix sheet's figure in the registry.
 */
export function eventActorId(actor: MascotId, region = "case"): string {
  return ON_SHEET.has(actor) ? `${region}:${actor}` : `${region}:thumb:${actor}`;
}

export interface EventCardProps {
  readonly event: ReplayEvent;
  readonly total: number;
  /** Extra lines under the event text (the check stamp of a compare or verify event). */
  readonly children?: ReactNode;
}

/**
 * The displayed event (Requirements 7.1, 7.11). Timestamp and evidence values are JetBrains Mono. The text is
 * announced by the Replay_Lab's own live region (debounced while dragging), not by this card.
 */
export function EventCard({ event, total, children }: EventCardProps) {
  const actor = CREW_BY_ID[event.actor];
  const status = EVIDENCE_BY_ID[event.status];
  const evidence = event.evidence;
  return (
    <div className="event-card" data-event={event.id} data-kind={event.kind}>
      <p className="event-card__seq">
        Event {event.seq + 1} of {total}
      </p>

      <div className="event-card__actor">
        {ON_SHEET.has(event.actor) ? null : (
          <div className="event-card__thumb paper-piece" style={paperTilt(`replay-thumb-${event.actor}`, 1.4, 0)} data-thumb="">
            <Mascot id={event.actor} width={64} decorative actor={eventActorId(event.actor)} />
          </div>
        )}
        <p className="event-card__name">{actor.name}</p>
        <p className="event-card__kind">{event.kind}</p>
      </div>

      <div className="event-card__live">
        <p className="event-card__text">{event.text}</p>
        {children}
      </div>

      <dl className="event-card__facts">
        <div className="event-card__fact">
          <dt>Timestamp</dt>
          <dd>
            <time className="mono" dateTime={`PT${Math.floor(event.tOffsetMs / 1000)}S`}>
              {formatOffset(event.tOffsetMs)}
            </time>
          </dd>
        </div>
        <div className="event-card__fact">
          <dt>Evidence rung</dt>
          <dd className="mono">{status.label}</dd>
        </div>
        <div className="event-card__fact">
          <dt>{evidence ? evidence.label : "Evidence"}</dt>
          <dd className="mono">
            {evidence ? (
              <>
                {evidence.expected !== undefined ? (
                  <span className="event-card__value">
                    expected <b>{evidence.expected}</b>
                  </span>
                ) : null}
                {evidence.observed !== undefined ? (
                  <span className="event-card__value">
                    observed <b>{evidence.observed}</b>
                  </span>
                ) : null}
              </>
            ) : (
              REPLAY_EVENT_NO_EVIDENCE
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
