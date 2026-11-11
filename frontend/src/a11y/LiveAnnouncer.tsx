import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * One polite ARIA live region for the whole page (Requirements 10.3, 7.12). Components call
 * `announce(text)` from `useLiveAnnouncer()`. Announcing the same text twice in a row still re-announces:
 * the region alternates a trailing no-break space, which changes the text node without changing what is read.
 */
export interface LiveAnnouncerValue {
  readonly announce: (text: string) => void;
}

const LiveAnnouncerContext = createContext<LiveAnnouncerValue | null>(null);

export function LiveAnnouncer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const last = useRef({ text: "", flip: false });

  const announce = useCallback((text: string) => {
    const same = last.current.text === text;
    const flip = same ? !last.current.flip : false;
    last.current = { text, flip };
    setMessage(flip ? `${text}\u00a0` : text);
  }, []);

  const value = useMemo<LiveAnnouncerValue>(() => ({ announce }), [announce]);

  return (
    <LiveAnnouncerContext.Provider value={value}>
      {children}
      <div className="visually-hidden live-region" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </LiveAnnouncerContext.Provider>
  );
}

/** The announcer, or null outside `<LiveAnnouncer>` (components that are also rendered alone in tests). */
export function useOptionalLiveAnnouncer(): LiveAnnouncerValue | null {
  return useContext(LiveAnnouncerContext);
}

export function useLiveAnnouncer(): LiveAnnouncerValue {
  const value = useContext(LiveAnnouncerContext);
  if (value === null) throw new Error("useLiveAnnouncer must be used inside <LiveAnnouncer>");
  return value;
}
