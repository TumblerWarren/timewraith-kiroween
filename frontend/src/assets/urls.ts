import type { AssetEntry } from "./manifest";

/**
 * Served image URLs. The glob lets Vite hash and emit the files under `frontend/assets/`; it
 * matches nothing while the folders hold no images, so the build works with zero assets.
 * Masters are deliberately not included: they are never served.
 */
const served = import.meta.glob<string>("../../assets/{cutouts,frames,scenery,effects}/**/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

const PREFIX = "../../assets/";
const byPath = new Map<string, string>(Object.entries(served).map(([k, url]) => [k.startsWith(PREFIX) ? k.slice(PREFIX.length) : k, url]));

export type UrlResolver = (relativePath: string) => string | undefined;

/** Resolve a manifest-relative path such as `cutouts/mini-bat/body.webp` to a served URL. */
export const bundledUrlResolver: UrlResolver = (relativePath) => byPath.get(relativePath.replace(/\\/g, "/"));

/** The URL to use for an entry: WebP when it is on disk, else PNG, else undefined. */
export function entryUrl(entry: AssetEntry | undefined, resolve: UrlResolver): string | undefined {
  const files = entry?.files;
  if (!files) return undefined;
  for (const rel of [files.webp, files.png]) {
    if (typeof rel === "string") {
      const url = resolve(rel);
      if (url) return url;
    }
  }
  return undefined;
}
