/**
 * Draft ids (design: Draft storage): "draft-" + base36 time + "-" + 4 random base36 chars.
 * The random part uses `crypto.getRandomValues` when present; ids only need to be unique in one browser.
 */
export const DRAFT_ID_PATTERN = /^draft-[0-9a-z]{1,12}-[0-9a-z]{4}$/;

function randomBase36(n: number): string {
  const out: string[] = [];
  const bytes = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (const b of bytes) out.push((b % 36).toString(36));
  return out.join("");
}

export function newDraftId(nowMs: number = Date.now(), random: (n: number) => string = randomBase36): string {
  const time = Math.max(0, Math.floor(nowMs)).toString(36);
  return `draft-${time}-${random(4)}`;
}

export const isDraftId = (v: unknown): v is string => typeof v === "string" && DRAFT_ID_PATTERN.test(v);

/** An ISO-8601 UTC date as written by `Date.prototype.toISOString`, and a real date. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && new Date(t).toISOString() === v;
}
