/**
 * Asset_Manifest types (design: Data Models > Asset_Manifest). The file
 * `frontend/assets/manifests/manifest.json` is written by the Cutout_Script. It may be missing: the
 * frontend then runs with placeholder art only (Requirements 4.8, 14.2).
 */

export type AssetKind = "part" | "frame" | "strip" | "pose" | "scenery" | "effect" | "wordmark";
export type AssetStatus = "pass" | "fail" | "placeholder";
export type AssetSource = "codex" | "api" | "manual" | "derived";

export interface Size {
  readonly w: number;
  readonly h: number;
}
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface AssetEntry {
  readonly id: string;
  readonly mascot?: string | null;
  readonly kind: AssetKind;
  readonly status: AssetStatus;
  readonly source?: AssetSource;
  /** Path of the retained master, relative to `frontend/assets/`. */
  readonly master?: string;
  /** Served files, relative to `frontend/assets/`. */
  readonly files?: { readonly png?: string; readonly webp?: string };
  /** Delivered pixels (2x display). */
  readonly size?: Size;
  /** CSS px; used for `<img width height>` (CLS). */
  readonly display?: Size;
  readonly canvas?: Size;
  readonly origin?: Point;
  /** Normalised in the trimmed image. */
  readonly pivot?: Point;
  readonly group?: string;
  readonly frame?: { readonly index: number; readonly of: number; readonly fps: number } | null;
  readonly bytes?: { readonly png?: number; readonly webp?: number };
  readonly qa?: { readonly ok: boolean; readonly reasons: readonly string[]; readonly attempts?: number };
  /** null = decorative (`alt=""`). */
  readonly alt?: string | null;
  /** Id of the simpler asset to use when this one fails. */
  readonly fallback?: string | null;
}

export interface Manifest {
  readonly schemaVersion: 1;
  readonly keyColor: string;
  readonly assets: Readonly<Record<string, AssetEntry>>;
}

export const MANIFEST_SCHEMA_VERSION = 1 as const;

/** An empty manifest is valid: every mascot then resolves to its placeholder. */
export const EMPTY_MANIFEST: Manifest = Object.freeze({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  keyColor: "#FF00FF",
  assets: Object.freeze({}),
});

const KINDS: readonly string[] = ["part", "frame", "strip", "pose", "scenery", "effect", "wordmark"];
const STATUSES: readonly string[] = ["pass", "fail", "placeholder"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isSize = (v: unknown): v is Size => isRecord(v) && isNum(v["w"]) && isNum(v["h"]) && (v["w"] as number) >= 0 && (v["h"] as number) >= 0;
const isPoint = (v: unknown): v is Point => isRecord(v) && isNum(v["x"]) && isNum(v["y"]);

/** Problems with one entry, as short messages. Empty when the entry is valid. */
function entryProblems(key: string, v: unknown): string[] {
  if (!isRecord(v)) return [`${key}: entry is not an object`];
  const out: string[] = [];
  if (v["id"] !== key) out.push(`${key}: id must equal the key`);
  if (typeof v["kind"] !== "string" || !KINDS.includes(v["kind"])) out.push(`${key}: unknown kind`);
  if (typeof v["status"] !== "string" || !STATUSES.includes(v["status"])) out.push(`${key}: unknown status`);
  if (v["size"] !== undefined && !isSize(v["size"])) out.push(`${key}: size must be {w,h}`);
  if (v["display"] !== undefined && !isSize(v["display"])) out.push(`${key}: display must be {w,h}`);
  if (v["canvas"] !== undefined && !isSize(v["canvas"])) out.push(`${key}: canvas must be {w,h}`);
  if (v["origin"] !== undefined && !isPoint(v["origin"])) out.push(`${key}: origin must be {x,y}`);
  if (v["pivot"] !== undefined && !isPoint(v["pivot"])) out.push(`${key}: pivot must be {x,y}`);
  if (v["files"] !== undefined) {
    const f = v["files"];
    if (!isRecord(f) || (f["png"] !== undefined && typeof f["png"] !== "string") || (f["webp"] !== undefined && typeof f["webp"] !== "string")) {
      out.push(`${key}: files must be {png?,webp?} strings`);
    }
  }
  if (v["alt"] !== undefined && v["alt"] !== null && typeof v["alt"] !== "string") out.push(`${key}: alt must be a string or null`);
  if (v["status"] === "fail") {
    const qa = v["qa"];
    const reasons = isRecord(qa) ? qa["reasons"] : undefined;
    if (!Array.isArray(reasons) || reasons.length === 0) out.push(`${key}: a failed entry needs at least one reason`);
  }
  return out;
}

/** Every problem found in `value`, or an empty list when it is a valid manifest. Never throws. */
export function manifestProblems(value: unknown): string[] {
  if (!isRecord(value)) return ["manifest is not an object"];
  const out: string[] = [];
  if (value["schemaVersion"] !== MANIFEST_SCHEMA_VERSION) out.push("schemaVersion must be 1");
  if (typeof value["keyColor"] !== "string") out.push("keyColor must be a string");
  const assets = value["assets"];
  if (!isRecord(assets)) return [...out, "assets must be an object"];
  for (const [key, entry] of Object.entries(assets)) out.push(...entryProblems(key, entry));
  return out;
}

/** Hand-written assertion used in tests (design: `assertManifest()`). Throws on the first problem list. */
export function assertManifest(value: unknown): asserts value is Manifest {
  const problems = manifestProblems(value);
  if (problems.length > 0) throw new Error(`Invalid Asset_Manifest: ${problems.join("; ")}`);
}

/**
 * Turn untrusted JSON into a Manifest the UI can use. Total: never throws. Entries that are not
 * objects or have an unknown kind or status are dropped, so one bad entry cannot hide the rest.
 */
export function normalizeManifest(raw: unknown): Manifest {
  if (!isRecord(raw) || !isRecord(raw["assets"])) return EMPTY_MANIFEST;
  const assets: Record<string, AssetEntry> = {};
  for (const [key, entry] of Object.entries(raw["assets"])) {
    if (!isRecord(entry)) continue;
    if (typeof entry["kind"] !== "string" || !KINDS.includes(entry["kind"])) continue;
    if (typeof entry["status"] !== "string" || !STATUSES.includes(entry["status"])) continue;
    assets[key] = { ...(entry as unknown as AssetEntry), id: key };
  }
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    keyColor: typeof raw["keyColor"] === "string" ? raw["keyColor"] : EMPTY_MANIFEST.keyColor,
    assets,
  };
}

/**
 * The manifest bundled at build time. `import.meta.glob` matches nothing when the file does not
 * exist, so the build and the app work with the manifest missing.
 */
const bundled = import.meta.glob<unknown>("../../assets/manifests/manifest.json", {
  eager: true,
  import: "default",
});

export function loadBundledManifest(): Manifest {
  try {
    const first = Object.values(bundled)[0];
    return first === undefined ? EMPTY_MANIFEST : normalizeManifest(first);
  } catch {
    return EMPTY_MANIFEST;
  }
}
