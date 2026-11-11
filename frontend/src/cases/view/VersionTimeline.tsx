import { paperTilt } from "../../components/tilt";
import {
  TIMELINE_DATE_LINK,
  TIMELINE_DRAFT_LABEL,
  TIMELINE_FIXED_PASS_TEXT,
  TIMELINE_HIDDEN_TEXT,
  TIMELINE_NO_DATE,
  TIMELINE_NOTE,
  TIMELINE_PIN_TEXT,
  TIMELINE_STATE_TEXT,
  TIMELINE_TITLE,
  timelineEventText,
} from "../../content/caseView";
import { DRAFT_NOT_RUN } from "../../content/copy";
import { draftVersions, type DraftCase, type MilestoneKind, type MilestoneState, type SampleCase } from "../model";
import { isHistoryKind, timelineView, type MilestoneView } from "./timeline";

/** What each milestone is called, whatever the case (the case's own wording sits in the detail line). */
export const MILESTONE_NAME: Readonly<Record<MilestoneKind, string>> = {
  released: "Version released",
  reported: "Issue reported",
  reproduced: "Reproduced on the affected version",
  "fix-suggested": "Fix suggested",
  "fixed-verified": "Fixed version verified",
};

/** The state as a shape: filled ring with a check, open ring, dashed ring, folded corner. Never color alone. */
function MilestoneRing({ state }: { readonly state: MilestoneState }) {
  return (
    <svg className="vtl__ring" viewBox="0 0 28 28" width={28} height={28} focusable="false" aria-hidden="true" data-ring={state}>
      {state === "hidden" ? (
        <>
          <path className="vtl__shape" d="M5 4 H17 L23 10 V24 H5 Z" />
          <path className="vtl__fold" d="M17 4 V10 H23" />
        </>
      ) : (
        <>
          <circle className="vtl__shape" cx="14" cy="14" r="10" />
          {state === "reached" ? <path className="vtl__check" d="M8.5 14.5 L12.5 18.5 L19.5 9.5" /> : null}
        </>
      )}
    </svg>
  );
}

function MilestoneDetail({ c, v }: { readonly c: SampleCase; readonly v: MilestoneView }) {
  const { milestone: m, state } = v;
  const version = c.versions.find((x) => x.id === m.versionId);
  const modeText = c.replayModeLabel === "Illustrative replay" ? "Illustrative replay" : "Sample replay";

  if (state === "hidden") return <p className="vtl__detail">{TIMELINE_HIDDEN_TEXT}</p>;

  if (isHistoryKind(m)) {
    return (
      <>
        <p className="vtl__detail">{m.label}</p>
        {m.illustrativePin ? <p className="vtl__detail">{TIMELINE_PIN_TEXT}</p> : null}
        {m.date ? (
          <p className="vtl__detail">
            <a className="mono" href={m.date.href} rel="noreferrer" data-date-source={m.date.source}>
              <time dateTime={m.date.value}>{m.date.value}</time>
            </a>{" "}
            <span className="vtl__source">{TIMELINE_DATE_LINK[m.date.source]}</span>
          </p>
        ) : (
          <p className="vtl__detail">{TIMELINE_NO_DATE}</p>
        )}
      </>
    );
  }

  return (
    <>
      {version ? <p className="vtl__detail mono">{version.label}</p> : null}
      {m.eventId !== null && state !== "not-run" ? <p className="vtl__detail">{timelineEventText(modeText, m.eventId)}</p> : null}
      {m.kind === "fixed-verified" && m.eventId !== null ? <p className="vtl__detail">{`${TIMELINE_FIXED_PASS_TEXT} (${modeText.toLowerCase()})`}</p> : null}
      {state === "not-run" && m.notRunText ? <p className="vtl__detail">{m.notRunText}</p> : null}
    </>
  );
}

export interface VersionTimelineProps {
  readonly c: SampleCase;
  readonly index: number;
}

/**
 * Version_Timeline (design D21; Requirement 28): five milestones on a branch of the Timeline_Thread, an ordered
 * list so order and state are DOM text. The state of every milestone comes from `timelineView(c, index)`.
 * Hook points of `timeline.milestone`: `[data-milestone]` items with `.vtl__ring`, `.vtl__state` and `.vtl__seg`.
 */
export function VersionTimeline({ c, index }: VersionTimelineProps) {
  const views = timelineView(c, index);
  return (
    <section className="vtl" aria-labelledby="vtl-title" style={paperTilt(`vtl-${c.id}`, 0.3, 0)} data-timeline="">
      <h4 id="vtl-title" className="vtl__title">
        {TIMELINE_TITLE}
      </h4>
      <p className="vtl__note">{TIMELINE_NOTE}</p>
      <ol className="vtl__list">
        {views.map((v) => (
          <li key={v.milestone.kind} className="vtl__item" data-milestone={v.milestone.kind} data-state={v.state}>
            <span className="vtl__seg" aria-hidden="true" />
            <MilestoneRing state={v.state} />
            <div className="vtl__body">
              <p className="vtl__name">{MILESTONE_NAME[v.milestone.kind]}</p>
              <p className="vtl__state" data-state-text="">
                {TIMELINE_STATE_TEXT[v.state]}
              </p>
              <MilestoneDetail c={c} v={v} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A draft shows one row: what the visitor entered, never run (Requirements 25.3, 28.10). */
export function DraftTimeline({ d }: { readonly d: DraftCase }) {
  const version = draftVersions(d)[0];
  return (
    <section className="vtl vtl--draft" aria-labelledby="vtl-title" data-timeline="">
      <h4 id="vtl-title" className="vtl__title">
        {TIMELINE_TITLE}
      </h4>
      <ol className="vtl__list">
        <li className="vtl__item" data-milestone="draft" data-state="not-run">
          <MilestoneRing state="not-run" />
          <div className="vtl__body">
            <p className="vtl__name">{TIMELINE_DRAFT_LABEL}</p>
            {version ? <p className="vtl__detail mono">{version.label}</p> : null}
            <p className="vtl__detail">{DRAFT_NOT_RUN}</p>
          </div>
        </li>
      </ol>
    </section>
  );
}
