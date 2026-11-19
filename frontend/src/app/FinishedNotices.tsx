import { useEffect, useMemo, useRef, useState } from "react";
import { useOptionalLiveAnnouncer } from "../a11y/LiveAnnouncer";
import { FINAL_STAGES } from "../api/types";
import { caseHref } from "./router";
import { caseState, type CaseStateId } from "./status";
import { liveTitle, type LiveCase } from "../cases/model";
import { useCaseStore } from "../cases/store";
import { RUN_FINISHED } from "../content/copy";

export interface FinishedNotice {
  readonly id: string;
  readonly tone: Extract<CaseStateId, "failed" | "attention" | "done">;
  readonly title: string;
  readonly label: string;
  readonly detail: string;
}

/**
 * The runs that finished between two looks at the case list. Only a run that was seen still working counts, so a case
 * that was already finished when the page loaded is never announced, and a cancelled run is not news.
 */
export function finishedSince(before: ReadonlyMap<string, string>, live: readonly LiveCase[]): FinishedNotice[] {
  const fresh: FinishedNotice[] = [];
  for (const c of live) {
    const was = before.get(c.id);
    const stage = c.summary.stage;
    if (was === undefined || (FINAL_STAGES as readonly string[]).includes(was)) continue;
    if (stage !== "completed" && stage !== "failed") continue;
    const state = caseState(c);
    if (state.id !== "failed" && state.id !== "attention" && state.id !== "done") continue;
    fresh.push({ id: c.id, tone: state.id, title: liveTitle(c), label: state.label, detail: state.detail });
  }
  return fresh;
}

interface Seen {
  readonly stages: ReadonlyMap<string, string> | null;
  readonly notices: readonly FinishedNotice[];
  readonly dismissed: ReadonlySet<string>;
}

/**
 * Tells you when a run you started in this session finishes, wherever you are in the app: it failed, it finished with
 * problems (experiments that could not run), or it finished cleanly. The case page and the list show the same state;
 * this is the notice you cannot miss while looking at something else. The case you have open shows its state itself.
 */
export function FinishedNotices({ openCaseId }: { readonly openCaseId?: string }) {
  const { live } = useCaseStore();
  const announcer = useOptionalLiveAnnouncer();
  const stages = useMemo(() => new Map(live.map((c) => [c.id, c.summary.stage as string])), [live]);
  const [seen, setSeen] = useState<Seen>({ stages: null, notices: [], dismissed: new Set() });
  // Derived while rendering from the previous look at the list (no effect needed to copy it into state).
  if (seen.stages !== stages) {
    const fresh = seen.stages ? finishedSince(seen.stages, live) : [];
    const ids = new Set(fresh.map((n) => n.id));
    setSeen({
      stages,
      notices: fresh.length ? [...fresh, ...seen.notices.filter((n) => !ids.has(n.id))] : seen.notices,
      dismissed: fresh.length ? new Set([...seen.dismissed].filter((id) => !ids.has(id))) : seen.dismissed,
    });
  }
  const announced = useRef(new Set<string>());
  useEffect(() => {
    for (const n of seen.notices) {
      if (announced.current.has(n.id)) continue;
      announced.current.add(n.id);
      announcer?.announce(RUN_FINISHED.announce(n.title, n.label, n.detail));
    }
  }, [seen.notices, announcer]);

  const shown = seen.notices.filter((n) => !seen.dismissed.has(n.id) && n.id !== openCaseId);
  if (shown.length === 0) return null;
  return (
    <section className="finished-notices" aria-label={RUN_FINISHED.region}>
      {shown.map((n) => (
        <div key={n.id} className="finished-notice" data-tone={n.tone}>
          <div>
            <strong>{n.title}</strong>
            <span className="finished-notice__label">{n.label}</span>
            <p>{n.detail}</p>
          </div>
          <div className="finished-notice__actions">
            <a className="btn btn--primary" href={caseHref(n.id)}>{RUN_FINISHED.open}</a>
            <button type="button" className="btn btn--quiet"
              onClick={() => setSeen((s) => ({ ...s, dismissed: new Set([...s.dismissed, n.id]) }))}>
              {RUN_FINISHED.dismiss}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}