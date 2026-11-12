import { CASE_MODE_BY_ID, CASE_MODE_IDS, DEFAULT_CASE_MODE } from "../../content/modes";
import type { CaseMode, Target } from "../model";

/**
 * Open_Case_Form validation. The rules match the backend's (`backend/src/timewraith/ingest.py`): the target is a
 * public GitHub repository `https://github.com/<owner>/<repo>` pinned to a tag, branch or commit, and an issue
 * must be a GitHub issue of the same repository.
 *
 * `validate(values)` is pure and never throws: values of any length or content give a result. Values are trimmed
 * first. Only visible fields are validated and returned, so an Open hunt never carries an issue URL. The same
 * function re-validates stored drafts (`drafts/storage.ts`), so it also accepts non-string input as empty.
 */

export const FIELD_IDS = ["repoUrl", "version", "area", "mode", "issueUrl"] as const;
export type FieldId = (typeof FIELD_IDS)[number];

export interface FormValues {
  readonly repoUrl: string;
  readonly version: string;
  readonly area: string;
  readonly mode: string;
  readonly issueUrl: string;
}

export const DEFAULT_VALUES: FormValues = { repoUrl: "", version: "", area: "", mode: DEFAULT_CASE_MODE, issueUrl: "" };

/** What a valid form produces; the store adds the id and the date. */
export interface DraftInput {
  readonly mode: CaseMode;
  readonly target: Target;
  readonly area?: string;
  readonly issueUrl?: string;
}

export type FieldErrors = Partial<Record<FieldId, string>>;
export type ValidationResult = { readonly ok: true; readonly draft: DraftInput } | { readonly ok: false; readonly errors: FieldErrors };

export const MAX_URL_LENGTH = 300;
export const MAX_AREA_LENGTH = 200;
export const MAX_REF_LENGTH = 100;

export const ERRORS = {
  repoUrlEmpty: "Enter the repository address, such as https://github.com/owner/repo.",
  repoUrl: "Enter a GitHub repository address, such as https://github.com/owner/repo.",
  repoUrlPath: "Include the owner and the repository name, such as https://github.com/owner/repo.",
  repoUrlCredentials: "Remove the user name or password from the repository address.",
  repoUrlExtra: "Remove the part after ? or # from the repository address.",
  repoUrlLong: "Keep the repository address to 300 characters or fewer.",
  versionEmpty: "Enter a tag, branch or commit hash, such as v6.1.10.",
  version:
    "Enter a tag or branch name without spaces, two dots or a slash at either end, or a commit hash of 7 to 40 hexadecimal characters.",
  area: "Keep the date-sensitive area to 200 characters or fewer.",
  mode: "Choose a case mode.",
  issueUrlEmpty: "Enter the public issue address, such as https://github.com/owner/repo/issues/123.",
  issueUrl: "Enter a GitHub issue address that ends in its number, such as https://github.com/owner/repo/issues/123.",
  issueUrlCredentials: "Remove the user name or password from the issue address.",
  issueUrlLong: "Keep the issue address to 300 characters or fewer.",
  issueUrlRepo: "The issue must belong to the repository above.",
} as const;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Trimmed copies of every value; non-strings become "". */
export function normalize(values: Partial<Record<FieldId, unknown>> | null | undefined): FormValues {
  const v = (values ?? {}) as Partial<Record<FieldId, unknown>>;
  return { repoUrl: str(v.repoUrl), version: str(v.version), area: str(v.area), mode: str(v.mode), issueUrl: str(v.issueUrl) };
}

const isMode = (v: string): v is CaseMode => (CASE_MODE_IDS as readonly string[]).includes(v);

/** The fields shown for these values, in form order. */
export function visibleFields(values: Pick<FormValues, "mode">): FieldId[] {
  const mode = str(values.mode);
  const fields: FieldId[] = ["repoUrl", "version", "area", "mode"];
  if (!isMode(mode) || CASE_MODE_BY_ID[mode].needsIssue) fields.push("issueUrl");
  return fields;
}

// ---------------------------------------------------------------- field rules

