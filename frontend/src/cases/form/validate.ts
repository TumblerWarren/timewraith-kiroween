import { CASE_MODE_BY_ID, CASE_MODE_IDS, DEFAULT_CASE_MODE } from "../../content/modes";
import type { CaseMode, Target } from "../model";

/**
 * Open_Case_Form validation (design: Open-a-case panel and form; Requirements 19.2 to 19.11, 19.16).
 *
 * `validate(values)` is pure and never throws: values of any length or content give a result. Values are trimmed
 * first. Only visible fields are validated and returned, so an Open hunt never carries an issue URL and a local app
 * never carries a repository URL. Error messages are plain sentences. The same function re-validates stored drafts
 * (`drafts/storage.ts`), so it also accepts non-string input and treats it as empty.
 */

export const FIELD_IDS = ["targetType", "repoUrl", "version", "appUrl", "area", "mode", "issueUrl"] as const;
export type FieldId = (typeof FIELD_IDS)[number];

export type TargetType = "repository" | "local-app";

export interface FormValues {
  readonly targetType: string;
  readonly repoUrl: string;
  readonly version: string;
  readonly appUrl: string;
  readonly area: string;
  readonly mode: string;
  readonly issueUrl: string;
}

export const DEFAULT_VALUES: FormValues = {
  targetType: "repository",
  repoUrl: "",
  version: "",
  appUrl: "",
  area: "",
  mode: DEFAULT_CASE_MODE,
  issueUrl: "",
};

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
  targetType: "Choose whether the target is a Git repository or a local app.",
  repoUrlEmpty: "Enter the repository address, such as https://github.com/owner/repo.",
  repoUrl: "Enter an https address of a repository, such as https://github.com/owner/repo.",
  repoUrlPath: "Include the owner and the repository name, such as https://github.com/owner/repo.",
  repoUrlCredentials: "Remove the user name or password from the repository address.",
  repoUrlExtra: "Remove the part after ? or # from the repository address.",
  repoUrlLong: "Keep the repository address to 300 characters or fewer.",
  versionEmpty: "Enter a tag, branch or commit hash, such as v6.1.10.",
  version:
    "Enter a tag or branch name without spaces, two dots or a slash at either end, or a commit hash of 7 to 40 hexadecimal characters.",
  appUrlEmpty: "Enter the local app address, such as http://localhost:3000.",
  appUrl:
    "Only local apps can be brought in. Use localhost, a .localhost name, 127.0.0.1 or [::1], such as http://localhost:3000.",
  appUrlCredentials: "Remove the user name or password from the local app address.",
  appUrlLong: "Keep the local app address to 300 characters or fewer.",
  area: "Keep the date-sensitive area to 200 characters or fewer.",
  mode: "Choose a case mode.",
  issueUrlEmpty: "Enter the public issue address, such as https://github.com/owner/repo/issues/123.",
  issueUrl: "Enter an https address that ends in an issue number, such as https://github.com/owner/repo/issues/123.",
  issueUrlCredentials: "Remove the user name or password from the issue address.",
  issueUrlLong: "Keep the issue address to 300 characters or fewer.",
} as const;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Trimmed copies of every value; non-strings become "". */
export function normalize(values: Partial<Record<FieldId, unknown>> | null | undefined): FormValues {
  const v = (values ?? {}) as Partial<Record<FieldId, unknown>>;
  return {
    targetType: str(v.targetType),
    repoUrl: str(v.repoUrl),
    version: str(v.version),
    appUrl: str(v.appUrl),
    area: str(v.area),
    mode: str(v.mode),
    issueUrl: str(v.issueUrl),
  };
}

const isTargetType = (v: string): v is TargetType => v === "repository" || v === "local-app";
const isMode = (v: string): v is CaseMode => (CASE_MODE_IDS as readonly string[]).includes(v);

