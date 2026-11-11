import { validate, valuesFromDraft } from "../form/validate";
import type { CaseMode, DraftCase, Target } from "../model";
import { isDraftId, isIsoDate } from "./ids";

/**
 * Draft storage (design: Draft storage, decision D20; Requirements 20.4 to 20.7).
 *
 * Drafts live only in `localStorage["tw.cases.v1"]` as `{ schemaVersion: 1, drafts }`, newest first, at most 20.
 * Nothing here touches the network. Every storage access is inside try/catch, because some browsers throw on
 * `localStorage` access in private mode or when the quota is full.
 *
 * `loadDrafts` never throws and never writes: a missing key, invalid JSON, a non-object, an unknown
 * `schemaVersion` or a non-array `drafts` gives no drafts; each entry is re-validated with the form's `validate()`
 * plus the id and date rules, and invalid or duplicate entries are skipped and counted. Data of an unknown schema
 * version stays in storage until the visitor creates or removes a draft, which replaces it with a v1 store.
 */
export const DRAFTS_KEY = "tw.cases.v1";
export const MAX_DRAFTS = 20;

export interface StoredDraft {
  readonly id: string;
  readonly createdAt: string;
  readonly mode: CaseMode;
  readonly target: Target;
  readonly area?: string;
  readonly issueUrl?: string;
}

export interface DraftStoreV1 {
  readonly schemaVersion: 1;
  readonly drafts: readonly StoredDraft[];
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** `window.localStorage`, or null when the browser refuses access. */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** One stored entry as a DraftCase, or null when it does not pass the form's rules. */
export function parseStoredDraft(entry: unknown): DraftCase | null {
  try {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    if (!isDraftId(e.id) || !isIsoDate(e.createdAt)) return null;
    const result = validate(valuesFromDraft(e));
    if (!result.ok) return null;
    return { kind: "draft", id: e.id, createdAt: e.createdAt, saved: true, ...result.draft };
  } catch {
    return null;
  }
}

export function loadDrafts(storage: StorageLike | null): { drafts: DraftCase[]; skipped: number } {
  let raw: string | null;
  try {
    raw = storage ? storage.getItem(DRAFTS_KEY) : null;
  } catch {
    return { drafts: [], skipped: 0 };
  }
  if (raw === null) return { drafts: [], skipped: 0 };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { drafts: [], skipped: 0 };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return { drafts: [], skipped: 0 };
  const store = data as { schemaVersion?: unknown; drafts?: unknown };
  if (store.schemaVersion !== 1 || !Array.isArray(store.drafts)) return { drafts: [], skipped: 0 };

  const drafts: DraftCase[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const entry of store.drafts as unknown[]) {
    const draft = parseStoredDraft(entry);
    if (draft === null || seen.has(draft.id) || drafts.length >= MAX_DRAFTS) {
      skipped++;
      continue;
    }
    seen.add(draft.id);
    drafts.push(draft);
  }
  return { drafts, skipped };
}

export function toStored(d: DraftCase): StoredDraft {
  return {
    id: d.id,
    createdAt: d.createdAt,
    mode: d.mode,
    target: d.target,
    ...(d.area !== undefined ? { area: d.area } : {}),
    ...(d.issueUrl !== undefined ? { issueUrl: d.issueUrl } : {}),
  };
}

/** Writes the drafts (at most 20) as a v1 store. Returns `ok: false` instead of throwing. */
export function saveDrafts(storage: StorageLike | null, drafts: readonly DraftCase[]): { ok: boolean } {
  if (!storage) return { ok: false };
  try {
    const store: DraftStoreV1 = { schemaVersion: 1, drafts: drafts.slice(0, MAX_DRAFTS).map(toStored) };
    storage.setItem(DRAFTS_KEY, JSON.stringify(store));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
