import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "../api/ApiProvider";
import type { InvestigationSummary } from "../api/types";
import { buildCatalog } from "./catalog";
import { browserStorage, loadDrafts, MAX_DRAFTS, saveDrafts, type StorageLike } from "./drafts/storage";
import { newDraftId } from "./drafts/ids";
import type { DraftInput } from "./form/validate";
import { liveFromSummary, type Case, type DraftCase, type LiveCase } from "./model";

/**
 * Case store. Holds the visitor's drafts, the live investigations from the backend, and the selected case.
 *
 * - Drafts load once from `localStorage["tw.cases.v1"]` and persist after each change; at most 20.
 * - Live cases come from `GET /investigations` when the backend is online (refreshed every 15 s) and from
 *   `upsertLive` after the visitor starts or advances one.
 * - At most one case is selected. Nothing is selected on load or after the selected draft is removed.
 * - The URL never changes.
 */
export type CreateResult = { readonly ok: true; readonly draft: DraftCase } | { readonly ok: false; readonly reason: "limit" };

export interface CaseStoreValue {
  /** Live cases newest first, then drafts newest first. */
  readonly cases: readonly Case[];
  readonly drafts: readonly DraftCase[];
  readonly live: readonly LiveCase[];
  readonly awaitingFirstList: boolean;
  readonly selectedId: string | null;
  readonly selected: Case | null;
  readonly limitReached: boolean;
  readonly createDraft: (input: DraftInput) => CreateResult;
  readonly removeDraft: (id: string) => void;
  readonly removeLive: (id: string) => void;
  readonly upsertLive: (summary: InvestigationSummary, area?: string | null) => void;
  /** Returns false (and changes nothing) for an unknown id. */
  readonly select: (id: string) => boolean;
}

/** Exported so a test can hand a component a fixed case list. */
export const CaseStoreContext = createContext<CaseStoreValue | null>(null);

export interface CaseStoreProviderProps {
  readonly children: ReactNode;
  /** Defaults to `window.localStorage` (null when the browser refuses access). Tests pass a fake. */
  readonly storage?: StorageLike | null;
  /** Clock for draft ids and dates; tests pass a fixed one. */
  readonly now?: () => number;
}

const LIST_REFRESH_MS = 15_000;

export function CaseStoreProvider({ children, storage, now = Date.now }: CaseStoreProviderProps) {
  const { api } = useApi();
  const [store] = useState<StorageLike | null>(() => (storage === undefined ? browserStorage() : storage));
  const [drafts, setDrafts] = useState<readonly DraftCase[]>(() => loadDrafts(store).drafts);
  const [live, setLive] = useState<readonly LiveCase[]>([]);
  const [firstListSettled, setFirstListSettled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The latest drafts and live cases, so actions see the next list at once (outside a state updater).
  const draftsRef = useRef(drafts);
  const liveRef = useRef(live);
  // Areas typed by the visitor; the summary does not carry them.
  const areas = useRef(new Map<string, string>());
  const removedIds = useRef(new Set<string>());

  const commit = useCallback(
    (next: readonly DraftCase[], createdId?: string) => {
      const { ok } = saveDrafts(store, next);
      const marked = next.map((d) => {
        if (ok && !d.saved) return { ...d, saved: true };
        if (!ok && d.id === createdId) return { ...d, saved: false };
        return d;
      });
      draftsRef.current = marked;
      setDrafts(marked);
      return marked;
    },
    [store],
  );

  const setLiveList = useCallback((next: readonly LiveCase[]) => {
    liveRef.current = next;
    setLive(next);
  }, []);

  const upsertLive = useCallback(
    (summary: InvestigationSummary, area?: string | null) => {
      if (removedIds.current.has(summary.id)) return;
      if (area) areas.current.set(summary.id, area);
      const c = liveFromSummary(summary, areas.current.get(summary.id));
      const rest = liveRef.current.filter((x) => x.id !== c.id);
      setLiveList([c, ...rest].sort((a, b) => (a.summary.created_at < b.summary.created_at ? 1 : -1)));
    },
    [setLiveList],
  );

  // The list is asked for at once, without waiting for the slower health check; a failure leaves it as it was.
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const load = () =>
      api
        .list()
        .then((list) => alive && setLiveList(list.filter((s) => !removedIds.current.has(s.id)).map((s) => liveFromSummary(s, areas.current.get(s.id)))))
        .catch(() => undefined)
        .finally(() => { if (alive) setFirstListSettled(true); });
    void load();
    const timer = window.setInterval(load, LIST_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [api, setLiveList]);

  const createDraft = useCallback(
    (input: DraftInput): CreateResult => {
      const current = draftsRef.current;
      if (current.length >= MAX_DRAFTS) return { ok: false, reason: "limit" };
      const t = now();
      let id = newDraftId(t);
      while (current.some((d) => d.id === id)) id = newDraftId(t);
      const draft: DraftCase = { kind: "draft", id, createdAt: new Date(t).toISOString(), saved: true, ...input };
      const saved = commit([draft, ...current], id);
      return { ok: true, draft: saved[0] as DraftCase };
    },
    [commit, now],
  );

  const removeDraft = useCallback(
    (id: string) => {
      const current = draftsRef.current;
      if (!current.some((d) => d.id === id)) return;
      commit(current.filter((d) => d.id !== id));
      setSelectedId((sel) => (sel === id ? null : sel));
    },
    [commit],
  );

  const cases = useMemo(() => buildCatalog(drafts, live), [drafts, live]);

  const removeLive = useCallback((id: string) => {
    removedIds.current.add(id);
    areas.current.delete(id);
    setLiveList(liveRef.current.filter((c) => c.id !== id));
    setSelectedId((selected) => selected === id ? null : selected);
  }, [setLiveList]);

  const select = useCallback((id: string) => {
    const known = draftsRef.current.some((d) => d.id === id) || liveRef.current.some((c) => c.id === id);
    if (known) setSelectedId(id);
    return known;
  }, []);

  const value = useMemo<CaseStoreValue>(() => {
    const selected = cases.find((c) => c.id === selectedId) ?? null;
    return {
      cases,
      drafts,
      live,
      awaitingFirstList: !!api && !firstListSettled,
      selectedId: selected?.id ?? null,
      selected,
      limitReached: drafts.length >= MAX_DRAFTS,
      createDraft,
      removeDraft,
      removeLive,
      upsertLive,
      select,
    };
  }, [cases, drafts, live, api, firstListSettled, selectedId, createDraft, removeDraft, removeLive, upsertLive, select]);

  return <CaseStoreContext.Provider value={value}>{children}</CaseStoreContext.Provider>;
}

/**
 * Read-only stand-in for components rendered without the provider (isolated region tests): no cases, no
 * selection, and actions that do nothing. The app always mounts the provider in main.tsx.
 */
const STANDALONE: CaseStoreValue = {
  cases: [],
  drafts: [],
  live: [],
  awaitingFirstList: false,
  selectedId: null,
  selected: null,
  limitReached: false,
  createDraft: () => ({ ok: false, reason: "limit" }),
  removeDraft: () => undefined,
  removeLive: () => undefined,
  upsertLive: () => undefined,
  select: () => false,
};

export function useCaseStore(): CaseStoreValue {
  return useContext(CaseStoreContext) ?? STANDALONE;
}

/** True inside a CaseStoreProvider. */
export function useHasCaseStore(): boolean {
  return useContext(CaseStoreContext) !== null;
}
