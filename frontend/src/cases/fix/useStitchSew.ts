import { useEffect, useRef, useState, type RefObject } from "react";
import { useDirectorHost } from "../../animation/react/directorHost";

/** Share of the fix sheet that must be on screen before Doctor Stitch starts sewing. */
const SEW_THRESHOLD = 0.35;

export type SewState = "pending" | "done";

function positionsIn(container: Element, els: readonly Element[]): number[] {
  const box = container.getBoundingClientRect();
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    return box.height > 0 ? (r.top + r.height / 2 - box.top) / box.height : 0;
  });
}

/**
 * Hook point of `stitch.sew` (tasks 9.5, 14.5). Requested once per case selection (the fix sheet remounts per
 * case), when the sheet is at least 35% in view. While the request is pending, added lines wait behind CSS
 * (`[data-sew="pending"]`, motion on only); the effect's run, settle or Reduce Motion fallback writes them visible.
 * If the director drops the request, or there is no director, the state turns "done" and CSS shows them at once.
 */
export function useStitchSew(caseId: string, sheetRef: RefObject<HTMLElement | null>, diffsRef: RefObject<HTMLElement | null>): SewState {
  const host = useDirectorHost();
  const [state, setState] = useState<SewState>(host ? "pending" : "done");
  const requested = useRef(false);

  useEffect(() => {
    const sheet = sheetRef.current;
    // No observer (jsdom): nothing to wait for. Every supported browser has one.
    if (!host || !sheet || typeof IntersectionObserver === "undefined") return;
    const enough = (e: IntersectionObserverEntry) =>
      e.isIntersecting && (e.intersectionRatio >= SEW_THRESHOLD || e.intersectionRect.height >= window.innerHeight * 0.5);
    const io = new IntersectionObserver(
      (entries) => {
        if (requested.current || !entries.some(enough)) return;
        requested.current = true;
        io.disconnect();
        const diffs = diffsRef.current ?? sheet;
        const lines = Array.from(diffs.querySelectorAll("[data-sew-line]"));
        const strikes = Array.from(diffs.querySelectorAll(".diff__strike"));
        const needle = sheet.querySelector(".fix-needle");
        const travel = Math.max(0, diffs.getBoundingClientRect().height - (needle?.getBoundingClientRect().height ?? 0));
        const result = host.request("stitch.sew", {
          caseId,
          needle,
          travelPx: travel,
          thread: sheet.querySelector(".fix-diffs__thread"),
          lines,
          lineAt: positionsIn(diffs, lines),
          strikes,
          strikeAt: positionsIn(diffs, strikes),
          actors: [{ actor: "case:doctor-stitch", pose: "act" }],
        });
        if (result.status === "dropped") setState("done");
      },
      { threshold: [0, 0.1, 0.2, SEW_THRESHOLD, 0.5, 0.75] },
    );
    io.observe(sheet);
    return () => io.disconnect();
  }, [host, caseId, sheetRef, diffsRef]);

  return state;
}
