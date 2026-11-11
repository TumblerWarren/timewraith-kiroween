import { useCallback } from "react";
import { flushSync } from "react-dom";
import { useOptionalLiveAnnouncer, type LiveAnnouncerValue } from "../a11y/LiveAnnouncer";
import { DRAFT_CREATED } from "../content/copy";
import type { DraftInput } from "./form/validate";
import { visibleTitle } from "./model";
import { onCaseOpened, onDraftCreated, onSubmitBurst } from "./motionHooks";
import { useCaseStore } from "./store";

/**
 * Case actions with their page side effects (Requirements 20.1, 20.8, 20.10, 21.4, 5.5, 10.8):
 * announcements through the polite live region, focus, scrolling (`behavior: "auto"` in Reduce Motion) and the
 * animation hook points. None of them changes the URL or touches the network.
 */
export const CASE_VIEW_ID = "case";
export const CASE_VIEW_HEADING_ID = "case-title";

export const caseOpenedText = (title: string) => `Case opened: ${title}`;

/** Selector of a case's library card (the `data-case-id` hook on its `<li>`). */
export const cardSelector = (id: string) => `[data-case-id="${id.replace(/[^a-z0-9-]/gi, "")}"] .case-card`;

const NO_ANNOUNCER: LiveAnnouncerValue = { announce: () => undefined };

/** The page's announcer, or a silent one when rendered outside `<LiveAnnouncer>` (isolated tests). */
function useOptionalAnnouncer(): LiveAnnouncerValue {
  return useOptionalLiveAnnouncer() ?? NO_ANNOUNCER;
}

function reduceMotion(doc: Document): boolean {
  return doc.documentElement.getAttribute("data-reduce-motion") === "true";
}

export type SubmitOutcome = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: "limit" };

export function useCaseActions() {
  const store = useCaseStore();
  const { announce } = useOptionalAnnouncer();
  const { createDraft, select, removeDraft } = store;

  /** Select a case, swap the Case view at once, focus its heading, scroll to it and announce it. */
  const openCase = useCallback(
    (id: string, card: HTMLElement | null = null) => {
      const ok = flushSync(() => select(id));
      if (!ok) return false;
      const doc = card?.ownerDocument ?? document;
      const view = doc.getElementById(CASE_VIEW_ID);
      view?.scrollIntoView?.({ behavior: reduceMotion(doc) ? "auto" : "smooth", block: "start" });
      doc.getElementById(CASE_VIEW_HEADING_ID)?.focus({ preventScroll: true });
      const opened = store.cases.find((c) => c.id === id);
      if (opened) announce(caseOpenedText(visibleTitle(opened)));
      onCaseOpened(card);
      return true;
    },
    [announce, select, store.cases],
  );

  /** Create a draft from a valid form, announce it, then scroll its new card into view and focus it. */
  const submitDraft = useCallback(
    (input: DraftInput, button: HTMLElement | null): SubmitOutcome => {
      const result = flushSync(() => createDraft(input));
      if (!result.ok) return result;
      onSubmitBurst(button);
      announce(DRAFT_CREATED);
      const doc = button?.ownerDocument ?? document;
      const card = doc.querySelector<HTMLElement>(cardSelector(result.draft.id));
      if (card) {
        card.scrollIntoView?.({ behavior: reduceMotion(doc) ? "auto" : "smooth", block: "center" });
        card.focus({ preventScroll: true });
      }
      onDraftCreated(card);
      return { ok: true, id: result.draft.id };
    },
    [announce, createDraft],
  );

  /** Remove a draft; when it was the open case, FullCalendar #7998 is selected again (by the store). */
  const removeDraftCase = useCallback(
    (id: string) => {
      flushSync(() => removeDraft(id));
    },
    [removeDraft],
  );

  return { openCase, submitDraft, removeDraft: removeDraftCase, store };
}
