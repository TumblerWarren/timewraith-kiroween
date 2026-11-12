import type { Case, DraftCase, LiveCase } from "./model";

/** Drafts newest first (by `createdAt`, then by their current order), without changing the input. */
export function newestFirst(drafts: readonly DraftCase[]): DraftCase[] {
  return drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.createdAt === b.d.createdAt ? a.i - b.i : a.d.createdAt < b.d.createdAt ? 1 : -1))
    .map(({ d }) => d);
}

/** The Case_Library order: real investigations (newest first, as the backend lists them), then drafts newest first. */
export function buildCatalog(drafts: readonly DraftCase[], live: readonly LiveCase[] = []): Case[] {
  return [...live, ...newestFirst(drafts)];
}
