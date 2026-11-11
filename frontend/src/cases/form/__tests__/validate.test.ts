import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CASE_MODE_IDS } from "../../../content/modes";
import { DEFAULT_VALUES, ERRORS, normalize, validate, validateField, visibleFields, type FieldId, type FormValues } from "../validate";

/**
 * Property 27: Open-a-case validation.
 * Validates: Requirements 19.2, 19.3, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 19.11, 19.16, 15.10
 */

const seg = fc.stringMatching(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,18}$/).filter((s) => s !== "." && s !== ".." && !s.endsWith(".git"));
const host = fc.domain().filter((d) => d.length <= 60);
const repoUrl = fc
  .tuple(host, seg, seg, fc.boolean(), fc.boolean())
  .map(([h, o, r, git, slash]) => `https://${h}/${o}/${r}${git ? ".git" : ""}${slash ? "/" : ""}`);

const refPart = fc.stringMatching(/^[A-Za-z0-9_][A-Za-z0-9._-]{0,20}$/);
const ref = fc
  .array(refPart, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("/"))
  .filter((r) => r.length <= 100 && !r.includes("..") && !r.endsWith(".") && !r.endsWith(".lock") && !/^[0-9a-f]{7,40}$/i.test(r));
const commit = fc.stringMatching(/^[0-9a-fA-F]{7,40}$/);
const version = fc.oneof(ref, commit);

const loopbackHost = fc.oneof(
  fc.constantFrom("localhost", "127.0.0.1", "[::1]", "LOCALHOST"),
  fc.stringMatching(/^[a-z0-9]{1,12}$/).map((l) => `${l}.localhost`),
);
const port = fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined });
const appUrl = fc
  .tuple(fc.constantFrom("http", "https"), loopbackHost, port, fc.constantFrom("", "/", "/calendar", "/app?view=week"))
  .map(([s, h, p, path]) => `${s}://${h}${p === undefined ? "" : `:${p}`}${path}`);

const issueUrl = fc
  .tuple(host, seg, seg, fc.boolean(), fc.integer({ min: 1, max: 9_999_999 }))
  .map(([h, o, r, gitlab, n]) => `https://${h}/${o}/${r}${gitlab ? "/-" : ""}/issues/${n}`);

const area = fc.string({ maxLength: 200 });
const mode = fc.constantFrom(...CASE_MODE_IDS);
const pad = fc.stringMatching(/^[ \t\n]{0,3}$/);

const validRepoValues = fc.record({
  targetType: fc.constant("repository"),
  repoUrl,
  version,
  appUrl: fc.string(),
  area,
  mode,
  issueUrl,
});
const validLocalValues = fc.record({
  targetType: fc.constant("local-app"),
  repoUrl: fc.string(),
  version: fc.string(),
  appUrl,
  area,
  mode,
  issueUrl,
});
const validValues = fc.oneof(validRepoValues, validLocalValues);

const anyValues = fc.record({
  targetType: fc.oneof(fc.constantFrom("repository", "local-app"), fc.string()),
  repoUrl: fc.oneof(repoUrl, fc.string()),
  version: fc.oneof(version, fc.string()),
  appUrl: fc.oneof(appUrl, fc.string()),
  area: fc.string({ maxLength: 260 }),
  mode: fc.oneof(mode, fc.string()),
  issueUrl: fc.oneof(issueUrl, fc.string()),
});

const errorKeys = (v: Partial<FormValues>) => {
  const r = validate(v);
  return r.ok ? [] : Object.keys(r.errors).sort();
};

