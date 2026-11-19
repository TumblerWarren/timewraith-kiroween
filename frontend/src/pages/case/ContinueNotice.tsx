import { useId } from "react";
import { href } from "../../app/router";
import { CASE_CONTINUE as copy } from "../../content/copy";

/**
 * The agents stopped (usage limit, expired sign-in, throttled service) and left steps undone. This says which, and
 * Continue runs exactly those steps again in this case with the account that is signed in now. Switching the account
 * is done on the Crew page; what already finished is kept.
 */
export function ContinueNotice({
  unfinished, busy, onContinue,
}: { readonly unfinished: readonly string[]; readonly busy: boolean; readonly onContinue: () => void }) {
  const id = useId();
  if (unfinished.length === 0) return null;
  return (
    <aside className="case-wrapup" role="note" aria-labelledby={id} data-continue="true">
      <h3 id={id}>{copy.title}</h3>
      <p>{copy.lead}</p>
      <ul role="list">{unfinished.map((line) => <li key={line}>{line}</li>)}</ul>
      <p className="case-note">{copy.keeps}</p>
      <p className="case-note">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={onContinue}>
          {busy ? copy.continuing : copy.button}
        </button>{" "}
        <a href={href({ page: "crew" })}>{copy.switchAccount}</a>
      </p>
    </aside>
  );
}