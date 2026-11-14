import { EVIDENCE_BY_ID, EVIDENCE_LADDER, INCONCLUSIVE, type EvidenceStatusId } from "../content/evidence";
import { EvidenceShape } from "./EvidenceShape";

export interface EvidenceLadderProps {
  /**
   * The rung reached at the current replay event.
   * Undefined: no rung is lit (a draft, or the ladder shown on its own).
   */
  readonly current?: EvidenceStatusId;
}

type RungState = "reached" | "current" | "ahead" | "none";

/**
 * Evidence_Ladder (Requirements 8.1, 8.2, 8.3, 8.6): five ordered rungs in an <ol>, lowest first, each with a
 * text label, a one-line definition and its own shape. Inconclusive is NOT a rung: it is rendered after the
 * list, outside the <ol>, as a separate dashed block. Status is carried by the words and the shapes, not by color.
 * With `current`, the reached rung is marked by the word "now", `aria-current` and a filled shape; rungs not
 * reached yet are drawn hollow.
 */
export function EvidenceLadder({ current }: EvidenceLadderProps = {}) {
  const currentRank = current ? EVIDENCE_BY_ID[current].rank : null;
  const stateOf = (rank: number): RungState => {
    if (current === undefined) return "none";
    if (currentRank === null || rank > currentRank) return "ahead";
    return rank === currentRank ? "current" : "reached";
  };
  return (
    <div className="evidence-ladder">
      <div className="ladder-scroll">
        <ol className="ladder" role="list" aria-label="Evidence Ladder, lowest rung first">
          {EVIDENCE_LADDER.map((status) => {
            const state = stateOf(status.rank ?? 0);
            return (
              <li
                key={status.id}
                className="ladder__rung"
                data-status={status.id}
                data-rank={status.rank ?? undefined}
                data-state={state}
                aria-current={state === "current" ? "step" : undefined}
              >
                <EvidenceShape shape={status.shape} size={40} hollow={state === "ahead"} className="ladder__shape" />
                <p className="ladder__status">
                  <span className="ladder__rank" aria-hidden="true">
                    0{status.rank}
                  </span>
                  {status.label}
                  {state === "current" ? (
                    <>
                      <span className="visually-hidden">, current rung</span>
                      <span className="ladder__now" aria-hidden="true">
                        now
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="ladder__def">{status.definition}</p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="ladder__inconclusive" data-status={INCONCLUSIVE.id} data-state={current === INCONCLUSIVE.id ? "current" : "none"}>
        <EvidenceShape shape={INCONCLUSIVE.shape} size={40} className="ladder__shape" />
        <p className="ladder__status">{INCONCLUSIVE.label}</p>
        <p className="ladder__def">{INCONCLUSIVE.definition}</p>
        <p className="ladder__aside">Not a rung. It sits outside the order.</p>
      </div>
    </div>
  );
}
