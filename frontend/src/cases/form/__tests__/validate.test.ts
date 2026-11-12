import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CASE_MODE_IDS } from "../../../content/modes";
import { DEFAULT_VALUES, ERRORS, normalize, toCreateRequest, validate, validateField, visibleFields, type FieldId, type FormValues } from "../validate";

/**
 * Property 27: Open-a-case validation, with the backend's rules: a public GitHub repository pinned to a ref, and an
 * issue of that same repository.
 */

const owner = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9-]{0,18}$/);
const repoName = fc.stringMatching(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,18}$/).filter((s) => s !== "." && s !== ".." && !s.endsWith(".git"));
const repo = fc.tuple(owner, repoName);
const repoUrlOf = ([o, r]: [string, string], git = false, slash = false) => `https://github.com/${o}/${r}${git ? ".git" : ""}${slash ? "/" : ""}`;

const refPart = fc.stringMatching(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,20}$/);
const ref = fc
  .array(refPart, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("/"))
  .filter((r) => r.length <= 100 && !r.includes("..") && !r.endsWith(".") && !r.endsWith(".lock") && !/^[0-9a-f]{7,40}$/i.test(r));
const commit = fc.stringMatching(/^[0-9a-fA-F]{7,40}$/);
const version = fc.oneof(ref, commit);

const area = fc.string({ maxLength: 200 });
const mode = fc.constantFrom(...CASE_MODE_IDS);
const pad = fc.stringMatching(/^[ \t\n]{0,3}$/);

const validValues = fc
  .record({ repo, git: fc.boolean(), slash: fc.boolean(), version, area, mode, n: fc.integer({ min: 1, max: 9_999_999 }) })
  .map(({ repo: r, git, slash, version: v, area: a, mode: m, n }) => ({
    repoUrl: repoUrlOf(r, git, slash),
    version: v,
    area: a,
    mode: m,
    issueUrl: `https://github.com/${r[0]}/${r[1]}/issues/${n}`,
  }));

const anyValues = fc.record({
  repoUrl: fc.oneof(repo.map((r) => repoUrlOf(r)), fc.string()),
  version: fc.oneof(version, fc.string()),
  area: fc.string({ maxLength: 260 }),
  mode: fc.oneof(mode, fc.string()),
  issueUrl: fc.string(),
});

const errorKeys = (v: Partial<FormValues>) => {
  const r = validate(v);
  return r.ok ? [] : Object.keys(r.errors).sort();
};

const FIELDS: FieldId[] = ["repoUrl", "version", "area", "mode", "issueUrl"];

