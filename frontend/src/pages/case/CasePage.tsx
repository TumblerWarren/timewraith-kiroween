import { useState } from "react";
import { useApi } from "../../api/ApiProvider";
import { ApiError } from "../../api/client";
import { FINAL_STAGES, type Investigation } from "../../api/types";
import { caseHref, href, navigate, type CaseTab } from "../../app/router";
import { caseState, pendingFixes, suggestedRef } from "../../app/status";
import { liveFromSummary, liveTitle, targetLine, type DraftCase, type LiveCase } from "../../cases/model";
import { useCaseStore } from "../../cases/store";
import { DeleteCaseButton } from "../../cases/DeleteCaseButton";
import { summaryOf, useInvestigation } from "../../cases/useInvestigation";
import { DraftCaseView } from "../../cases/view/DraftCaseView";
import { CASE_PAGE } from "../../content/app";
import { FLOW_STEPS } from "../../content/flow";
import { CASE_MODE_BY_ID } from "../../content/modes";
import { ModeShape } from "../../cases/library/ModeShape";
import { CaseTabs, Counters, StatusBanner, Stepper, stepStates } from "./parts";
import { ActivityTab, FindingsTab, FixesTab, OverviewTab, PlanTab } from "./tabs";
import { CaseDisclosure } from "./CaseDisclosure";
import { KiroAccountBanner, NowStrip } from "./LiveCaseDetails";

function Back() {
  return (
    <p className="crumb">
      <a href={href({ page: "cases" })}>← {CASE_PAGE.back}</a>
    </p>
  );
}

function Meta({ c, inv }: { readonly c: LiveCase | DraftCase; readonly inv: Investigation | null }) {
  const mode = CASE_MODE_BY_ID[c.mode];
  const ref = inv?.target.ref ?? c.target.version.value;
  const revision = inv?.target.revision ?? (c.kind === "live" ? c.summary.target.revision : null);
  const shortRef = /^[a-f0-9]{40}$/i.test(ref) ? ref.slice(0, 12) : ref;
  const pin = revision && revision !== ref ? `${shortRef} @ ${revision.slice(0, 12)}` : shortRef;
  return (
    <ul role="list" className="meta">
      <li>
        <ModeShape shape={mode.shape} size={18} /> {mode.label}
      </li>
      <li className="mono" title={revision && revision !== ref ? `${ref} @ ${revision}` : ref}>{pin}</li>
      {c.area ? <li>{c.area}</li> : null}
      {c.kind === "live" ? <li>{inv?.runtime_label ?? c.summary.runtime_label}</li> : null}
    </ul>
  );
}

function DraftCasePage({ d }: { readonly d: DraftCase }) {
  const state = caseState(d);
  return (
    <article className="page page--case" aria-labelledby="page-title">
      <Back />
      <header className="page__head">
        <h1 id="page-title" className="page__title mono-title" tabIndex={-1}>
          {targetLine(d.target)}
        </h1>
        <Meta c={d} inv={null} />
      </header>
      <StatusBanner state={state} />
      <div className="panel">
        <DraftCaseView d={d} />
      </div>
      <DeleteCaseButton c={d} leavePage />
    </article>
  );
}

