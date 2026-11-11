import { useId } from "react";
import { CHECKLIST_LABEL } from "../content/copy";
import { paperTilt } from "./tilt";
import { SETUP_CHECKS, SETUP_STATES } from "../data/setup-checklist";
import type { SetupCheck, SetupState } from "../data/types";

/**
 * Distinct inked shapes per state, so status is never color-only (Requirements 6.3, 11.10).
 * check = tick in a square, hourglass = two triangles, exclamation = mark in a triangle.
 */
function StatusShape({ shape }: { readonly shape: SetupState["shape"] }) {
  return (
    <svg
      className="hero__board-shape"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      focusable="false"
      aria-hidden="true"
      data-shape={shape}
    >
      {shape === "check" ? (
        <>
          <path d="M3.5 4 L20.5 3 L21 20.5 L3 21 Z" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
          <path d="M7 12.5 L10.5 16 L17.5 8" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {shape === "hourglass" ? (
        <path
          d="M5 3.5 L19 3 L12.5 12 L19.5 21 L4.5 20.5 L11.5 12 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      ) : null}
      {shape === "exclamation" ? (
        <>
          <path d="M12 3 L22 20.5 L2.5 21 Z" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
          <path d="M12 9.5 L12.3 14.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <circle cx={12.3} cy={17.8} r={1.4} fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}

/** The board's paper hangs from its tack with a seeded lean; only the paper turns (hero.css), the rows stay square. */
const BOARD_TILT = paperTilt("hero-notice-board", 1.4, 0);

export interface SetupChecklistProps {
  readonly checks?: readonly SetupCheck[];
}

/**
 * Setup_Checklist: a pinned paper notice board (paper-100, deckled edge and grain, no outline or shadow). The label "Demo mode,
 * simulated status" is the board's own heading, so it is in the same region at every width (Requirement 6.4).
 * Every status is simulated text plus a shape; none reads as a check that is running (Requirements 6.2, 16.4).
 */
export function SetupChecklist({ checks = SETUP_CHECKS }: SetupChecklistProps) {
  const titleId = useId();
  return (
    <section className="hero__board" aria-labelledby={titleId} data-testid="setup-checklist" style={BOARD_TILT}>
      <h2 id={titleId} className="hero__board-title">
        {CHECKLIST_LABEL}
      </h2>
      <ul className="hero__board-list" role="list">
        {checks.map((check) => {
          const state = SETUP_STATES[check.state];
          return (
            <li key={check.id} className="hero__board-row" data-state={state.id}>
              <span className="hero__board-item">{check.label}</span>
              <span className="hero__board-status">
                <StatusShape shape={state.shape} />
                <span>{state.text}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="hero__board-note">Sample statuses for this demo. No check runs on this page.</p>
    </section>
  );
}
