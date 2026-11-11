import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { stampTilt } from "../components/tilt";
import { EVIDENCE_BY_ID } from "../content/evidence";
import { REPLAY_PAUSE_LABEL, REPLAY_PLAY_LABEL, REPLAY_PLAY_NOTE } from "../content/caseView";
import { REPLAY_NEXT_LABEL, REPLAY_PREV_LABEL, REPLAY_SCRUBBER_LABEL } from "../content/sections";
import type { ReplayEvent } from "../data/types";
import { Mascot } from "../mascots/Mascot";
import { formatOffset } from "./format";
import { indexToFraction, keyAction, NEXT_ACTION, PREV_ACTION, type ReplayAction } from "./replayMachine";

/** The scrubber thread: a hand-inked line the Spider Weaver spins. Stretches to the track; stroke stays 3px. */
const THREAD = "M0 50 C9 45 18 55 28 50 S47 46 58 51 S84 55 100 49";
/** An ink crack struck across the thread at the first anomaly (36 x 48 box, centered on the peg). */
const CRACK = "M20 2 L15 15 L22 21 L12 32 L18 37 L10 46 M15 15 L6 12 M22 21 L31 25 M12 32 L4 33";

/** Inner padding of the track (half a large peg), shared by the pegs, the chips, the Spider and the pointer math. */
export const TRACK_PAD_PX = 12;

export type ActionSource = "pointer" | "key" | "button";