/** Characters a pasted address never needs: whitespace, backslashes, control characters, angle brackets, quotes. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const BAD_URL_CHARS = /[\s\\<>"`\u0000-\u001f\u007f]/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** [owner, repo] of a valid GitHub repository address, or the error. */
function parseRepo(value: string): { ok: true; owner: string; repo: string } | { ok: false; error: string } {
  if (value === "") return { ok: false, error: ERRORS.repoUrlEmpty };
  if (value.length > MAX_URL_LENGTH) return { ok: false, error: ERRORS.repoUrlLong };
  if (BAD_URL_CHARS.test(value)) return { ok: false, error: ERRORS.repoUrl };
  if (!/^https:\/\//i.test(value)) return { ok: false, error: ERRORS.repoUrl };
  const authority = value.slice(8).split(/[/?#]/)[0] ?? "";
  if (authority.includes("@")) return { ok: false, error: ERRORS.repoUrlCredentials };
  if (value.includes("?") || value.includes("#")) return { ok: false, error: ERRORS.repoUrlExtra };
  if (authority.toLowerCase() !== "github.com") return { ok: false, error: ERRORS.repoUrl };
  const segments = value.slice(8 + authority.length).split("/").filter((s) => s !== "");
  if (segments.length !== 2) return { ok: false, error: ERRORS.repoUrlPath };
  const owner = segments[0] as string;
  const repo = (segments[1] as string).replace(/\.git$/, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return { ok: false, error: ERRORS.repoUrlPath };
  return { ok: true, owner, repo };
}

const COMMIT = /^[0-9a-f]{7,40}$/i;
const REF = /^[A-Za-z0-9._/-]{1,100}$/;

export function versionKind(value: string): "commit" | "ref" {
  return COMMIT.test(value) ? "commit" : "ref";
}

function checkVersion(value: string): string | undefined {
  if (value === "") return ERRORS.versionEmpty;
  if (COMMIT.test(value)) return undefined;
  if (value.length > MAX_REF_LENGTH || !REF.test(value)) return ERRORS.version;
  if (value.includes("..") || value.includes("//") || value.includes("@{")) return ERRORS.version;
  if (value.startsWith("-") || value.startsWith("/")) return ERRORS.version;
  if (value.endsWith("/") || value.endsWith(".") || value.endsWith(".lock")) return ERRORS.version;
  return undefined;
}

const ISSUE = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/issues\/(\d{1,9})\/?$/i;

function checkIssueUrl(value: string, repoUrl: string): string | undefined {
  if (value === "") return ERRORS.issueUrlEmpty;
  if (value.length > MAX_URL_LENGTH) return ERRORS.issueUrlLong;
  if (BAD_URL_CHARS.test(value)) return ERRORS.issueUrl;
  if (/^https:\/\/[^/]*@/i.test(value)) return ERRORS.issueUrlCredentials;
  const m = ISSUE.exec(value);
  if (!m) return ERRORS.issueUrl;
  const repo = parseRepo(repoUrl);
  if (repo.ok && (m[1]?.toLowerCase() !== repo.owner.toLowerCase() || m[2]?.replace(/\.git$/, "").toLowerCase() !== repo.repo.toLowerCase())) {
    return ERRORS.issueUrlRepo;
  }
  return undefined;
}

/**
 * The area as stored: tabs and line breaks become spaces, other control characters are removed, then trimmed.
 * Cleaning the trimmed value gives the same result as cleaning the untrimmed one.
 */
export function cleanArea(value: string): string {
  return value
    .replace(/[\t\n\r]/g, " ")
    // eslint-disable-next-line no-control-regex -- removes control characters from free text
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
}

/** Error for one field (or undefined), given all values; used on blur. Hidden fields have no error. */
export function validateField(id: FieldId, input: Partial<Record<FieldId, unknown>>): string | undefined {
  try {
    const values = normalize(input);
    if (!visibleFields(values).includes(id)) return undefined;
    switch (id) {
      case "repoUrl": {
        const r = parseRepo(values.repoUrl);
        return r.ok ? undefined : r.error;
      }
      case "version":
        return checkVersion(values.version);
      case "area":
        return cleanArea(values.area).length > MAX_AREA_LENGTH ? ERRORS.area : undefined;
      case "mode":
        return isMode(values.mode) ? undefined : ERRORS.mode;
      case "issueUrl":
        return checkIssueUrl(values.issueUrl, values.repoUrl);
      default:
        return undefined;
    }
  } catch {
    return id === "repoUrl" ? ERRORS.repoUrl : undefined;
  }
}

/** Validate every visible field and build the draft input. Never throws. */
export function validate(input: Partial<Record<FieldId, unknown>> | null | undefined): ValidationResult {
  const values = normalize(input);
  const errors: FieldErrors = {};
  for (const id of visibleFields(values)) {
    const error = validateField(id, values);
    if (error !== undefined) errors[id] = error;
  }
  if (Object.keys(errors).length > 0 || !isMode(values.mode)) return { ok: false, errors };
  const target: Target = { kind: "repository", repoUrl: values.repoUrl, version: { kind: versionKind(values.version), value: values.version } };
  const area = cleanArea(values.area);
  const draft: DraftInput = {
    mode: values.mode,
    target,
    ...(area !== "" ? { area } : {}),
    ...(CASE_MODE_BY_ID[values.mode].needsIssue ? { issueUrl: values.issueUrl } : {}),
  };
  return { ok: true, draft };
}

/** Form values that reproduce a stored draft (used by storage re-validation). Old local-app drafts fail it. */
export function valuesFromDraft(d: {
  readonly mode?: unknown;
  readonly target?: unknown;
  readonly area?: unknown;
  readonly issueUrl?: unknown;
}): Partial<Record<FieldId, unknown>> {
  const t = (d.target ?? {}) as { kind?: unknown; repoUrl?: unknown; version?: { value?: unknown } };
  if (t.kind !== "repository") return { repoUrl: "", version: "", mode: d.mode };
  return {
    repoUrl: t.repoUrl,
    version: t.version && typeof t.version === "object" ? t.version.value : "",
    area: d.area ?? "",
    mode: d.mode,
    issueUrl: d.issueUrl ?? "",
  };
}

/** The backend request for a valid draft input. */
export function toCreateRequest(d: DraftInput, auto: boolean) {
  return {
    repository_url: d.target.repoUrl,
    ref: d.target.version.value,
    mode: d.mode,
    issue_url: d.issueUrl ?? null,
    area: d.area ?? null,
    auto,
  };
}
