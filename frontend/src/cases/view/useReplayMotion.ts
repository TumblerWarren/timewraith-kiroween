import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { ActorPose } from "../../animation/effects/ids";
import { useDirectorHost } from "../../animation/react/directorHost";
import { EVIDENCE_BY_ID } from "../../content/evidence";
import type { ReplayEventKind } from "../../data/types";
import { eventActorId } from "../../replay/EventCard";
import { indexToFraction } from "../../replay/replayMachine";
import { TRACK_PAD_PX } from "../../replay/Scrubber";
import { anomalyIndexOf, revealIndexOf } from "../../replay/view";
import { fixedPassIndex } from "../fix/fixLabel";
import type { SampleCase } from "../model";
import { isHistoryKind, timelineView } from "./timeline";

/** The pose each kind of event plays on its actor (the figure on the sheet or the card thumbnail). */
const POSE_FOR_KIND: Readonly<Record<ReplayEventKind, string>> = {
  plan: "wave",
  dispatch: "bow",
  explore: "act",
  clock: "act",
  step: "act",
  observe: "look",
  repeat: "act",
  verify: "bow",
  note: "drop",
  reveal: "bow",
  fix: "wobble",
  compare: "turn",
};

const all = (root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel));

function centerOf(el: Element | undefined): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const onScreen = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x <= window.innerWidth && p.y <= window.innerHeight;

export interface ReplayMotionOptions {
  /** True while the visitor drags the scrubber (the Mini Bat stays put; the Spider follows). */
  readonly dragging: RefObject<boolean>;
}

/**
 * Hook points of the replay effects (tasks 9.2, 9.3, 14.3, 14.4). Requests go to the MotionDirector when the
 * current event changes; the state (index, marks, text, announcements) is already in the DOM and never waits.
 *
 * - `ladder.rung` when the event climbs to a higher rung (never on the way down);
 * - `replay.fixed-pass` on arrival at the passing fixed-version check, `replay.reveal` on arrival at the reveal,
 *   both keyed by case and event, so scrubbing back shows the earlier state without animation. These run in a
 *   layout effect, so the face-up card or the turned band never shows for a frame before the turn starts;
 * - `replay.event` for every other change (after mount, so a new thumbnail's actor is registered), skipped while
 *   a scene runs so a queue of stale events never plays late; and `bat.travel`, the Mini Bat flying from the
 *   previous peg to the new one, for steps that are not drags.
 * Nothing is requested on mount: there is no autoplay.
 */
export function useReplayMotion(rootRef: RefObject<HTMLElement | null>, c: SampleCase, index: number, opts: ReplayMotionOptions): void {
  const host = useDirectorHost();
  const prevLayout = useRef(index);
  const prevEffect = useRef(index);
  const crackDrawn = useRef(false);
  const total = c.stream.length;

  useLayoutEffect(() => {
    const from = prevLayout.current;
    if (from === index) return;
    prevLayout.current = index;
    const root = rootRef.current;
    if (!host || !root) return;
    const event = c.stream[index];
    const before = c.stream[from];
    if (!event || !before) return;

    if (index === revealIndexOf(c)) {
      host.request("replay.reveal", {
        caseId: c.id,
        eventId: event.id,
        card: root.querySelector(".reveal-card"),
        back: root.querySelector(".reveal-card__back"),
        front: root.querySelector(".reveal-card__front"),
        stamp: root.querySelector(".reveal-card__stamp"),
        actors: [{ actor: "case:raven-archivist", pose: "bow" }],
      });
    }

    const rank = EVIDENCE_BY_ID[event.status].rank ?? 0;
    const prevRank = EVIDENCE_BY_ID[before.status].rank ?? 0;
    if (rank > prevRank) {
      host.request("ladder.rung", {
        rung: rank,
        stamps: all(root, ".ladder-strip__now, .ladder__now"),
        shapes: all(root, '.ladder-strip__rung[aria-current="step"] .ladder-strip__shape, .ladder__rung[aria-current="step"] .ladder__shape'),
      });
    }

    // Version_Timeline: the latest replay milestone this move reaches (never when scrubbing back).
    if (index > from) {
      const reachedNow = timelineView(c, index).filter((v) => v.state === "reached" && !isHistoryKind(v.milestone) && v.eventIndex > from && v.eventIndex <= index);
      const last = reachedNow[reachedNow.length - 1];
      if (last) {
        const item = root.querySelector(`[data-milestone="${last.milestone.kind}"]`);
        host.request("timeline.milestone", {
          caseId: c.id,
          kind: last.milestone.kind,
          ring: item?.querySelector(".vtl__ring") ?? null,
          stamp: item?.querySelector(".vtl__state") ?? null,
          segment: item?.querySelector(".vtl__seg") ?? null,
        });
      }
    }

    if (index === fixedPassIndex(c)) {
      host.request("replay.fixed-pass", {
        caseId: c.id,
        eventId: event.id,
        band: root.querySelector('.vtrack__band[data-current="true"]'),
        stamp: root.querySelector("[data-check-stamp]"),
        jack: root.querySelector(".event-card__thumb"),
        actors: [{ actor: "case:two-faced-jack", pose: "turn" }],
      });
    }
  }, [host, rootRef, c, index]);

  useEffect(() => {
    const from = prevEffect.current;
    if (from === index) return;
    prevEffect.current = index;
    const root = rootRef.current;
    if (!host || !root) return;
    const event = c.stream[index];
    if (!event) return;

    // The reveal and the fixed pass are their own moments.
    if (index === revealIndexOf(c)) return;
    const snap = host.director().snapshot();
    const busy = snap.running.some((r) => r.kind === "scene") || snap.queued.some((q) => q.id === "replay.event");

    const slider = root.querySelector(".scrubber__slider");
    const width = slider ? slider.getBoundingClientRect().width - 2 * TRACK_PAD_PX : 0;
    const fromX = (indexToFraction(from, total) - indexToFraction(index, total)) * Math.max(0, width);

    const anomalyAt = anomalyIndexOf(c.stream);
    const firstCrack = !crackDrawn.current && anomalyAt >= 0 && from < anomalyAt && index >= anomalyAt;
    if (firstCrack) crackDrawn.current = true;

    if (!busy) {
      const actors: ActorPose[] = index === fixedPassIndex(c) ? [] : [{ actor: eventActorId(event.actor), pose: POSE_FOR_KIND[event.kind] }];
      host.request("replay.event", {
        eventId: `${c.id}:${event.id}`,
        card: root.querySelector(".event-card__live"),
        thumb: index === fixedPassIndex(c) ? null : root.querySelector(".event-card__thumb"),
        spider: root.querySelector("[data-spider]"),
        silk: root.querySelector(".scrubber__silk"),
        fromX,
        peg: root.querySelector('.scrubber__peg[aria-current="step"]'),
        chip: root.querySelector('.vtrack__chip[data-current="true"]'),
        crack: firstCrack ? root.querySelector("[data-crack]") : null,
        actors,
      });
    }

    if (!opts.dragging.current) {
      const pegs = all(root, ".scrubber__peg");
      const a = centerOf(pegs[from]);
      const b = centerOf(pegs[index]);
      if (a && b) host.request("bat.travel", { from: a, to: b, onScreen: onScreen(a) && onScreen(b) });
    }
  }, [host, rootRef, c, index, total, opts.dragging]);
}
