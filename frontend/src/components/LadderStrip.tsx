import { EVIDENCE_BY_ID, EVIDENCE_LADDER, INCONCLUSIVE, type EvidenceStatusId } from "../content/evidence";
import { EvidenceShape } from "./EvidenceShape";

export interface LadderStripProps {
  /** The ladder state after the displayed event. */
  readonly current: EvidenceStatusId;
  readonly className?: string;
}

type RungState = "reached" | "current" | "ahead";

const STATE_TEXT: Readonly<Record<RungState, string>> = {
  reached: "reached",
  current: "current rung",
  ahead: "not reached",
};

/**
 * Compact version of the Evidence Ladder for the Replay_Lab (design: LadderStrip). The five rungs sit in one
 * row, in order, and the current event's rung is marked with the word "now" and a heavy underline as well as a
 * filled shape; rungs not yet reached are outline shapes. Inconclusive is shown apart from the row.
 */
export function LadderStrip({ current, className }: LadderStripProps) {
  const currentRank = EVIDENCE_BY_ID[current].rank;
  return (
    <div className={className ? `ladder-strip ${className}` : "ladder-strip"} role="group" aria-label="Evidence rung of this event">
      <ol className="ladder-strip__rungs" role="list">
        {EVIDENCE_LADDER.map((status) => {
          const rank = status.rank ?? 0;
          const state: RungState = currentRank === null || rank > currentRank ? "ahead" : rank === currentRank ? "current" : "reached";
          return (
            <li
              key={status.id}
              className="ladder-strip__rung"
              data-status={status.id}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <EvidenceShape shape={status.shape} size={28} hollow={state === "ahead"} className="ladder-strip__shape" />
              <span className="ladder-strip__label">
                {status.label}
                <span className="visually-hidden">, {STATE_TEXT[state]}</span>
              </span>
              {state === "current" ? (
                <span className="ladder-strip__now" aria-hidden="true">
                  now
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="ladder-strip__other" data-state={current === INCONCLUSIVE.id ? "current" : "ahead"}>
        <EvidenceShape shape={INCONCLUSIVE.shape} size={28} hollow className="ladder-strip__shape" />
        <span className="ladder-strip__label">
          {INCONCLUSIVE.label}
          <span className="visually-hidden">, {current === INCONCLUSIVE.id ? STATE_TEXT.current : "not this event"}</span>
        </span>
        {current === INCONCLUSIVE.id ? (
          <span className="ladder-strip__now" aria-hidden="true">
            now
          </span>
        ) : null}
      </p>
    </div>
  );
}
