import { useEffect, useId, useRef, useState } from "react";
import { useApi } from "../../api/ApiProvider";
import { ApiError } from "../../api/client";
import type { FixBranch, GitHubPreview, Publish } from "../../api/types";
import { href } from "../../app/router";
import { useReadiness } from "../../app/SetupProvider";
import { sharingError } from "../../app/status";
import { FIX_SHARING as copy } from "../../content/copy";

type Action = "push" | "pr";
type Confirmation = { readonly action: Action; readonly branch: string; readonly destination: string; readonly user: string };

function ConfirmShare({ confirmation, onCancel, onConfirm }: {
  readonly confirmation: Confirmation;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const description = useId();
  const [checked, setChecked] = useState(false);
  const push = confirmation.action === "push";
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="case-share-dialog" aria-labelledby={heading} aria-describedby={description}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <form onSubmit={(event) => { event.preventDefault(); if (checked) onConfirm(); }}>
        <h5 id={heading}>{push ? copy.push : copy.pullRequest}</h5>
        <p id={description}>{push ? copy.confirmPush(confirmation.branch, confirmation.destination) : copy.confirmPr(confirmation.destination)}</p>
        <label className="case-share-dialog__check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.currentTarget.checked)} />
          {copy.acknowledgement}
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel}>{copy.cancel}</button>
          <button type="submit" className="btn btn--primary" disabled={!checked}>{copy.confirm}</button>
        </div>
      </form>
    </dialog>
  );
}

function githubPullUrl(url: string | null | undefined) {
  return url && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(url) ? url : null;
}

