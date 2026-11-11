import { SAMPLE_CASES } from "../data/cases";
import type { Case, DraftCase } from "./model";

/** Drafts newest first (by `createdAt`, then by their current order), without changing the input. */
export function newestFirst(drafts: readonly DraftCase[]): DraftCase[] {
  return drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.createdAt === b.d.createdAt ? a.i - b.i : a.d.createdAt < b.d.createdAt ? 1 : -1))
    .map(({ d }) => d);
}

/** The Case_Library order (Requirement 21.1, 20.5): the two samples in their fixed order, then drafts newest first. */
export function buildCatalog(drafts: readonly DraftCase[]): Case[] {
  return [...SAMPLE_CASES, ...newestFirst(drafts)];
}
