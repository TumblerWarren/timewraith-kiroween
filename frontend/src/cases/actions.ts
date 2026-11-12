import { useCallback } from "react";
import { flushSync } from "react-dom";
import { useOptionalLiveAnnouncer, type LiveAnnouncerValue } from "../a11y/LiveAnnouncer";
import { useApi } from "../api/ApiProvider";
import { ApiError } from "../api/client";
import { caseHref, navigate } from "../app/router";
import { DRAFT_CREATED, LIVE_CASE_STARTED } from "../content/copy";
import { toCreateRequest, type DraftInput } from "./form/validate";
import { type DraftCase } from "./model";
import { useCaseStore } from "./store";

/**
 * Case actions. Starting a case or saving a draft announces it through the polite live region and opens the case
 * page (`#/cases/:id`). Only `startCase` and `runDraft` call the backend.
 */
const NO_ANNOUNCER: LiveAnnouncerValue = { announce: () => undefined };

export type SubmitOutcome = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: "limit" };

export function useCaseActions() {
  const store = useCaseStore();
  const { announce } = useOptionalLiveAnnouncer() ?? NO_ANNOUNCER;
  const { createDraft, removeDraft, upsertLive } = store;
  const { api } = useApi();

  /** Save a draft from a valid form and open it. */
  const submitDraft = useCallback(
    (input: DraftInput): SubmitOutcome => {
      const result = flushSync(() => createDraft(input));
      if (!result.ok) return result;
      announce(DRAFT_CREATED);
      navigate(caseHref(result.draft.id));
      return { ok: true, id: result.draft.id };
    },
    [announce, createDraft],
  );

  const removeDraftCase = useCallback(
    (id: string) => {
      flushSync(() => removeDraft(id));
    },
    [removeDraft],
  );

  /** Start a real investigation on the backend and open it. Throws ApiError on failure. */
  const startCase = useCallback(
    async (input: DraftInput, auto: boolean): Promise<string> => {
      if (!api) throw new ApiError("offline", "The TimeWraith backend is not reachable.");
      const summary = await api.create(toCreateRequest(input, auto));
      flushSync(() => upsertLive(summary, input.area));
      announce(LIVE_CASE_STARTED);
      navigate(caseHref(summary.id));
      return summary.id;
    },
    [announce, api, upsertLive],
  );

  /** Send a stored draft to the backend; on success the draft is removed and the live case opens. */
  const runDraft = useCallback(
    async (draft: DraftCase, auto: boolean): Promise<string> => {
      const id = await startCase(draft, auto);
      flushSync(() => removeDraft(draft.id));
      return id;
    },
    [removeDraft, startCase],
  );

  return { submitDraft, removeDraft: removeDraftCase, startCase, runDraft, store };
}
