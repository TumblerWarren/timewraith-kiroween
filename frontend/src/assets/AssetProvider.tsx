import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { MascotId } from "../mascots/ids";
import { EMPTY_MANIFEST, loadBundledManifest, type Manifest } from "./manifest";
import { resolveMascotArt, type ArtLevel } from "./resolve";
import { bundledUrlResolver, type UrlResolver } from "./urls";

export interface AssetContextValue {
  readonly manifest: Manifest;
  readonly resolveUrl: UrlResolver;
}

/** Outside a provider the app behaves as if no art exists: every mascot is a placeholder. */
const NO_ART: AssetContextValue = { manifest: EMPTY_MANIFEST, resolveUrl: () => undefined };

const AssetContext = createContext<AssetContextValue>(NO_ART);

export interface AssetProviderProps {
  /** Defaults to the bundled `frontend/assets/manifests/manifest.json`, or an empty manifest if missing. */
  readonly manifest?: Manifest;
  /** Defaults to the URLs Vite emits for `frontend/assets/{cutouts,frames,scenery,effects}`. */
  readonly resolveUrl?: UrlResolver;
  readonly children: ReactNode;
}

export function AssetProvider({ manifest, resolveUrl, children }: AssetProviderProps) {
  const value = useMemo<AssetContextValue>(
    () => ({ manifest: manifest ?? loadBundledManifest(), resolveUrl: resolveUrl ?? bundledUrlResolver }),
    [manifest, resolveUrl],
  );
  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets(): AssetContextValue {
  return useContext(AssetContext);
}

/** The art level for one mascot under the current manifest. */
export function useMascotArtLevel(id: MascotId): ArtLevel {
  const { manifest } = useAssets();
  return useMemo(() => resolveMascotArt(id, manifest), [id, manifest]);
}