function Arrow({ dir }: { readonly dir: "prev" | "next" }) {
  return (
    <svg className="scrubber__arrow" viewBox="0 0 24 24" width={20} height={20} focusable="false" aria-hidden="true">
      <path
        d={dir === "prev" ? "M15.5 4.5 L7.5 12.3 L15.8 19.7" : "M8.5 4.5 L16.5 12.3 L8.2 19.7"}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayGlyph({ playing }: { readonly playing: boolean }) {
  return (
    <svg className="scrubber__arrow" viewBox="0 0 24 24" width={20} height={20} focusable="false" aria-hidden="true">
      {playing ? (
        <path d="M8 5 L8.4 19 M15.6 5 L16 19" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" />
      ) : (
        <path d="M7.5 4.8 L18.6 12.2 L7.8 19.4 Z" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** Left position of a point at fraction `f` of the track, in CSS, with the shared inner padding. */
export const trackLeft = (f: number) => `calc(${TRACK_PAD_PX}px + ${f} * (100% - ${2 * TRACK_PAD_PX}px))`;

export interface EventTrackProps {
  readonly events: readonly ReplayEvent[];
  readonly index: number;
  /** Index of the first observed anomaly (-1 for none). Its crack is drawn once the replay has reached it. */
  readonly anomalyAt: number;
}

/**
 * Event track: Spider Weaver on her silk above the current peg, the inked thread, and one peg per event at
 * equal spacing (event-index space). The current peg is filled, larger and ringed (shape, not color). The first
 * anomaly carries a printed tag; its ink crack appears once the replay has reached it.
 */
export function EventTrack({ events, index, anomalyAt }: EventTrackProps) {
  const total = events.length;
  return (
    <div className="scrubber__track" data-track="events">
      <div className="scrubber__spider" data-spider="">
        <Mascot id="spider-weaver" width={64} />
        <span className="scrubber__silk" aria-hidden="true" />
      </div>
      <svg className="scrubber__thread" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false" aria-hidden="true">
        <path d={THREAD} />
      </svg>
      <ol className="scrubber__pegs" role="list" aria-label={REPLAY_SCRUBBER_LABEL}>
        {events.map((event, i) => (
          <li
            key={event.id}
            className="scrubber__peg"
            data-event={event.id}
            data-anomaly={i === anomalyAt ? "first" : undefined}
            aria-current={i === index ? "step" : undefined}
            style={{ left: trackLeft(indexToFraction(i, total)) }}
          >
            {i === anomalyAt ? (
              <span className="scrubber__peg-tag stamp" style={stampTilt(`replay-peg-tag-${event.id}`, 3.5)} aria-hidden="true">
                first anomaly
              </span>
            ) : null}
            {i === anomalyAt && index >= anomalyAt ? (
              <svg className="scrubber__crack" viewBox="0 0 36 48" focusable="false" aria-hidden="true" data-crack="">
                <path d={CRACK} />
              </svg>
            ) : null}
            <span className="visually-hidden">
              Event {i + 1}: {EVIDENCE_BY_ID[event.status].label}
              {i === anomalyAt ? ", first anomaly" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface ScrubberProps {
  readonly events: readonly ReplayEvent[];
  readonly index: number;
  readonly playing: boolean;
  readonly valueText: string;
  readonly onAction: (action: ReplayAction, source: ActionSource) => void;
  /** True while a pointer drag is in progress (the live region waits for the drag to rest). */
  readonly onDragChange?: (dragging: boolean) => void;
  /** The tracks inside the slider: the event track and the version and clock track. */
  readonly children: ReactNode;
}

/**
 * One scrubber over both tracks (Requirements 7.5 to 7.8, 7.13, 22.5). The slider (`role="slider"`) covers the
 * event track and the version and clock track, so one thumb, one keyboard mapping and one pointer path move both.
 * Pointer: click or drag anywhere on the tracks (index from the pointer fraction). Keys: Arrow keys, Home, End.
 * Previous and Next dispatch the arrow keys' actions. Play is optional and only ever started by the visitor.
 * The root carries `data-scrubber`, which the director's focus handling uses to suppress ambient effects.
 */
export function Scrubber({ events, index, playing, valueText, onAction, onDragChange, children }: ScrubberProps) {
  const total = events.length;
  const first = events[0];
  const last = events[total - 1];
  const dragging = useRef(false);
  const at = indexToFraction(index, total);

  const fractionAt = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    const inner = r.width - 2 * TRACK_PAD_PX;
    return inner > 0 ? (clientX - r.left - TRACK_PAD_PX) / inner : 0;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    dragging.current = true;
    onDragChange?.(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Older engines: the drag still works while the pointer stays on the track.
    }
    el.focus({ preventScroll: true });
    onAction({ type: "fraction", f: fractionAt(el, e.clientX) }, "pointer");
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onAction({ type: "fraction", f: fractionAt(e.currentTarget, e.clientX) }, "pointer");
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onDragChange?.(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const action = keyAction(e.key);
    if (!action) return;
    e.preventDefault();
    onAction(action, "key");
  };

  return (
    <div className="scrubber" data-scrubber="" style={{ "--at": String(at) } as CSSProperties}>
      <div
        className="scrubber__slider"
        role="slider"
        tabIndex={0}
        aria-label={REPLAY_SCRUBBER_LABEL}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, total - 1)}
        aria-valuenow={index}
        aria-valuetext={valueText}
        aria-orientation="horizontal"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className="scrubber__thumb" aria-hidden="true" />
        <div className="scrubber__tracks" aria-hidden="true">
          {children}
        </div>
      </div>

      <div className="scrubber__ticks mono" aria-hidden="true">
        <span>{first ? formatOffset(first.tOffsetMs) : ""}</span>
        <span>{last ? formatOffset(last.tOffsetMs) : ""}</span>
      </div>

      <div className="scrubber__controls">
        <button type="button" className="scrubber__btn" data-replay-control="prev" onClick={() => onAction(PREV_ACTION, "button")}>
          <Arrow dir="prev" />
          {REPLAY_PREV_LABEL}
        </button>
        <p className="scrubber__readout" aria-hidden="true">
          {index + 1} / {total}
        </p>
        <button
          type="button"
          className="scrubber__btn scrubber__btn--play"
          data-replay-control="play"
          title={REPLAY_PLAY_NOTE}
          onClick={() => onAction(playing ? { type: "pause" } : { type: "play" }, "button")}
        >
          <PlayGlyph playing={playing} />
          {playing ? REPLAY_PAUSE_LABEL : REPLAY_PLAY_LABEL}
        </button>
        <button type="button" className="scrubber__btn" data-replay-control="next" onClick={() => onAction(NEXT_ACTION, "button")}>
          {REPLAY_NEXT_LABEL}
          <Arrow dir="next" />
        </button>
      </div>
    </div>
  );
}
