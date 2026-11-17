import type { ReplayEventMsg } from "../../api/types";
import { href } from "../../app/router";
import { isKiroAccountNote } from "../../app/status";
import { CASE_LIVE as copy } from "../../content/copy";
import { CREW_BY_ID } from "../../content/crew";
import { callProgress } from "./liveCase";

export function NowStrip({ events }: { readonly events: readonly ReplayEventMsg[] }) {
  const latest = events.findLast((event) => event.kind === "dispatch" || event.kind === "tool" || event.kind === "stage");
  const progress = latest ? callProgress(latest) : null;
  return (
    <section className="case-now" aria-label={copy.now}>
      <p className="case-now__label"><strong>{copy.now}</strong><span className="tag tag--good">{copy.live}</span></p>
      <p className="case-now__event">{latest ? <><strong>{CREW_BY_ID[latest.actor]?.name ?? latest.actor}</strong> · {latest.text}</> : copy.waiting}</p>
      {progress && <div className="case-now__progress">
        <progress value={progress.calls} max={progress.max} aria-label={copy.progress(progress.calls, progress.max)} />
        <span className="case-note">{copy.progress(progress.calls, progress.max)}</span>
      </div>}
    </section>
  );
}

export function KiroAccountBanner({ notes, events }: { readonly notes: readonly string[]; readonly events: readonly ReplayEventMsg[] }) {
  const messages = [...new Set([...notes, ...events.filter((event) => event.kind === "note").map((event) => event.text)].filter(isKiroAccountNote))];
  if (!messages.length) return null;
  return (
    <aside className="case-wrapup" aria-label={copy.accountTitle}>
      <h3>{copy.accountTitle}</h3>
      {messages.map((message) => <p key={message}>{message}</p>)}
      <a href={href({ page: "crew" })}>{copy.reviewSetup}</a>
    </aside>
  );
}
