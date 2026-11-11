import { useEffect, useState, type SyntheticEvent } from "react";
import { useLiveAnnouncer } from "../a11y/LiveAnnouncer";
import { useReduceMotion, type ReduceMotionSource } from "../a11y/ReduceMotionProvider";
import { BAT_SIZE } from "../animation/constants";
import { useBatTravel } from "../animation/react/useBatFlights";
import { SECTION_NODES } from "../content/nodes";
import { Mascot } from "../mascots/Mascot";
import { GatewayBadge } from "./GatewayBadge";

export const REDUCE_MOTION_LABEL = "Reduce motion";
export const REDUCE_MOTION_ON_ANNOUNCEMENT = "Reduced motion on";
export const REDUCE_MOTION_OFF_ANNOUNCEMENT = "Reduced motion off";
export const WORDMARK = "TimeWraith";
export const BOARD_NAV_LABEL = "Board";
/** Below this width the clock-stamp nav collapses into the native <details> disclosure. */
export const COMPACT_QUERY = "(max-width: 767.98px)";

/** Visible state text of the Reduce_Motion_Toggle (Requirement 10.10). */
export function motionStateText(reduceMotion: boolean, source: ReduceMotionSource): string {
  if (!reduceMotion) return "Motion: on";
  return source === "system" ? "Motion: reduced (system setting)" : "Motion: reduced";
}

function isCompact(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COMPACT_QUERY).matches;
}

/** True while the viewport is below 768px; follows resizes. */
function useCompact(): boolean {
  const [compact, setCompact] = useState(isCompact);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return compact;
}

/**
 * App_Header (Requirements 1.7, 6.5, 10.1, 10.3, 10.10): the TimeWraith wordmark, the clock-stamp nav to the seven
 * regions, the Gateway_Status_Badge and the Reduce_Motion_Toggle. The nav links are plain `href="#id"` anchors, so
 * they work without script. From 768px the stamps sit in one row; below it the same list is inside a native
 * `<details>` labelled "Board" (open is forced on wide screens and the summary hidden by chrome.css). The badge and
 * the toggle stay visible at every width. The header sits at `var(--z-nav)`.
 */
export function AppHeader() {
  const { reduceMotion, source, toggle } = useReduceMotion();
  const { announce } = useLiveAnnouncer();
  const compact = useCompact();
  const [menuOpen, setMenuOpen] = useState(false);
  const travel = useBatTravel();

  const onToggle = () => {
    const next = toggle();
    announce(next ? REDUCE_MOTION_ON_ANNOUNCEMENT : REDUCE_MOTION_OFF_ANNOUNCEMENT);
  };

  const onDetailsToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (compact) setMenuOpen(event.currentTarget.open);
  };

  // Close the compact menu after a jump, so it does not cover the region the visitor asked for.
  // The click also sends the Mini Bat toward the region's Section_Node (it flutters at the perch when that node is
  // off screen, which is the usual case for a jump).
  const onNavClick = (id: string) => {
    if (compact) setMenuOpen(false);
    travel(document.querySelector(`.thread-node[data-node="${id}"] .thread-node__ring`));
  };

  const state = motionStateText(reduceMotion, source);

  return (
    <header className="site-header app-header theme-night">
      <div className="site-header__inner">
        {/* Decorative perch: the Mini Bat hangs upside down from the header's bottom edge. Outside the links,
            aria-hidden and pointer-events: none (chrome.css). */}
        <div className="site-header__perch" aria-hidden="true" data-perch="nav-bat">
          <Mascot id="mini-bat" decorative eager idle={false} width={compact ? BAT_SIZE.perch.compact : BAT_SIZE.perch.regular} />
        </div>

        <a className="app-header__wordmark" href="#open">
          {WORDMARK}
        </a>

        <nav className="site-nav" aria-label={BOARD_NAV_LABEL}>
          <details className="site-nav__menu" open={!compact || menuOpen} onToggle={onDetailsToggle}>
            <summary className="site-nav__summary">{BOARD_NAV_LABEL}</summary>
            <ol className="site-nav__list" role="list">
              {SECTION_NODES.map((node) => (
                <li key={node.id}>
                  <a className="site-nav__link" href={`#${node.id}`} onClick={() => onNavClick(node.id)}>
                    <span className="site-nav__title">{node.title}</span>{" "}
                    <span className="site-nav__stamp mono">{node.stamp}</span>
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>

        <GatewayBadge />

        {/* The accessible name starts with "Reduce motion"; the visible state text follows it and is part of the
            name, so what is seen is what is heard. aria-pressed carries the state as well. */}
        <button type="button" className="rm-toggle" aria-pressed={reduceMotion} onClick={onToggle} data-motion-source={source}>
          <svg className="rm-toggle__icon" viewBox="0 0 24 24" width={20} height={20} focusable="false" aria-hidden="true">
            <path d="M15.5 4.5 C19.5 6 21.5 9.5 21 13.5 C20.5 17.5 17 20.5 13 20.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
            <circle cx={11.5} cy={12} r={4.2} fill="none" stroke="currentColor" strokeWidth={2.2} />
            <path d="M2.5 9.5 L5.5 9.8 M2 13.5 L5 13.4 M3 17.2 L6.2 16.6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="rm-toggle__label visually-hidden">{REDUCE_MOTION_LABEL}</span>
          <span className="rm-toggle__state">{state}</span>
        </button>
      </div>
    </header>
  );
}