function LiveCasePage({ id, tab, known }: { readonly id: string; readonly tab: CaseTab; readonly known: LiveCase | null }) {
  const { api, health } = useApi();
  const { upsertLive } = useCaseStore();
  // Loads at once, without waiting for the health check; an unreachable backend shows as an error.
  const { inv, events, error, notFound, refresh } = useInvestigation(id);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const c: LiveCase | null = inv ? liveFromSummary(summaryOf(inv), known?.area) : known;
  if (!c) {
    return (
      <article className="page page--case" aria-labelledby="page-title">
        <Back />
        <h1 id="page-title" className="page__title" tabIndex={-1}>
          {notFound ? "Case not found" : CASE_PAGE.loading}
        </h1>
        <p className="muted-note">{notFound ? CASE_PAGE.notFound : error ? CASE_PAGE.offline : CASE_PAGE.loading}</p>
      </article>
    );
  }

  const maxAttempts = health?.limits?.fix_attempts ?? 3;
  const state = caseState(c, inv, maxAttempts, events);
  const stage = inv?.stage ?? c.summary.stage;
  const running = !FINAL_STAGES.includes(stage);
  const currentStep = FLOW_STEPS.find((step) => step.id === (inv?.phase ?? c.summary.phase));

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Open the same case again, optionally on another ref. */
  const retry = (ref?: string) =>
    act(async () => {
      if (!api || !inv) return;
      const summary = await api.create({ ...inv.request, ...(ref ? { ref } : {}) });
      upsertLive(summary, c.area);
      navigate(caseHref(summary.id));
    });

  const message = inv?.notes[inv.notes.length - 1] ?? c.summary.message;
  const nextRef = stage === "failed" ? suggestedRef(message) : null;
  const pending = pendingFixes(inv);
  const bannerState = state.id === "waiting" && stage === "completed" && pending > 0
    ? { ...state, detail: pending === 1 ? "One verified fix is ready for your decision." : `${pending} verified fixes are ready for your decision.` }
    : state;

  const actions = (
    <>
      {stage === "awaiting-plan-approval" && tab !== "plan" ? (
        <a className="btn btn--primary" href={caseHref(id, "plan")}>
          {CASE_PAGE.reviewPlan}
        </a>
      ) : null}
      {pending > 0 && tab !== "fixes" ? (
        <a className="btn btn--primary" href={caseHref(id, "fixes")}>
          {CASE_PAGE.reviewFixes}
        </a>
      ) : null}
      {stage === "failed" && api && inv ? (
        nextRef ? (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void retry(nextRef)}>
            {CASE_PAGE.retryWith(nextRef)}
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => void retry()}>
            {CASE_PAGE.retry}
          </button>
        )
      ) : null}
      {running && api ? (
        <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => void act(() => api.cancel(id))}>
          {CASE_PAGE.cancel}
        </button>
      ) : null}
    </>
  );

  return (
    <article className="page page--case" aria-labelledby="page-title" data-case={id}>
      <Back />
      <header className="page__head">
        <h1 id="page-title" className="page__title mono-title" tabIndex={-1}>
          {liveTitle(c)}
        </h1>
        <Meta c={c} inv={inv} />
      </header>

      <StatusBanner state={bannerState}>{actions}</StatusBanner>
      {running && <NowStrip events={events} fallback={bannerState.detail} />}
      <KiroAccountBanner notes={inv?.notes ?? []} events={events} />
      {actionError ? (
        <p className="alert" role="alert">
          {actionError}
        </p>
      ) : null}
      {error && inv ? <p className="alert">{CASE_PAGE.offline}</p> : null}

      <CaseTabs
        id={id}
        tab={tab}
        counts={{
          plan: inv?.test_plan?.experiments.length,
          findings: inv ? inv.bugs.length + (inv.intended?.length ?? 0) : undefined,
          fixes: pending || undefined,
          activity: events.length || undefined,
        }}
      />
      <div className="tab-panel">
        {!inv ? (
          <p className="muted-note">{error ?? CASE_PAGE.loading}</p>
        ) : tab === "plan" ? (
          <PlanTab inv={inv} busy={busy} onApprove={() => api && void act(() => api.approvePlan(id))} />
        ) : tab === "findings" ? (
          <FindingsTab inv={inv} events={events} />
        ) : tab === "fixes" ? (
          <FixesTab inv={inv} events={events} onChanged={refresh} />
        ) : tab === "activity" ? (
          <ActivityTab inv={inv} events={events} />
        ) : (
          <div className="tab-stack">
            <OverviewTab inv={inv} />
            <CaseDisclosure label={running && currentStep ? `Run details · ${currentStep.sign} (${currentStep.index} of ${FLOW_STEPS.length})` : "Run details"}>
              <Stepper states={stepStates(inv.phase, stage, inv.bugs.length)} inv={inv} />
              <Counters inv={inv} running={running} limits={health?.limits ?? null} />
            </CaseDisclosure>
          </div>
        )}
      </div>
      <DeleteCaseButton c={c} leavePage />
    </article>
  );
}

/** `#/cases/:id[/tab]`: a draft from this browser, or a live investigation from the backend. */
export function CasePage({ id, tab }: { readonly id: string; readonly tab: CaseTab }) {
  const { drafts, live } = useCaseStore();
  const draft = drafts.find((d) => d.id === id);
  if (draft) return <DraftCasePage d={draft} />;
  return <LiveCasePage key={id} id={id} tab={tab} known={live.find((c) => c.id === id) ?? null} />;
}
