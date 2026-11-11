import { useLayoutEffect } from "react";
import { setCaseMotionHooks } from "../../cases/motionHooks";
import { useDirectorHost, type DirectorHost } from "./directorHost";
import { useBatBurst } from "./useBatFlights";

/** Skeleton Scribe's hand on the library shelf (`sections/Library`). */
const LIBRARY_SCRIBE = "library:skeleton-scribe";

const present = <T,>(xs: readonly (T | null | undefined)[]): T[] => xs.filter((x): x is T => x !== null && x !== undefined);

/**
 * Wires the case UI's hook points (`cases/motionHooks.ts`) to the MotionDirector (tasks 12.5 and 14.2). Renders
 * nothing. Installed in a layout effect, so the hooks are in place before the library's mount effect reports its
 * cards. Every hook only requests; state, focus, scrolling and announcements have already happened.
 *
 * | Hook             | Request                                                                          |
 * |------------------|----------------------------------------------------------------------------------|
 * | onSubmitBurst    | `bats.burst` from the submit button's rectangle                                  |
 * | onDraftCreated   | `case.draft-create` (card, its "Draft, not run" underline, the Scribe writes)     |
 * | onCaseOpened     | `case.open` (the Case view's case-file sheet, the opened card's folder tab)       |
 * | onCardsEnter     | `cases.enter` once, when the card list first scrolls into view                   |
 * | onTextInputFocus | `setEnv({ suppressed: { input } })`                                               |
 */
export function CaseMotionHooks() {
  const host = useDirectorHost();
  const burst = useBatBurst();
  useLayoutEffect(() => {
    if (!host) return;
    let stopEnter: (() => void) | null = null;
    let stopDraft: (() => void) | null = null;
    const off = setCaseMotionHooks({
      onSubmitBurst: (el) => burst(el),
      onDraftCreated: (card) => {
        if (!card) return;
        const draftId = card.closest("[data-case-id]")?.getAttribute("data-case-id") ?? card.getAttribute("aria-labelledby") ?? "draft";
        const fire = () =>
          host.request("case.draft-create", {
            draftId,
            targets: present([card, card.querySelector("[data-draft-underline]")]),
            actors: [{ actor: LIBRARY_SCRIBE, pose: "write" }],
          });
        // The card is focused and smooth-scrolling into view; the drop-in waits until it is on screen (at most 1.2 s).
        stopDraft?.();
        stopDraft = whenOnScreen(card, fire, DRAFT_WAIT_MS);
      },
      onCaseOpened: (card) => {
        const doc = card?.ownerDocument ?? document;
        host.request("case.open", { targets: present([doc.querySelector("#case .case-file"), card?.querySelector(".case-card__tab")]) });
      },
      onCardsEnter: (els) => {
        stopEnter?.();
        stopEnter = dealWhenVisible(host, els);
      },
      onTextInputFocus: (focused) => host.setEnv({ suppressed: { input: focused } }),
    });
    return () => {
      off();
      stopEnter?.();
      stopDraft?.();
    };
  }, [host, burst]);
  return null;
}

const DRAFT_WAIT_MS = 1200;

/**
 * Runs `fn` once, when half of `el` is in the viewport or after `maxWaitMs`, whichever is first. Runs it at once
 * without IntersectionObserver (jsdom).
 */
function whenOnScreen(el: Element, fn: () => void, maxWaitMs: number): () => void {
  if (typeof IntersectionObserver === "undefined") {
    fn();
    return () => {};
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    io.disconnect();
    window.clearTimeout(timer);
    fn();
  };
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) go();
  }, { threshold: 0.5 });
  io.observe(el);
  const timer = window.setTimeout(go, maxWaitMs);
  return () => {
    done = true;
    io.disconnect();
    window.clearTimeout(timer);
  };
}

/** Requests `cases.enter` once, as soon as the card list starts to enter the viewport (latched per page). */
function dealWhenVisible(host: DirectorHost, els: readonly HTMLElement[]): () => void {
  const list = els[0]?.closest("[data-library]") ?? els[0];
  if (!list || typeof IntersectionObserver === "undefined") return () => {};
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (!host.claimOnce("library:cases.enter")) return;
    const cards = els.filter((el) => el.isConnected);
    if (cards.length > 0) host.request("cases.enter", { targets: cards });
  });
  io.observe(list);
  return () => io.disconnect();
}
