import type { VersionResult } from "../model";

/**
 * Version result shapes (design: Version_History_Strip; Requirement 25.2): fails = cross in a square,
 * passes = check in a hexagon, not run = dashed circle, inconclusive = dotted octagon with "?".
 * The result word is always printed next to it. Also the dashed draft page used for "Draft, not run".
 */
export const RESULT_WORDS: Readonly<Record<VersionResult, string>> = {
  fails: "fails",
  passes: "passes",
  "not-run": "not run",
  inconclusive: "inconclusive",
};

export const RESULT_SHAPES: Readonly<Record<VersionResult, string>> = {
  fails: "cross-square",
  passes: "check-hexagon",
  "not-run": "dashed-circle",
  inconclusive: "dotted-octagon-question",
};

export function ResultShape({ result, size = 20 }: { result: VersionResult; size?: number }) {
  return (
    <svg className="result-shape" data-shape={RESULT_SHAPES[result]} viewBox="0 0 24 24" width={size} height={size} focusable="false" aria-hidden="true">
      {result === "fails" ? (
        <>
          <rect x={3} y={3} width={18} height={18} fill="var(--brick-700)" stroke="var(--ink-900)" strokeWidth={1.8} />
          <path d="M8 8 L16 16 M16 8 L8 16" stroke="var(--paper-100)" strokeWidth={2.4} strokeLinecap="round" />
        </>
      ) : null}
      {result === "passes" ? (
        <>
          <path d="M12 2 L20.5 7 L20.5 17 L12 22 L3.5 17 L3.5 7 Z" fill="var(--sage-700)" stroke="var(--ink-900)" strokeWidth={1.8} strokeLinejoin="round" />
          <path d="M7.5 12.2 L10.6 15.4 L16.6 8.8" stroke="var(--paper-100)" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {result === "not-run" ? (
        <circle cx={12} cy={12} r={8.5} fill="none" stroke="var(--ink-900)" strokeWidth={2} strokeDasharray="3.2 2.6" />
      ) : null}
      {result === "inconclusive" ? (
        <>
          <path d="M8.5 3 L15.5 3 L21 8.5 L21 15.5 L15.5 21 L8.5 21 L3 15.5 L3 8.5 Z" fill="none" stroke="var(--ink-900)" strokeWidth={2} strokeDasharray="0.4 3" strokeLinecap="round" />
          <path d="M9.4 9.6 C9.4 6.4 14.6 6.4 14.6 9.6 C14.6 12 12 12 12 14.4" stroke="var(--ink-900)" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <circle cx={12} cy={17.4} r={1.1} fill="var(--ink-900)" />
        </>
      ) : null}
    </svg>
  );
}

/** The dashed draft page: a page with a folded corner, drawn dashed, for "Draft, not run". */
export function DraftShape({ size = 24 }: { size?: number }) {
  return (
    <svg className="result-shape" data-shape="dashed-page" viewBox="0 0 24 24" width={size} height={size} focusable="false" aria-hidden="true">
      <path d="M5 2.5 L15 2.5 L19.5 7 L19.5 21.5 L5 21.5 Z" fill="none" stroke="var(--ink-900)" strokeWidth={1.8} strokeDasharray="3 2.2" strokeLinejoin="round" />
      <path d="M15 2.5 L15 7 L19.5 7" fill="none" stroke="var(--ink-900)" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}
