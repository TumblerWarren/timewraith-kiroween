import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { INITIAL_REPLAY_STATE, PLAY_STEP_MS, reduceReplay, type ReplayAction, type ReplayState } from "../../replay/replayMachine";
import type { ActionSource } from "../../replay/Scrubber";
import { revealIndexOf } from "../../replay/view";
import type { SampleCase } from "../model";
import { revealOutcomeText } from "./RevealPanel";

/** While dragging, the live region waits this long after the last movement (design: 150 ms). */
export const LIVE_DEBOUNCE_MS = 150;

/** What the polite live region says for event `i`: its text, plus the outcome at a Blind hunt's reveal. */
export function liveTextFor(c: SampleCase, i: number): string {
  const event = c.stream[i];
  if (!event) return "";
  if (i !== revealIndexOf(c)) return event.text;
  const outcome = revealOutcomeText(c);
  return event.text.includes(outcome) ? event.text : `${event.text} ${outcome}.`;
}

export interface ReplayController {
  readonly state: ReplayState;
  readonly liveText: string;
  readonly apply: (action: ReplayAction, source: ActionSource | "play") => void;
  readonly dragging: RefObject<boolean>;
  readonly setDragging: (dragging: boolean) => void;
}

/**
 * Replay state for one case. The Case view remounts per case, so every selection starts at event 0
 * (Requirement 22.9). Every index change sets the live region text to the new event's text at once, or after
 * 150 ms without movement while a drag is in progress (Requirement 7.12). Nothing is announced on mount. Play
 * is optional and user-started: it steps every 1400 ms and stops at the last event.
 */
export function useReplay(c: SampleCase): ReplayController {
  const total = c.stream.length;
  const [state, setState] = useState<ReplayState>(INITIAL_REPLAY_STATE);
  const [liveText, setLiveText] = useState("");
  const current = useRef<ReplayState>(INITIAL_REPLAY_STATE);
  const dragging = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const apply = useCallback(
    (action: ReplayAction) => {
      const prev = current.current;
      const next = reduceReplay(prev, action, total);
      if (next.index === prev.index && next.playing === prev.playing) return;
      current.current = next;
      setState(next);
      if (next.index === prev.index) return;
      const text = liveTextFor(c, next.index);
      window.clearTimeout(timer.current);
      if (dragging.current) timer.current = window.setTimeout(() => setLiveText(text), LIVE_DEBOUNCE_MS);
      else setLiveText(text);
    },
    [c, total],
  );

  const setDragging = useCallback((d: boolean) => {
    dragging.current = d;
  }, []);

  useEffect(() => {
    if (!state.playing) return;
    const id = window.setInterval(() => apply({ type: "tick" }), PLAY_STEP_MS);
    return () => window.clearInterval(id);
  }, [state.playing, apply]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { state, liveText, apply, dragging, setDragging };
}