/** The fields shown for these values, in form order (Requirements 19.2, 19.3, 19.5, 19.6). */
export function visibleFields(values: Pick<FormValues, "targetType" | "mode">): FieldId[] {
  const targetType = str(values.targetType);
  const mode = str(values.mode);
  const fields: FieldId[] = ["targetType"];
  if (targetType === "local-app") fields.push("appUrl");
  else fields.push("repoUrl", "version");
  fields.push("area", "mode");
  if (!isMode(mode) || CASE_MODE_BY_ID[mode].needsIssue) fields.push("issueUrl");
  return fields;
}

// ---------------------------------------------------------------- field rules

/** Raw authority (between "scheme://" and the first "/", "?" or "#"), or null when the shape is wrong. */
function rawAuthority(value: string, schemes: readonly string[]): string | null {
  const lower = value.toLowerCase();
  const scheme = schemes.find((s) => lower.startsWith(`${s}://`));
  if (!scheme) return null;
  const rest = value.slice(scheme.length + 3);
  const end = rest.search(/[/?#]/);
  return end === -1 ? rest : rest.slice(0, end);
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Characters a pasted address never needs: whitespace, backslashes, control characters, angle brackets, quotes. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const BAD_URL_CHARS = /[\s\\<>"`\u0000-\u001f\u007f]/;

function checkRepoUrl(value: string): string | undefined {
  if (value === "") return ERRORS.repoUrlEmpty;
  if (value.length > MAX_URL_LENGTH) return ERRORS.repoUrlLong;
  if (BAD_URL_CHARS.test(value)) return ERRORS.repoUrl;
  const authority = rawAuthority(value, ["https"]);
  if (authority === null) return ERRORS.repoUrl;
  if (authority.includes("@")) return ERRORS.repoUrlCredentials;
  if (value.includes("?") || value.includes("#")) return ERRORS.repoUrlExtra;
  const url = parseUrl(value);
  if (!url || url.protocol !== "https:" || url.hostname === "" || authority === "") return ERRORS.repoUrl;
  if (url.username !== "" || url.password !== "") return ERRORS.repoUrlCredentials;
  const segments = url.pathname.split("/").filter((s) => s !== "");
  if (segments.length < 2) return ERRORS.repoUrlPath;
  const last = segments[segments.length - 1] as string;
  if (last === ".git" || segments.some((s) => s === "." || s === "..")) return ERRORS.repoUrlPath;
  return undefined;
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

const LOCALHOST_NAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*localhost$/;

/** Host part of a raw authority without the port; IPv6 keeps its brackets. */
function hostOf(authority: string): { host: string; port: string } | null {
  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    if (close === -1) return null;
    const host = authority.slice(0, close + 1);
    const rest = authority.slice(close + 1);
    if (rest !== "" && !rest.startsWith(":")) return null;
    return { host, port: rest.slice(1) };
  }
  const colon = authority.indexOf(":");
  return colon === -1 ? { host: authority, port: "" } : { host: authority.slice(0, colon), port: authority.slice(colon + 1) };
}

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return LOCALHOST_NAME.test(h) || h === "127.0.0.1" || h === "[::1]";
}

function checkAppUrl(value: string): string | undefined {
  if (value === "") return ERRORS.appUrlEmpty;
  if (value.length > MAX_URL_LENGTH) return ERRORS.appUrlLong;
  if (BAD_URL_CHARS.test(value)) return ERRORS.appUrl;
  const authority = rawAuthority(value, ["http", "https"]);
  if (authority === null) return ERRORS.appUrl;
  if (authority.includes("@")) return ERRORS.appUrlCredentials;
  const hp = hostOf(authority);
  if (!hp || !isLoopbackHost(hp.host)) return ERRORS.appUrl;
  if (hp.port !== "" && !/^\d{1,5}$/.test(hp.port)) return ERRORS.appUrl;
  if (hp.port !== "" && Number(hp.port) > 65535) return ERRORS.appUrl;
  const url = parseUrl(value);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return ERRORS.appUrl;
  if (url.username !== "" || url.password !== "") return ERRORS.appUrlCredentials;
  if (!isLoopbackHost(url.hostname)) return ERRORS.appUrl;
  return undefined;
}

const ISSUE_PATH = /\/(?:-\/)?issues\/\d+$/;

function checkIssueUrl(value: string): string | undefined {
  if (value === "") return ERRORS.issueUrlEmpty;
  if (value.length > MAX_URL_LENGTH) return ERRORS.issueUrlLong;
  if (BAD_URL_CHARS.test(value)) return ERRORS.issueUrl;
  const authority = rawAuthority(value, ["https"]);
  if (authority === null || authority === "") return ERRORS.issueUrl;
  if (authority.includes("@")) return ERRORS.issueUrlCredentials;
  const url = parseUrl(value);
  if (!url || url.protocol !== "https:" || url.hostname === "") return ERRORS.issueUrl;
  if (url.username !== "" || url.password !== "") return ERRORS.issueUrlCredentials;
  const rawPath = value.slice("https://".length + authority.length).split(/[?#]/)[0] ?? "";
  if (!ISSUE_PATH.test(rawPath) || !ISSUE_PATH.test(url.pathname)) return ERRORS.issueUrl;
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

function checkArea(value: string): string | undefined {
  return cleanArea(value).length > MAX_AREA_LENGTH ? ERRORS.area : undefined;
}

/** Error for one field (or undefined), given all values; used on blur. Hidden fields have no error. */
export function validateField(id: FieldId, input: Partial<Record<FieldId, unknown>>): string | undefined {
  try {
    const values = normalize(input);
    if (!visibleFields(values).includes(id)) return undefined;
    switch (id) {
      case "targetType":
        return isTargetType(values.targetType) ? undefined : ERRORS.targetType;
      case "repoUrl":
        return checkRepoUrl(values.repoUrl);
      case "version":
        return checkVersion(values.version);
      case "appUrl":
        return checkAppUrl(values.appUrl);
      case "area":
        return checkArea(values.area);
      case "mode":
        return isMode(values.mode) ? undefined : ERRORS.mode;
      case "issueUrl":
        return checkIssueUrl(values.issueUrl);
      default:
        return undefined;
    }
  } catch {
    return id === "targetType" ? ERRORS.targetType : undefined;
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
  if (Object.keys(errors).length > 0 || !isTargetType(values.targetType) || !isMode(values.mode)) {
    return { ok: false, errors };
  }
  const target: Target =
    values.targetType === "local-app"
      ? { kind: "local-app", appUrl: values.appUrl }
      : { kind: "repository", repoUrl: values.repoUrl, version: { kind: versionKind(values.version), value: values.version } };
  const area = cleanArea(values.area);
  const draft: DraftInput = {
    mode: values.mode,
    target,
    ...(area !== "" ? { area } : {}),
    ...(CASE_MODE_BY_ID[values.mode].needsIssue ? { issueUrl: values.issueUrl } : {}),
  };
  return { ok: true, draft };
}

/** Form values that reproduce a stored draft (used by storage re-validation). */
export function valuesFromDraft(d: {
  readonly mode?: unknown;
  readonly target?: unknown;
  readonly area?: unknown;
  readonly issueUrl?: unknown;
}): Partial<Record<FieldId, unknown>> {
  const t = (d.target ?? {}) as { kind?: unknown; repoUrl?: unknown; appUrl?: unknown; version?: { value?: unknown } };
  return {
    targetType: t.kind,
    repoUrl: t.kind === "repository" ? t.repoUrl : "",
    version: t.kind === "repository" && t.version && typeof t.version === "object" ? t.version.value : "",
    appUrl: t.kind === "local-app" ? t.appUrl : "",
    area: d.area ?? "",
    mode: d.mode,
    issueUrl: d.issueUrl ?? "",
  };
}
