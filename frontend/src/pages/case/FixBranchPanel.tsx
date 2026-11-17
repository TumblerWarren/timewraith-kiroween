import { useId, useState, type ReactNode } from "react";
import { useApi } from "../../api/ApiProvider";
import { ApiError } from "../../api/client";
import type { Bug, FixBranch } from "../../api/types";
import { sharingError } from "../../app/status";
import { FIX_SHARING as copy } from "../../content/copy";
import { ShareFix } from "./ShareFix";

function CopyField({ label, value, children }: {
  readonly label: string;
  readonly value: string;
  readonly children: ReactNode;
}) {
  const [message, setMessage] = useState("");
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(copy.copied);
    } catch {
      setMessage(copy.copyError);
    }
  }
  return (
    <div className="case-copy-field">
      <dt>{label}</dt>
      <dd>
        <div className="case-copy-field__value mono">{children}</div>
        <button type="button" className="btn btn--small" aria-label={copy.copyLabel(label)} onClick={() => void copyValue()}>{copy.copy}</button>
        {message && <p role="status" className="case-note">{message}</p>}
      </dd>
    </div>
  );
}

export function FixBranchPanel({ bug, invId, notes, onChanged }: {
  readonly bug: Bug;
  readonly invId: string;
  readonly notes: readonly string[];
  readonly onChanged: () => Promise<void>;
}) {
  const { api } = useApi();
  const id = useId();
  const [created, setCreated] = useState<FixBranch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branch = bug.fix.branch ?? created;
  const note = notes.findLast((text) => text.startsWith(`The fix for ${bug.id} was accepted, but its branch could not be made:`));
  async function remake() {
    if (!api || busy) return;
    setBusy(true);
    setError(null);
    try {
      setCreated(await api.makeBranch(invId, bug.id));
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? sharingError(err.code, err.message) : String(err));
    } finally {
      setBusy(false);
    }
  }
  // Quote the folder for the local shell. Windows paths use PowerShell quoting.
  const command = branch && (/^[a-z]:[\\/]|^\\\\/i.test(branch.path)
    ? `git -C '${branch.path.replaceAll("'", "''")}' log -1`
    : `git -C '${branch.path.replaceAll("'", "'\\''")}' log -1`);

  return (
    <>
      <section className="case-fix-section" aria-labelledby={id}>
        <h5 id={id}>{copy.branch}</h5>
        <p className="case-note">{copy.branchHelp}</p>
        {branch ? (
          <>
            <dl className="case-branch-fields">
              <CopyField label={copy.branchName} value={branch.name}>{branch.name}</CopyField>
              <CopyField label={copy.commit} value={branch.commit}>{branch.commit.slice(0, 12)}</CopyField>
              <CopyField label={copy.folder} value={branch.path}>{branch.path}</CopyField>
              <CopyField label={copy.files} value={branch.files.join("\n")}>
                <ul role="list">{branch.files.map((file) => <li key={file}>{file}</li>)}</ul>
              </CopyField>
              {command && <CopyField label={copy.log} value={command}>{command}</CopyField>}
            </dl>
            {api && <a className="btn" href={api.branchPatchUrl(invId, bug.id)} download>{copy.download}</a>}
          </>
        ) : (
          <>
            {note && <p className="alert">{note}</p>}
            <button type="button" className="btn" disabled={!api || busy} onClick={() => void remake()}>
              {busy ? copy.remaking : copy.remake}
            </button>
          </>
        )}
        {error && <p role="alert" className="alert">{error}</p>}
      </section>
      {branch && <ShareFix key={branch.commit} branch={branch} bugId={bug.id} invId={invId} saved={bug.fix.publish} onChanged={onChanged} />}
    </>
  );
}
