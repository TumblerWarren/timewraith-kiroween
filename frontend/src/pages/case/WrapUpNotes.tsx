import { useId } from "react";
import { CASE_ADDITIONS } from "../../content/copy";

export function WrapUpNotes({ notes }: { readonly notes: readonly string[] }) {
  const id = useId();
  const copy = CASE_ADDITIONS.wrapUp;
  const wrapUp = notes.map((note) => note.trim()).filter((note) => note.startsWith(copy.prefix));
  if (wrapUp.length === 0) return null;
  return <aside className="case-wrapup" role="note" aria-labelledby={id}>
    <h3 id={id}>{copy.title}</h3>
    <ul role="list">{wrapUp.map((note, index) => <li key={index}>{note}</li>)}</ul>
  </aside>;
}
