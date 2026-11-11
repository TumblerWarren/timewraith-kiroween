import { useId } from "react";
import { EvidenceShape } from "../../components/EvidenceShape";
import { paperTilt, stampTilt } from "../../components/tilt";
import { DRAFT_NOT_RUN, ISSUE_HIDDEN, NOT_SAVED, REMOVE_DRAFT } from "../../content/copy";
import { EVIDENCE_BY_ID } from "../../content/evidence";
import { CASE_MODE_BY_ID } from "../../content/modes";
import { LIBRARY_OPEN_LABEL, LIBRARY_SAMPLE_LABEL } from "../../content/sections";
import { caseStatus, caseVersions, targetLine, visibleTitle, type Case } from "../model";
import { ModeShape } from "./ModeShape";
import { DraftShape } from "./ResultShape";
import { VersionHistoryStrip } from "./VersionHistoryStrip";

export const CARD_LABELS = {
  mode: "Mode",
  target: "Target",
  status: "Status",
  issue: "Issue",
  current: "Open in the case view",
} as const;

export interface CaseCardProps {
  readonly c: Case;
  readonly current: boolean;
  readonly onOpen: (id: string, card: HTMLElement | null) => void;
  readonly onRemove?: (id: string) => void;
}

/**
 * Case_Card (Requirements 21.2, 21.3, 21.7, 20.2, 20.7, 20.9, 25): one paper folder on the library shelf.
 * Title, mode tag with its shape, target in mono, status on the Evidence Ladder (label and shape) or the draft label
 * with the dashed draft page, the sample label, the Version_History_Strip, and the "Open case" button whose
 * accessible name includes the title (`aria-current="true"` on the current case). A Blind hunt card never shows its
 * issue: it reads "Issue hidden until the reveal". Drafts add "Remove draft" and, when storage failed, "Not saved".
 * All user text is rendered as React text, never as HTML. The folder itself is focusable (`tabindex="-1"`), so a new
 * draft's card can receive focus after submit.
 */
export function CaseCard({ c, current, onOpen, onRemove }: CaseCardProps) {
  const title = visibleTitle(c);
  // The DOM id is opaque (not derived from the case id): a Blind hunt card must not carry the hidden issue number in any attribute.
  const titleId = useId();
  const seed = `case-card-${c.id}`;
  const mode = CASE_MODE_BY_ID[c.mode];
  const status = caseStatus(c);
  const evidence = status === "draft-not-run" ? null : EVIDENCE_BY_ID[status];
  const isDraft = c.kind === "draft";

  let issue: { text: string; href?: string } | null = null;
  if (c.mode === "blind-hunt") issue = { text: ISSUE_HIDDEN };
  else if (c.kind === "sample") issue = { text: c.issue.label, href: c.issue.href };
  else if (c.issueUrl) issue = { text: c.issueUrl };

  return (
    <article
      className={["case-card", "paper-sheet", "theme-paper", isDraft ? "case-card--draft" : "case-card--sample", current ? "case-card--current" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={titleId}
      tabIndex={-1}
      style={paperTilt(seed, 1.2, 2)}
      data-current={current ? "true" : "false"}
    >
      {/* The folder tab; the current case's tab is pinned to the shelf wall. */}
      <span className="case-card__tab" aria-hidden="true">
        {current ? <span className="case-card__pin" /> : null}
      </span>

      {isDraft ? (
        <p className="case-card__sample case-card__sample--draft stamp" style={stampTilt(`${seed}-draft`, 2.5)}>
          <DraftShape size={20} />
          {DRAFT_NOT_RUN}
          {/* Skeleton Scribe's pen stroke under the label; `case.draft-create` draws it in (task 14.2). Decorative. */}
          <svg className="case-card__underline" viewBox="0 0 120 10" preserveAspectRatio="none" focusable="false" aria-hidden="true" data-draft-underline="">
            <path d="M2 6 C20 2 34 8 54 5 S90 3 118 6" />
          </svg>
        </p>
      ) : (
        <p className="case-card__sample stamp" style={stampTilt(`${seed}-sample`, 2.5)}>
          {LIBRARY_SAMPLE_LABEL}
        </p>
      )}

      <h3 id={titleId} className="case-card__title">
        {title}
      </h3>

      <dl className="case-card__facts">
        <div>
          <dt>{CARD_LABELS.mode}</dt>
          <dd className="case-card__mode" data-mode={mode.id}>
            <ModeShape shape={mode.shape} size={24} />
            <span>{mode.label}</span>
          </dd>
        </div>
        <div>
          <dt>{CARD_LABELS.target}</dt>
          <dd className="case-card__target mono">{targetLine(c.target)}</dd>
        </div>
        {issue ? (
          <div>
            <dt>{CARD_LABELS.issue}</dt>
            <dd className={issue.href || c.mode === "blind-hunt" ? "case-card__issue" : "case-card__issue mono"} data-issue-hidden={c.mode === "blind-hunt" ? "true" : undefined}>
              {issue.href ? (
                <a href={issue.href} rel="noreferrer">
                  {issue.text}
                </a>
              ) : (
                issue.text
              )}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{CARD_LABELS.status}</dt>
          {evidence ? (
            <dd className="case-card__status" data-status={evidence.id}>
              <EvidenceShape shape={evidence.shape} size={24} />
              <span>{evidence.label}</span>
            </dd>
          ) : (
            <dd className="case-card__status case-card__status--draft" data-status="draft-not-run">
              <DraftShape size={24} />
              <span>Not run</span>
            </dd>
          )}
        </div>
      </dl>

      <VersionHistoryStrip versions={caseVersions(c)} caseId={c.id} />

      {isDraft && !c.saved ? (
        <p className="case-card__unsaved" role="note">
          <span className="case-card__unsaved-mark" aria-hidden="true">
            !
          </span>
          {NOT_SAVED}
        </p>
      ) : null}

      <div className="case-card__actions">
        <button
          type="button"
          className="btn case-card__open"
          aria-current={current ? "true" : undefined}
          onClick={(e) => onOpen(c.id, e.currentTarget.closest("article"))}
        >
          {LIBRARY_OPEN_LABEL}
          <span className="visually-hidden">: {title}</span>
          {current ? <span className="visually-hidden"> ({CARD_LABELS.current})</span> : null}
        </button>
        {isDraft && onRemove ? (
          <button type="button" className="btn case-card__remove" onClick={() => onRemove(c.id)}>
            {REMOVE_DRAFT}
            <span className="visually-hidden">: {title}</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
