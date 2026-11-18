import { useEffect, useId, useRef, useState } from "react";
import { useApi } from "../../api/ApiProvider";
import { ApiError } from "../../api/client";
import type { Contribution, FixBranch, GitHubPreview, Publish } from "../../api/types";
import { href } from "../../app/router";
import { useReadiness } from "../../app/SetupProvider";
import { sharingError } from "../../app/status";
import { CONTRIBUTION, FIX_SHARING as copy } from "../../content/copy";
import { ContributionReview } from "./ContributionReview";

type Action = "push" | "pr" | "update";
type Confirmation = {
  readonly action: Action;
  readonly branch: string;
  readonly destination: string;
  readonly user: string;
  readonly duplicateKey: string;
  readonly preparedAt: string;
  readonly commit: string;
  readonly pullUrl: string | null;
  readonly pullNumber: number | null;
};

const actionLabels = { push: copy.push, pr: copy.pullRequest, update: copy.update };
const progressLabels = { push: copy.pushing, pr: copy.opening, update: copy.updating };

function ConfirmShare({ confirmation, onCancel, onConfirm }: {
  readonly confirmation: Confirmation;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const description = useId();
  const [checked, setChecked] = useState(false);
  const { action, branch, destination, pullNumber } = confirmation;
  const message = {
    push: copy.confirmPush(branch, destination),
    pr: copy.confirmPr(destination),
    update: copy.confirmUpdate(branch, destination, pullNumber),
  }[action];
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="case-share-dialog" aria-labelledby={heading} aria-describedby={description}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <form onSubmit={(event) => { event.preventDefault(); if (checked) onConfirm(); }}>
        <h5 id={heading}>{actionLabels[action]}</h5>
        <p id={description}>{message}</p>
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

function PublishedPullRequest({ published, url }: { readonly published: Publish; readonly url: string }) {
  const updatedAt = published.updated_at;
  const date = updatedAt ? new Date(updatedAt) : null;
  const readableDate = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : updatedAt;
  return (
    <div className="case-share__published">
      <a href={url} target="_blank" rel="noreferrer">{copy.result}</a>
      <div className="case-share__history" aria-live="polite">
        <dl className="case-share__history-facts">
          <div><dt>{copy.updateCount}</dt><dd>{published.updates ?? 0}</dd></div>
          {updatedAt && <div><dt>{copy.updatedAt}</dt><dd><time dateTime={updatedAt}>{readableDate}</time></dd></div>}
        </dl>
        {published.update_note && <p className="case-share__update-note">{published.update_note}</p>}
      </div>
    </div>
  );
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
  const [snapshot, setSnapshot] = useState<{ preview: GitHubPreview; reload: number; commit: string; user: string | null | undefined } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [result, setResult] = useState<Publish | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<Action | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [prepared, setPrepared] = useState<Contribution | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ preparedAt: string; title: string; body: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.githubPreview(invId, bugId).then(
      (next) => { if (active) { setSnapshot({ preview: next, reload, commit: branch.commit, user: githubUser }); setPreviewError(null); } },
      (err: unknown) => { if (active) setPreviewError(err instanceof ApiError ? sharingError(err.code, err.message) : String(err)); },
    );
    return () => { active = false; };
  }, [api, invId, bugId, reload, githubUser, branch.commit]);

  const preview = snapshot?.preview;
  const currentPreview = snapshot?.reload === reload && snapshot.user === githubUser && snapshot.commit === branch.commit;
  const records = [result, saved, preview?.published].filter((record) => record != null);
  // An update response can be newer than the case or preview while they refresh.
  const [published] = records.sort((a, b) =>
    Number(Boolean(b.pr_url)) - Number(Boolean(a.pr_url)) || (b.updates ?? 0) - (a.updates ?? 0));
  const done = Boolean(published?.pr_url);
  const prUrl = githubPullUrl(published?.pr_url);
  const savedContribution = preview?.contribution ?? branch.contribution;
  const contribution = prepared && (!savedContribution || prepared.prepared_at >= savedContribution.prepared_at)
    ? prepared : savedContribution;
  const preparedAt = contribution?.prepared_at ?? "";
  const currentDraft = draft?.preparedAt === preparedAt ? draft : null;
  const title = currentDraft?.title ?? contribution?.title ?? "";
  const body = currentDraft?.body ?? contribution?.body ?? "";
  const fork = published?.fork ?? preview?.fork;
  const duplicates = preview?.duplicates ?? [];
  const duplicateKey = JSON.stringify([preview?.upstream, preview?.user, ...duplicates.map(({ url }) => url).sort()]);
  const readDuplicates = duplicates.length > 0 && acknowledged === duplicateKey;
  const connectMessage = copy.errors.github_not_connected;
  const updateAvailable = Boolean(done && preview?.update?.available);
  const needsGitHub = (!done || updateAvailable)
    && ((preview && !preview.user) || githubUser === null || previewError === connectMessage || error === connectMessage);
  const problems = preview?.problems.filter((problem) => !needsGitHub || !/^Connect GitHub on the Crew page[.!]?$/i.test(problem.trim())) ?? [];
  const warnings = preview?.warnings ?? [];
  const checksPass = contribution && !contribution.rules.archived && contribution.checks.every((check) => check.passed || check.preexisting);
  const ready = Boolean(currentPreview && preview?.ready && !previewError && preview.branch === branch.name && preview.user
    && (githubUser === undefined || preview.user === githubUser)
    && checksPass && !checkFailed
    && (preview.contribution === undefined || preview.contribution?.prepared_at === preparedAt));
  const readyToPublish = ready && (!duplicates.length || readDuplicates);
  const canPush = readyToPublish && Boolean(preview?.fork) && !published;
  const canOpen = Boolean(readyToPublish && published && published.branch === branch.name && published.fork === preview?.fork && !done);
  const ownsFork = published?.fork.toLowerCase() === preview?.fork?.toLowerCase();
  const canUpdate = Boolean(ready && updateAvailable && prUrl && published?.branch === branch.name && ownsFork);
  const showContributionCheck = done
    ? Boolean(preview?.update && (!updateAvailable || !checksPass || checkFailed))
    : !published || !contribution;
  const allowed = { push: canPush, pr: canOpen, update: canUpdate };

  function begin(action: Action) {
    if (!preview?.user || !allowed[action] || busy || (action !== "push" && !title.trim())) return;
    const destination = action === "push" ? preview.fork : preview.upstream;
    if (!destination) return;
    setConfirmation({
      action, branch: preview.branch, destination, user: preview.user, duplicateKey, preparedAt,
      commit: branch.commit, pullUrl: prUrl, pullNumber: published?.pr_number ?? null,
    });
  }

  async function checkContribution() {
    if (!api || busy) return;
    setBusy("check");
    setError(null);
    try {
      setPrepared(await api.prepareContribution(invId, bugId));
      setDraft(null);
      setCheckFailed(false);
      await onChanged();
    } catch (err) {
      setCheckFailed(true);
      setError(err instanceof ApiError ? sharingError(err.code, err.message) : String(err));
    } finally {
      setReload((value) => value + 1);
      setBusy(null);
    }
  }

  async function generateDescription() {
    if (!api || busy || generating) return;
    setGenerating(true);
    setError(null);
    setGeneratedNote(null);
    try {
      const next = await api.generateDescription(invId, bugId);
      setDraft({ preparedAt, title: next.title, body: next.body });
      setGeneratedNote(copy.generated(next.template));
    } catch (err) {
      setError(err instanceof ApiError ? sharingError(err.code, err.message) : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function share() {
    if (!api || !confirmation || busy) return;
    const { action, branch: confirmedBranch, user, destination } = confirmation;
    setConfirmation(null);
    const destinationNow = action === "push" ? preview?.fork : preview?.upstream;
    if (!allowed[action] || !preview || user !== preview.user || destination !== destinationNow || confirmedBranch !== preview.branch
      || confirmation.commit !== branch.commit || confirmation.preparedAt !== preparedAt
      || (action === "update" ? confirmation.pullUrl !== prUrl : confirmation.duplicateKey !== duplicateKey)) {
      setError(copy.errors.confirm_mismatch);
      return;
    }
    if (action !== "push" && !title.trim()) return;
    setBusy(action);
    setError(null);
    try {
      switch (action) {
        case "push":
          setResult(await api.githubPush(invId, bugId, confirmedBranch, readDuplicates));
          break;
        case "pr":
          setResult(await api.githubPullRequest(invId, bugId, title.trim(), body, confirmedBranch, readDuplicates));
          break;
        case "update":
          setResult(await api.githubUpdate(invId, bugId, title.trim(), body, confirmedBranch));
          break;
      }
      await onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === "duplicate_exists") setAcknowledged(null);
      setError(err instanceof ApiError ? sharingError(err.code, err.message) : String(err));
    } finally {
      setReload((value) => value + 1);
      setBusy(null);
    }
  }

  const steps = [
    published ? copy.pushed(published.fork) : readyToPublish ? copy.ready : copy.waiting,
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
      {prUrl && published && <PublishedPullRequest published={published} url={prUrl} />}
      {showContributionCheck && (
        <button type="button" className="btn" disabled={!api || !!busy} onClick={() => void checkContribution()}>
          {busy === "check" ? CONTRIBUTION.checking : done && contribution ? CONTRIBUTION.recheck : CONTRIBUTION.check}
        </button>
      )}
      {busy === "check" && <p role="status" className="case-note">{CONTRIBUTION.busyHelp}</p>}
      {contribution && <ContributionReview contribution={contribution} />}
      {warnings.length > 0 && (
        <aside className="case-wrapup" aria-label={CONTRIBUTION.warnings}>
          <p>{CONTRIBUTION.warnings}</p>
          <ul role="list">{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
        </aside>
      )}
      {api && !currentPreview && !previewError && <p role="status" className="case-note">{copy.loading}</p>}
      {previewError && (!needsGitHub || previewError !== connectMessage) && <p role="alert" className="alert">{previewError}</p>}
      {preview && <>
        <dl className="facts case-share__preview" aria-label={copy.preview}>
          <div><dt>{copy.original}</dt><dd>{preview.upstream}</dd></div>
          <div><dt>{copy.fork}</dt><dd>{fork ?? copy.waitingFork}</dd></div>
          <div><dt>{copy.branchName}</dt><dd className="mono">{branch.name}</dd></div>
          <div><dt>{copy.files}</dt><dd className="mono"><ul role="list">{(preview.files.length ? preview.files : branch.files).map((file) => <li key={file}>{file}</li>)}</ul></dd></div>
        </dl>
        {problems.length > 0 && <ul role="list" className="case-share__problems">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
        {duplicates.length > 0 && (
          <aside className="case-wrapup" aria-label={copy.duplicates}>
            <p>{copy.duplicates}</p>
            <ul role="list">{duplicates.map((duplicate) => {
              const url = githubPullUrl(duplicate.url);
              const description = duplicate.title || copy.prNumber(duplicate.number);
              return <li key={duplicate.number}>{url ? <a href={url} target="_blank" rel="noreferrer">{description}</a> : description}</li>;
            })}</ul>
            {!done && <label className="case-share-dialog__check">
              <input type="checkbox" checked={readDuplicates} disabled={!!busy || !currentPreview}
                onChange={(event) => setAcknowledged(event.currentTarget.checked ? duplicateKey : null)} />
              {copy.readDuplicates}
            </label>}
          </aside>
        )}
      </>}
      {needsGitHub && <a href={href({ page: "crew" })}>{copy.connect}</a>}
      {(previewError || error || (preview && !preview.ready && (!done || updateAvailable))) && api && (
        <button type="button" className="btn btn--quiet" disabled={!!busy || (!currentPreview && !previewError)}
          onClick={() => { setError(null); setPreviewError(null); setReload((value) => value + 1); }}>{copy.retry}</button>
      )}
      {preview && !published && <button type="button" className="btn btn--primary" disabled={!canPush || !!busy}
        onClick={() => begin("push")}>{copy.push}</button>}
      {((contribution && !done) || updateAvailable) && (
        <form className="case-share__pr" onSubmit={(event) => { event.preventDefault(); begin(done ? "update" : "pr"); }}>
          {updateAvailable && <p className="case-note">{preview?.update?.reason}</p>}
          {updateAvailable && preview?.user && !ownsFork && <p className="case-note">{copy.errors.not_your_fork}</p>}
          <div className="field">
            <label htmlFor={`${id}-title`}>{copy.title}</label>
            <input id={`${id}-title`} value={title} onChange={(event) => setDraft({ preparedAt, title: event.currentTarget.value, body })} maxLength={200} required disabled={!!busy} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-body`}>{copy.description}</label>
            <textarea id={`${id}-body`} value={body} onChange={(event) => { setGeneratedNote(null); setDraft({ preparedAt, title, body: event.currentTarget.value }); }} rows={6} maxLength={8000} disabled={!!busy || generating} />
            <button type="button" className="btn btn--quiet" disabled={!api || !!busy || generating} onClick={() => void generateDescription()}>
              {generating ? copy.generating : copy.generate}
            </button>
            {generatedNote && <p role="status" className="case-note">{generatedNote}</p>}
          </div>
          {published && <button type="submit" className="btn btn--primary" disabled={!(done ? canUpdate : canOpen) || !title.trim() || !!busy}>
            {done ? copy.update : copy.pullRequest}
          </button>}
        </form>
      )}
      {busy && busy !== "check" && <p role="status">{progressLabels[busy]}</p>}
      {error && (!needsGitHub || error !== connectMessage) && <p role="alert" className="alert">{error}</p>}
      {confirmation && <ConfirmShare confirmation={confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => void share()} />}
    </section>
  );
}
