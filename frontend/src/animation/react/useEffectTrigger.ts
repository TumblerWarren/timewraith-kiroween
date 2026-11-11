import { useCallback } from "react";
import type { RequestResult } from "../director/types";
import type { RequestFn } from "./directorHost";
import { useDirectorHost } from "./directorHost";

const DROPPED: RequestResult = { status: "dropped", reason: "failed" };

/**
 * Returns the director's `request` (design "MotionDirector": `useEffectTrigger()` returns `request`).
 * Outside a DirectorProvider it returns a no-op that reports `dropped`, so components render in isolation.
 */
export function useEffectTrigger(): RequestFn {
  const host = useDirectorHost();
  return useCallback<RequestFn>((id, params, opts) => (host ? host.request(id, params, opts) : DROPPED), [host]);
}
