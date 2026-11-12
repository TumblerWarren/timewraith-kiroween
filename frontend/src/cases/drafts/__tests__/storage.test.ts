import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CASE_MODE_IDS } from "../../../content/modes";
import type { DraftCase } from "../../model";
import { isDraftId, newDraftId } from "../ids";
import { DRAFTS_KEY, loadDrafts, MAX_DRAFTS, saveDrafts, type StorageLike } from "../storage";

/**
 * Property 28: Draft storage round-trip.
 * Validates: Requirements 20.4, 20.5, 20.6, 20.7, 15.10
 */

/** A fake Storage whose setItem can be made to throw (quota full, private mode). Counts writes. */
class FakeStorage implements StorageLike {
  readonly map = new Map<string, string>();
  writes = 0;
  failWrites = false;
  failReads = false;
  getItem(key: string): string | null {
    if (this.failReads) throw new Error("SecurityError");
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    if (this.failWrites) throw new DOMException("QuotaExceededError", "QuotaExceededError");
    this.map.set(key, value);
  }
}

const seg = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,12}$/);
const repoTarget = fc.record({
  kind: fc.constant("repository" as const),
  repoUrl: fc.tuple(seg, seg).map(([o, r]) => `https://github.com/${o}/${r}`),
  version: fc.oneof(
    fc.stringMatching(/^[0-9a-f]{7,40}$/).map((value) => ({ kind: "commit" as const, value })),
    fc.stringMatching(/^v[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}$/).map((value) => ({ kind: "ref" as const, value })),
  ),
});

const draftArb: fc.Arbitrary<DraftCase> = fc
  .record({
    mode: fc.constantFrom(...CASE_MODE_IDS),
    target: repoTarget,
    area: fc.option(fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ,.:]{0,60}[A-Za-z0-9]$/), { nil: undefined }),
    time: fc.integer({ min: 1_600_000_000_000, max: 1_900_000_000_000 }),
    n: fc.integer({ min: 1, max: 99999 }),
    rand: fc.stringMatching(/^[0-9a-z]{4}$/),
  })
  .map(({ mode, target, area, time, n, rand }) => ({
    kind: "draft" as const,
    id: newDraftId(time, () => rand),
    createdAt: new Date(time).toISOString(),
    mode,
    target,
    saved: true,
    ...(area !== undefined ? { area } : {}),
    ...(mode !== "open-hunt" ? { issueUrl: `${target.repoUrl}/issues/${n}` } : {}),
  }));

const uniqueDrafts = fc.uniqueArray(draftArb, { maxLength: MAX_DRAFTS, selector: (d) => d.id });

describe("Property 28: Draft storage round-trip", () => {
  it("saveDrafts then loadDrafts returns the same drafts in the same order", () => {
    fc.assert(
      fc.property(uniqueDrafts, (drafts) => {
        const storage = new FakeStorage();
        expect(saveDrafts(storage, drafts)).toEqual({ ok: true });
        const stored = JSON.parse(storage.map.get(DRAFTS_KEY) as string);
        expect(stored.schemaVersion).toBe(1);
        expect(JSON.stringify(stored)).not.toContain('"saved"');
        expect(loadDrafts(storage)).toEqual({ drafts, skipped: 0 });
      }),
    );
  });

  it("never throws on any stored string, returns only valid drafts, and never writes", () => {
    const stored = fc.oneof(
      fc.string(),
      fc.string({ unit: "binary" }),
      fc.json(),
      fc.constantFrom("", "null", "[]", "{}", "{\"schemaVersion\":2,\"drafts\":[]}", "{\"schemaVersion\":1,\"drafts\":{}}", "{\"schemaVersion\":1}"),
      fc
        .tuple(fc.array(fc.oneof(draftArb.map((d) => ({ ...d }) as unknown), fc.anything(), fc.constant({ id: "draft-x-0000" })), { maxLength: 30 }), fc.constantFrom(1, 2, "1"))
        .map(([drafts, schemaVersion]) => JSON.stringify({ schemaVersion, drafts })),
    );
    fc.assert(
      fc.property(stored, (raw) => {
        const storage = new FakeStorage();
        storage.map.set(DRAFTS_KEY, raw);
        let result: ReturnType<typeof loadDrafts> | undefined;
        expect(() => {
          result = loadDrafts(storage);
        }).not.toThrow();
        expect(storage.writes).toBe(0);
        expect(storage.map.get(DRAFTS_KEY)).toBe(raw);
        const r = result as ReturnType<typeof loadDrafts>;
        expect(r.drafts.length).toBeLessThanOrEqual(MAX_DRAFTS);
        for (const d of r.drafts) {
          expect(d.kind).toBe("draft");
          expect(isDraftId(d.id)).toBe(true);
          expect(d.saved).toBe(true);
          if (d.mode === "open-hunt") expect(d).not.toHaveProperty("issueUrl");
        }
        expect(new Set(r.drafts.map((d) => d.id)).size).toBe(r.drafts.length);
      }),
    );
  });

  it("skips invalid entries mixed into a valid store and keeps the valid ones in order", () => {
    fc.assert(
      fc.property(uniqueDrafts, fc.array(fc.anything(), { maxLength: 5 }), (drafts, junk) => {
        const storage = new FakeStorage();
        saveDrafts(storage, drafts);
        const store = JSON.parse(storage.map.get(DRAFTS_KEY) as string);
        store.drafts = [...junk, ...store.drafts, { ...store.drafts[0], target: { kind: "local-app", appUrl: "http://evil.example" } }];
        storage.map.set(DRAFTS_KEY, JSON.stringify(store));
        const r = loadDrafts(storage);
        expect(r.drafts).toEqual(drafts);
        expect(r.skipped).toBe(junk.length + 1);
      }),
    );
  });

  it("returns ok: false without throwing when setItem throws, or when storage is unavailable", () => {
    fc.assert(
      fc.property(uniqueDrafts, (drafts) => {
        const storage = new FakeStorage();
        storage.failWrites = true;
        expect(saveDrafts(storage, drafts)).toEqual({ ok: false });
        expect(saveDrafts(null, drafts)).toEqual({ ok: false });
      }),
    );
    const blocked = new FakeStorage();
    blocked.failReads = true;
    expect(loadDrafts(blocked)).toEqual({ drafts: [], skipped: 0 });
    expect(loadDrafts(null)).toEqual({ drafts: [], skipped: 0 });
  });

  it("writes at most 20 drafts", () => {
    const storage = new FakeStorage();
    const many = fc.sample(draftArb, 40).map((d, i) => ({ ...d, id: newDraftId(1_700_000_000_000 + i, () => "abcd") }));
    saveDrafts(storage, many);
    expect(JSON.parse(storage.map.get(DRAFTS_KEY) as string).drafts).toHaveLength(MAX_DRAFTS);
  });
});