export function ShareFix({ branch, bugId, invId, saved, onChanged }: {
  readonly branch: FixBranch;
  readonly bugId: string;
  readonly invId: string;
  readonly saved?: Publish | null;
  readonly onChanged: () => Promise<void>;
}) {
  const { api } = useApi();
  const { status } = useReadiness();
  const githubUser = status?.github?.user;
  const id = useId();
  const [snapshot, setSnapshot] = useState<{ preview: GitHubPreview; reload: number; user: string | null | undefined } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [result, setResult] = useState<Publish | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.githubPreview(invId, bugId).then(
      (next) => { if (active) { setSnapshot({ preview: next, reload, user: githubUser }); setPreviewError(null); } },
      (err: unknown) => { if (active) setPreviewError(err instanceof ApiError ? sharingError(err.code, err.message) : String(err)); },
    );
    return () => { active = false; };
  }, [api, invId, bugId, reload, githubUser]);

  const preview = snapshot?.preview;
  const currentPreview = snapshot?.reload === reload && snapshot.user === githubUser;
  const records = [saved, result, preview?.published];
  const published = records.find((record) => record?.pr_url) ?? records.find(Boolean);
  const done = Boolean(published?.pr_url);
  const prUrl = githubPullUrl(published?.pr_url);
  const title = draftTitle ?? preview?.title ?? "";
  const body = draftBody ?? preview?.body ?? "";
  const fork = published?.fork ?? preview?.fork;
  const ready = Boolean(currentPreview && preview?.ready && !previewError && preview.branch === branch.name && preview.user
    && (githubUser === undefined || preview.user === githubUser));
  const canOpen = Boolean(ready && published && published.branch === branch.name && published.fork === preview?.fork && !done);

  function begin(action: Action) {
    if (!preview?.user || !ready || busy) return;
    const destination = action === "push" ? preview.fork : preview.upstream;
    if (!destination) return;
    setConfirmation({ action, branch: preview.branch, destination, user: preview.user });
  }

  async function share() {
    if (!api || !confirmation || busy) return;
    const { action, branch: confirmedBranch, user, destination } = confirmation;
    setConfirmation(null);
    const destinationNow = action === "push" ? preview?.fork : preview?.upstream;
    if (!ready || user !== preview?.user || destination !== destinationNow || confirmedBranch !== preview.branch) {
      setError(copy.errors.confirm_mismatch);
      return;
    }
    if (action === "push" ? published : !canOpen || !title.trim()) return;
    setBusy(action);
    setError(null);
    try {
      setResult(action === "push"
        ? await api.githubPush(invId, bugId, confirmedBranch)
        : await api.githubPullRequest(invId, bugId, title.trim(), body, confirmedBranch));
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? sharingError(err.code, err.message) : String(err));
    } finally {
      setReload((value) => value + 1);
      setBusy(null);
    }
  }

  const steps = [
    published ? copy.pushed(published.fork) : ready ? copy.ready : copy.waiting,
    done ? copy.prOpened : canOpen ? copy.ready : copy.waiting,
    done ? copy.success : copy.waiting,
  ];
  const current = done ? 2 : published ? 1 : 0;
  return (
    <section className="case-fix-section case-share" aria-labelledby={id}>
      <h5 id={id}>{copy.share}</h5>
      <ol role="list" className="case-share__steps">
        {steps.map((text, index) => (
          <li key={copy.steps[index]} aria-current={!done && index === current ? "step" : undefined} data-complete={done || index < current}>
            <strong>{copy.steps[index]}</strong>
            <span className="case-note">{text}</span>
          </li>
        ))}
      </ol>
      {prUrl && <a href={prUrl} target="_blank" rel="noreferrer">{copy.result}</a>}
      {api && !currentPreview && !previewError && <p role="status" className="case-note">{copy.loading}</p>}
      {previewError && <p role="alert" className="alert">{previewError}</p>}
      {preview && <>
        <dl className="facts case-share__preview" aria-label={copy.preview}>
          <div><dt>{copy.original}</dt><dd>{preview.upstream}</dd></div>
          <div><dt>{copy.fork}</dt><dd>{fork ?? copy.waitingFork}</dd></div>
          <div><dt>{copy.branchName}</dt><dd className="mono">{branch.name}</dd></div>
          <div><dt>{copy.files}</dt><dd className="mono"><ul role="list">{(preview.files.length ? preview.files : branch.files).map((file) => <li key={file}>{file}</li>)}</ul></dd></div>
        </dl>
        {!!preview.problems.length && <ul role="list" className="case-share__problems">{preview.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
        {!!preview.duplicates.length && (
          <aside className="case-wrapup" aria-label={copy.duplicates}>
            <p>{copy.duplicates}</p>
            <ul role="list">{preview.duplicates.map((duplicate) => {
              const url = githubPullUrl(duplicate.url);
              const description = duplicate.title || copy.prNumber(duplicate.number);
              return <li key={duplicate.number}>{url ? <a href={url} target="_blank" rel="noreferrer">{description}</a> : description}</li>;
            })}</ul>
          </aside>
        )}
      </>}
      {((preview && !preview.user) || githubUser === null) && !done && <a href={href({ page: "crew" })}>{copy.connect}</a>}
      {(previewError || error || (preview && !ready && !done)) && api && (
        <button type="button" className="btn btn--quiet" disabled={!!busy || (!currentPreview && !previewError)}
          onClick={() => { setError(null); setPreviewError(null); setReload((value) => value + 1); }}>{copy.retry}</button>
      )}
      {preview && !published && <button type="button" className="btn btn--primary" disabled={!ready || !preview.fork || !!busy}
        onClick={() => begin("push")}>{copy.push}</button>}
      {preview && published && !done && (
        <form className="case-share__pr" onSubmit={(event) => { event.preventDefault(); if (canOpen && title.trim()) begin("pr"); }}>
          <div className="field">
            <label htmlFor={`${id}-title`}>{copy.title}</label>
            <input id={`${id}-title`} value={title} onChange={(event) => setDraftTitle(event.currentTarget.value)} maxLength={200} required disabled={!!busy} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-body`}>{copy.description}</label>
            <textarea id={`${id}-body`} value={body} onChange={(event) => setDraftBody(event.currentTarget.value)} rows={6} maxLength={8000} disabled={!!busy} />
          </div>
          <button type="submit" className="btn btn--primary" disabled={!canOpen || !title.trim() || !!busy}>{copy.pullRequest}</button>
        </form>
      )}
      {busy && <p role="status">{busy === "push" ? copy.pushing : copy.opening}</p>}
      {error && <p role="alert" className="alert">{error}</p>}
      {confirmation && <ConfirmShare confirmation={confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => void share()} />}
    </section>
  );
}