describe("Property 27: Open-a-case validation", () => {
  it("never throws, for any values (including non-strings, huge and odd strings)", () => {
    fc.assert(
      fc.property(fc.oneof(anyValues, fc.dictionary(fc.constantFrom("targetType", "repoUrl", "version", "appUrl", "area", "mode", "issueUrl"), fc.anything())), (v) => {
        expect(() => validate(v as Partial<FormValues>)).not.toThrow();
        for (const id of ["targetType", "repoUrl", "version", "appUrl", "area", "mode", "issueUrl"] as FieldId[]) {
          expect(() => validateField(id, v as Partial<FormValues>)).not.toThrow();
        }
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
        if (v.targetType === "repository") {
          expect(d.target).toEqual({
            kind: "repository",
            repoUrl: v.repoUrl,
            version: { kind: /^[0-9a-f]{7,40}$/i.test(v.version) ? "commit" : "ref", value: v.version },
          });
          expect(JSON.stringify(d)).not.toContain('"appUrl"');
        } else {
          expect(d.target).toEqual({ kind: "local-app", appUrl: v.appUrl });
          expect(JSON.stringify(d)).not.toContain('"repoUrl"');
        }
        if (v.mode === "open-hunt") expect(d).not.toHaveProperty("issueUrl");
        else expect(d.issueUrl).toBe(v.issueUrl);
        if (d.area !== undefined) {
          expect(d.area.length).toBeLessThanOrEqual(200);
          // eslint-disable-next-line no-control-regex -- the stored area has no control characters
          expect(d.area).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
          expect(d.area).toBe(d.area.trim());
        }
      }),
    );
  });

  it("gives the same result for trimmed and untrimmed values", () => {
    fc.assert(
      fc.property(anyValues, fc.array(pad, { minLength: 14, maxLength: 14 }), (v, p) => {
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
    // A local app ignores the repository fields; an Open hunt ignores the issue field.
    const local = { ...DEFAULT_VALUES, targetType: "local-app", appUrl: "http://localhost:3000", repoUrl: "nope", version: "..", mode: "open-hunt", issueUrl: "javascript:alert(1)" };
    expect(validate(local)).toEqual({ ok: true, draft: { mode: "open-hunt", target: { kind: "local-app", appUrl: "http://localhost:3000" } } });
  });

  // Each mutation breaks exactly one field; the error is on that field only.
  const mutations: readonly [string, FieldId, fc.Arbitrary<(v: FormValues) => FormValues>][] = [
    ["repository credentials", "repoUrl", fc.constantFrom("user@", "user:secret@").map((c) => (v: FormValues) => ({ ...v, repoUrl: v.repoUrl.replace("https://", `https://${c}`) }))],
    ["repository query", "repoUrl", fc.constantFrom("?tab=readme", "?").map((q) => (v: FormValues) => ({ ...v, repoUrl: `${v.repoUrl}${q}` }))],
    ["repository fragment", "repoUrl", fc.constantFrom("#readme", "#").map((f) => (v: FormValues) => ({ ...v, repoUrl: `${v.repoUrl}${f}` }))],
    ["repository non-https scheme", "repoUrl", fc.constantFrom("http://", "ftp://", "git://", "").map((s) => (v: FormValues) => ({ ...v, repoUrl: v.repoUrl.replace("https://", s) }))],
    ["repository without a repo segment", "repoUrl", host.map((h) => (v: FormValues) => ({ ...v, repoUrl: `https://${h}/owner` }))],
    ["repository too long", "repoUrl", fc.constant((v: FormValues) => ({ ...v, repoUrl: `https://github.com/o/${"r".repeat(300)}` }))],
    ["invalid ref", "version", fc.constantFrom("a..b", "-main", "/main", "main/", "main.", "v1.lock", "has space", "a//b", "x@{1}", "x".repeat(101), "é").map((r) => (v: FormValues) => ({ ...v, version: r }))],
    ["empty version", "version", fc.constant((v: FormValues) => ({ ...v, version: "" }))],
    ["issue non-https", "issueUrl", fc.constant((v: FormValues) => ({ ...v, issueUrl: v.issueUrl.replace("https://", "http://") }))],
    ["issue credentials", "issueUrl", fc.constant((v: FormValues) => ({ ...v, issueUrl: v.issueUrl.replace("https://", "https://me:pw@") }))],
    ["issue without number", "issueUrl", fc.constantFrom("/issues", "/issues/abc", "/pulls/12", "/issues/12/x").map((p) => (v: FormValues) => ({ ...v, issueUrl: v.issueUrl.replace(/\/(?:-\/)?issues\/\d+$/, p) }))],
    ["area too long", "area", fc.integer({ min: 201, max: 400 }).map((n) => (v: FormValues) => ({ ...v, area: "x".repeat(n) }))],
  ];

  for (const [name, field, mutate] of mutations) {
    it(`rejects ${name} with an error on ${field} only`, () => {
      fc.assert(
        fc.property(validRepoValues.map((v) => ({ ...v, mode: field === "issueUrl" ? "known-issue" : v.mode })), mutate, (v, m) => {
          expect(errorKeys(v)).toEqual([]);
          expect(errorKeys(m(v))).toEqual([field]);
        }),
      );
    });
  }

  const nonLoopback = fc.oneof(host.filter((h) => !/(^|\.)localhost$/i.test(h)), fc.constantFrom("127.0.0.2", "127.1", "0.0.0.0", "[::2]", "10.0.0.1", "localhost.example.com"));
  it("rejects a non-loopback app host, app credentials and other schemes, with the local-only message", () => {
    fc.assert(
      fc.property(validLocalValues, nonLoopback, (v, h) => {
        const bad = { ...v, appUrl: `http://${h}:3000/` };
        expect(errorKeys(bad)).toEqual(["appUrl"]);
        const r = validate(bad);
        expect(!r.ok && r.errors.appUrl).toBe(ERRORS.appUrl);
      }),
    );
    for (const appUrl of ["http://me:pw@localhost:3000", "http://me@localhost", "ftp://localhost", "localhost:3000", "file:///tmp", "http://localhost:99999"]) {
      expect(errorKeys({ ...DEFAULT_VALUES, targetType: "local-app", appUrl, mode: "open-hunt" }), appUrl).toEqual(["appUrl"]);
    }
  });

  it("requires the fields of the chosen target and mode", () => {
    expect(errorKeys(DEFAULT_VALUES)).toEqual(["issueUrl", "repoUrl", "version"]);
    expect(errorKeys({ ...DEFAULT_VALUES, mode: "open-hunt" })).toEqual(["repoUrl", "version"]);
    expect(errorKeys({ ...DEFAULT_VALUES, targetType: "local-app", mode: "blind-hunt" })).toEqual(["appUrl", "issueUrl"]);
    expect(errorKeys({ ...DEFAULT_VALUES, targetType: "elsewhere" })).toContain("targetType");
    expect(errorKeys({ ...DEFAULT_VALUES, mode: "psychic" })).toContain("mode");
  });

  it("writes errors as plain sentences", () => {
    for (const message of Object.values(ERRORS)) expect(message).toMatch(/^[A-Z].*\.$/);
  });
});
