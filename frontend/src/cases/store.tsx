import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_CASE_ID, SAMPLE_CASES } from "../data/cases";
import { buildCatalog } from "./catalog";
import { browserStorage, loadDrafts, MAX_DRAFTS, saveDrafts, type StorageLike } from "./drafts/storage";
import { newDraftId } from "./drafts/ids";
import type { DraftInput } from "./form/validate";
import type { Case, DraftCase } from "./model";

/**
 * Case store (Requirements 20.4 to 20.9, 21.1, 21.5, 21.6). Holds the visitor's drafts and the selected case.
 *
 * - Drafts load once from `localStorage["tw.cases.v1"]` (reads never write) and persist after each change.
 * - When storage fails, the new draft is kept for this visit with `saved: false` ("Not saved" on its card).
 * - At most 20 drafts: `createDraft` at the limit creates nothing and returns `{ ok: false, reason: "limit" }`.
 * - Exactly one case is selected; FullCalendar #7998 on load and again when the selected draft is removed.
 * - No network of any kind, and the URL never changes.
 *
 * DOM side effects (announcements, focus, scrolling, animation requests) live in `cases/actions.ts`, because the
 * live region is mounted inside App, below this provider.
 */
export type CreateResult = { readonly ok: true; readonly draft: DraftCase } | { readonly ok: false; readonly reason: "limit" };

export interface CaseStoreValue {
  /** Samples first, then drafts newest first. */
  readonly cases: readonly Case[];
  readonly drafts: readonly DraftCase[];
  readonly selectedId: string;
  readonly selected: Case;
  readonly limitReached: boolean;
  readonly createDraft: (input: DraftInput) => CreateResult;
  readonly removeDraft: (id: string) => void;
  /** Returns false (and changes nothing) for an unknown id. */
  readonly select: (id: string) => boolean;
}

const CaseStoreContext = createContext<CaseStoreValue | null>(null);

export interface CaseStoreProviderProps {
  readonly children: ReactNode;
  /** Defaults to `window.localStorage` (null when the browser refuses access). Tests pass a fake. */
  readonly storage?: StorageLike | null;
  /** Clock for draft ids and dates; tests pass a fixed one. */
  readonly now?: () => number;
}

const DEFAULT_SAMPLE = SAMPLE_CASES[0] as Case;

export function CaseStoreProvider({ children, storage, now = Date.now }: CaseStoreProviderProps) {
  // Chosen once per provider: the injected storage, else window.localStorage (null when access is refused).
  const [store] = useState<StorageLike | null>(() => (storage === undefined ? browserStorage() : storage));
  const [drafts, setDrafts] = useState<readonly DraftCase[]>(() => loadDrafts(store).drafts);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_CASE_ID);
  // The latest drafts, so actions compute the next list (and write storage) once, outside a state updater.
  // Only `commit` changes the drafts, and it updates this ref first.
  const draftsRef = useRef(drafts);

  const commit = useCallback((next: readonly DraftCase[], createdId?: string) => {
    const { ok } = saveDrafts(store, next);
    const marked = next.map((d) => {
      if (ok && !d.saved) return { ...d, saved: true };
      if (!ok && d.id === createdId) return { ...d, saved: false };
      return d;
    });
    draftsRef.current = marked;
    setDrafts(marked);
    return marked;
  }, [store]);

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
      setSelectedId((sel) => (sel === id ? DEFAULT_CASE_ID : sel));
    },
    [commit],
  );

  const cases = useMemo(() => buildCatalog(drafts), [drafts]);

  const select = useCallback((id: string) => {
    const known = SAMPLE_CASES.some((c) => c.id === id) || draftsRef.current.some((d) => d.id === id);
    if (known) setSelectedId(id);
    return known;
  }, []);

  const value = useMemo<CaseStoreValue>(() => {
    const selected = cases.find((c) => c.id === selectedId) ?? DEFAULT_SAMPLE;
    return {
      cases,
      drafts,
      selectedId: selected.id,
      selected,
      limitReached: drafts.length >= MAX_DRAFTS,
      createDraft,
      removeDraft,
      select,
    };
  }, [cases, drafts, selectedId, createDraft, removeDraft, select]);

  return <CaseStoreContext.Provider value={value}>{children}</CaseStoreContext.Provider>;
}

/**
 * Read-only stand-in for components rendered without the provider (isolated region tests): the samples, the
 * default selection, and actions that do nothing. The app always mounts the provider in main.tsx.
 */
const STANDALONE: CaseStoreValue = {
  cases: buildCatalog([]),
  drafts: [],
  selectedId: DEFAULT_CASE_ID,
  selected: DEFAULT_SAMPLE,
  limitReached: false,
  createDraft: () => ({ ok: false, reason: "limit" }),
  removeDraft: () => undefined,
  select: () => false,
};

export function useCaseStore(): CaseStoreValue {
  return useContext(CaseStoreContext) ?? STANDALONE;
}

/** True inside a CaseStoreProvider. */
export function useHasCaseStore(): boolean {
  return useContext(CaseStoreContext) !== null;
}
