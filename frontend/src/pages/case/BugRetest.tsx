import { useId, useState, type FormEvent } from "react";
import { useApi } from "../../api/ApiProvider";
import type { Bug } from "../../api/types";
import { CASE_ADDITIONS } from "../../content/copy";
import { CaseDisclosure } from "./CaseDisclosure";

function readableTime(at: string) {
  const value = new Date(at);
  return Number.isNaN(value.getTime()) ? at : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export function BugRetest({ bug, invId, onChanged }: {
  readonly bug: Bug;
  readonly invId: string;
  readonly onChanged: () => Promise<void>;
}) {
  const { api } = useApi();
  const id = useId();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const copy = CASE_ADDITIONS.retest;
  const retests = [...(bug.retests ?? [])].reverse().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!api || busy || !ref.trim()) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api.retest(invId, bug.id, ref.trim());
      await onChanged();
      setDone(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return <section className="case-retest" aria-labelledby={`${id}-title`}>
    <h5 id={`${id}-title`}>{copy.title}</h5>
    <p id={`${id}-help`} className="case-note">{copy.help}</p>
    <form className="case-retest__form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <div className="field">
        <label htmlFor={id}>{copy.ref}</label>
        <input id={id} value={ref} onChange={(event) => setRef(event.currentTarget.value)} placeholder={copy.placeholder} disabled={busy || !api} required aria-describedby={`${id}-help`} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </div>
      <button className="btn" type="submit" disabled={busy || !api || !ref.trim()}>{busy ? copy.busy : copy.submit}</button>
    </form>
    {busy && <p role="status" className="case-note">{copy.waiting}</p>}
    {error && <p role="alert" className="alert">{error}</p>}
    {done && <p role="status" className="case-note">{copy.done}</p>}
    {retests.length > 0 && <>
      <h6>{copy.history}</h6>
      <ol role="list" className="case-retest__history">{retests.map((retest, index) => <li key={`${retest.at}-${retest.ref}-${index}`}>
        <div className="case-card__head"><span className="mono">{retest.ref}</span><span className={`tag${retest.outcome === "fixed" ? " tag--good" : retest.outcome === "still_reproducible" ? " tag--bad" : " tag--warn"}`}>{copy.outcome[retest.outcome]}</span></div>
        <p className="case-note mono">{retest.revision.slice(0, 12)}</p>
        <p className={retest.detail.length > 260 ? "case-retest__detail" : undefined}>{retest.detail}</p>
        {retest.detail.length > 260 && <CaseDisclosure label={copy.details}><p className="case-saved-text">{retest.detail}</p></CaseDisclosure>}
        <time dateTime={retest.at} className="case-note">{readableTime(retest.at)}</time>
      </li>)}</ol>
    </>}
  </section>;
}