describe("Property 27: Open-a-case validation", () => {
  it("never throws, for any values (including non-strings, huge and odd strings)", () => {
    fc.assert(
      fc.property(fc.oneof(anyValues, fc.dictionary(fc.constantFrom(...FIELDS), fc.anything())), (v) => {
        expect(() => validate(v as Partial<FormValues>)).not.toThrow();
        for (const id of FIELDS) expect(() => validateField(id, v as Partial<FormValues>)).not.toThrow();
      }),
    );
    expect(validate(null).ok).toBe(false);
    expect(() => validate({ ...DEFAULT_VALUES, repoUrl: "https://".padEnd(100_000, "a") })).not.toThrow();
  });

  it("accepts valid values; the draft holds only visible fields; an Open hunt never carries an issue URL", () => {
    fc.assert(
      fc.property(validValues, (v) => {
        const r = validate(v);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const d = r.draft;
        expect(d.mode).toBe(v.mode);
        expect(d.target).toEqual({
          kind: "repository",
          repoUrl: v.repoUrl,
          version: { kind: /^[0-9a-f]{7,40}$/i.test(v.version) ? "commit" : "ref", value: v.version },
        });
        if (v.mode === "open-hunt") expect(d).not.toHaveProperty("issueUrl");
        else expect(d.issueUrl).toBe(v.issueUrl);
        if (d.area !== undefined) {
          expect(d.area.length).toBeLessThanOrEqual(200);
          // eslint-disable-next-line no-control-regex -- the stored area has no control characters
          expect(d.area).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
          expect(d.area).toBe(d.area.trim());
        }
        const req = toCreateRequest(d, true);
        expect(req).toMatchObject({ repository_url: v.repoUrl, ref: v.version, mode: v.mode, auto: true });
      }),
    );
  });

  it("gives the same result for trimmed and untrimmed values", () => {
    fc.assert(
      fc.property(anyValues, fc.array(pad, { minLength: 10, maxLength: 10 }), (v, p) => {
        const keys = Object.keys(v) as (keyof FormValues)[];
        const padded = Object.fromEntries(keys.map((k, i) => [k, `${p[i * 2]}${v[k]}${p[i * 2 + 1]}`])) as unknown as FormValues;
        const trimmed = Object.fromEntries(keys.map((k) => [k, v[k].trim()])) as unknown as FormValues;
        expect(validate(padded)).toEqual(validate(trimmed));
        expect(normalize(padded)).toEqual(normalize(trimmed));
      }),
    );
  });

  it("never reports errors for hidden fields", () => {
    fc.assert(
      fc.property(anyValues, (v) => {
        const r = validate(v);
        if (r.ok) return;
        const visible = visibleFields(v);
        for (const key of Object.keys(r.errors)) expect(visible).toContain(key);
      }),
    );
    const open = { ...DEFAULT_VALUES, repoUrl: "https://github.com/acme/app", version: "main", mode: "open-hunt", issueUrl: "javascript:alert(1)" };
    expect(validate(open)).toEqual({
      ok: true,
      draft: { mode: "open-hunt", target: { kind: "repository", repoUrl: "https://github.com/acme/app", version: { kind: "ref", value: "main" } } },
    });
  });

  // Each mutation breaks exactly one field; the error is on that field only.
  const mutations: readonly [string, FieldId, fc.Arbitrary<(v: FormValues) => FormValues>][] = [
    ["repository credentials", "repoUrl", fc.constantFrom("user@", "user:secret@").map((c) => (v: FormValues) => ({ ...v, repoUrl: v.repoUrl.replace("https://", `https://${c}`) }))],
    ["repository query", "repoUrl", fc.constantFrom("?tab=readme", "?").map((q) => (v: FormValues) => ({ ...v, repoUrl: `${v.repoUrl}${q}` }))],
    ["repository fragment", "repoUrl", fc.constantFrom("#readme", "#").map((f) => (v: FormValues) => ({ ...v, repoUrl: `${v.repoUrl}${f}` }))],
    ["repository non-https scheme", "repoUrl", fc.constantFrom("http://", "ftp://", "git://", "").map((s) => (v: FormValues) => ({ ...v, repoUrl: v.repoUrl.replace("https://", s) }))],
    ["repository on another host", "repoUrl", fc.constantFrom("gitlab.com", "github.io", "example.com", "github.com.evil.io").map((h) => (v: FormValues) => ({ ...v, repoUrl: v.repoUrl.replace("github.com", h) }))],
    ["repository without a repo segment", "repoUrl", fc.constant((v: FormValues) => ({ ...v, repoUrl: "https://github.com/owner" }))],
    ["repository with an extra segment", "repoUrl", fc.constant((v: FormValues) => ({ ...v, repoUrl: `${v.repoUrl.replace(/\/$/, "")}/tree` }))],
    ["repository too long", "repoUrl", fc.constant((v: FormValues) => ({ ...v, repoUrl: `https://github.com/o/${"r".repeat(300)}` }))],
    ["invalid ref", "version", fc.constantFrom("a..b", "-main", "/main", "main/", "main.", "v1.lock", "has space", "a//b", "x@{1}", "x".repeat(101), "é").map((r) => (v: FormValues) => ({ ...v, version: r }))],
    ["empty version", "version", fc.constant((v: FormValues) => ({ ...v, version: "" }))],
    ["issue non-https", "issueUrl", fc.constant((v: FormValues) => ({ ...v, issueUrl: v.issueUrl.replace("https://", "http://") }))],
    ["issue credentials", "issueUrl", fc.constant((v: FormValues) => ({ ...v, issueUrl: v.issueUrl.replace("https://", "https://me:pw@") }))],
    ["issue without number", "issueUrl", fc.constantFrom("/issues", "/issues/abc", "/pull/12", "/issues/12/x").map((p) => (v: FormValues) => ({ ...v, issueUrl: v.issueUrl.replace(/\/issues\/\d+$/, p) }))],
    ["issue of another repository", "issueUrl", fc.constant((v: FormValues) => ({ ...v, issueUrl: v.issueUrl.replace("https://github.com/", "https://github.com/zz-other-owner-") }))],
    ["area too long", "area", fc.integer({ min: 201, max: 400 }).map((n) => (v: FormValues) => ({ ...v, area: "x".repeat(n) }))],
  ];

  for (const [name, field, mutate] of mutations) {
    it(`rejects ${name} with an error on ${field} only`, () => {
      fc.assert(
        fc.property(validValues.map((v) => ({ ...v, mode: field === "issueUrl" ? "known-issue" : v.mode })), mutate, (v, m) => {
          expect(errorKeys(v)).toEqual([]);
          const mutated = m(v);
          // A broken repository URL cannot be compared with the issue, so only the repository field fails.
          expect(errorKeys(mutated)).toEqual([field]);
        }),
      );
    });
  }

  it("requires the fields of the chosen mode", () => {
    expect(errorKeys(DEFAULT_VALUES)).toEqual(["issueUrl", "repoUrl", "version"]);
    expect(errorKeys({ ...DEFAULT_VALUES, mode: "open-hunt" })).toEqual(["repoUrl", "version"]);
    expect(errorKeys({ ...DEFAULT_VALUES, mode: "psychic" })).toContain("mode");
  });

  it("writes errors as plain sentences", () => {
    for (const message of Object.values(ERRORS)) expect(message).toMatch(/^[A-Z].*\.$/);
  });
});
