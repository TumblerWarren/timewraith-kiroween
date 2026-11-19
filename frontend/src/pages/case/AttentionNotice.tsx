import { useId } from "react";
import { attentionOf } from "../../app/status";
import { RUN_ATTENTION } from "../../content/copy";

/** What went wrong in a run that finished without an error: shown on every tab of the case, never only in a log. */
export function AttentionNotice({ notes }: { readonly notes: readonly string[] }) {
  const id = useId();
  const text = attentionOf(notes);
  if (!text) return null;
  return (
    <aside className="case-wrapup" role="note" aria-labelledby={id} data-attention="true">
      <h3 id={id}>{RUN_ATTENTION.title}</h3>
      <p>{text}</p>
    </aside>
  );
}