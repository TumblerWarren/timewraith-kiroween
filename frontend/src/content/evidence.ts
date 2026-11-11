/**
 * Evidence_Ladder (Requirements 8.1, 8.2, 8.3, 8.6).
 * Five ordered rungs plus Inconclusive, which sits outside the order.
 * Every status has a text label and a unique shape id, so it is never color-only.
 */
export const EVIDENCE_LADDER_IDS = [
  "planned",
  "observed-anomaly",
  "reproduced",
  "known-issue-match",
  "fixed-version-verified",
] as const;
export type LadderStatusId = (typeof EVIDENCE_LADDER_IDS)[number];
export type EvidenceStatusId = LadderStatusId | "inconclusive";

export type EvidenceShapeId =
  | "dashed-circle"
  | "triangle"
  | "cracked-square"
  | "diamond"
  | "hexagon-check"
  | "dotted-octagon-question";

export interface EvidenceStatusDef {
  readonly id: EvidenceStatusId;
  readonly label: string;
  /** One-line definition (Requirement 8.3). */
  readonly definition: string;
  readonly shape: EvidenceShapeId;
  /** 1 to 5 on the ladder; null for Inconclusive. */
  readonly rank: number | null;
}

export const EVIDENCE_LADDER: readonly EvidenceStatusDef[] = [
  {
    id: "planned",
    label: "Planned",
    definition: "The Crew has written an experiment but has not run it yet.",
    shape: "dashed-circle",
    rank: 1,
  },
  {
    id: "observed-anomaly",
    label: "Observed anomaly",
    definition: "A run showed a result that differs from the expected one, once.",
    shape: "triangle",
    rank: 2,
  },
  {
    id: "reproduced",
    label: "Reproduced",
    definition: "The same anomaly appeared again in repeated runs under the same controlled conditions.",
    shape: "cracked-square",
    rank: 3,
  },
  {
    id: "known-issue-match",
    label: "Known-issue match",
    definition: "The reproduced behavior matches a publicly reported issue.",
    shape: "diamond",
    rank: 4,
  },
  {
    id: "fixed-version-verified",
    label: "Fixed-version verified",
    definition: "The anomaly is present in the affected version and absent in the fixed version.",
    shape: "hexagon-check",
    rank: 5,
  },
];

/** Shown separately from the ordered ladder (Requirement 8.2). */
export const INCONCLUSIVE: EvidenceStatusDef = {
  id: "inconclusive",
  label: "Inconclusive",
  definition: "The runs could not settle the question, so no claim is made either way.",
  shape: "dotted-octagon-question",
  rank: null,
};

export const EVIDENCE_STATUSES: readonly EvidenceStatusDef[] = [...EVIDENCE_LADDER, INCONCLUSIVE];

export const EVIDENCE_BY_ID: Readonly<Record<EvidenceStatusId, EvidenceStatusDef>> = Object.fromEntries(
  EVIDENCE_STATUSES.map((s) => [s.id, s]),
) as Record<EvidenceStatusId, EvidenceStatusDef>;

/**
 * Rank used to check that a stream never moves down the ladder.
 * Inconclusive is not on the ladder; it has no rank and is rejected from the sample stream.
 */
export function ladderRank(id: EvidenceStatusId): number | null {
  return EVIDENCE_BY_ID[id].rank;
}
