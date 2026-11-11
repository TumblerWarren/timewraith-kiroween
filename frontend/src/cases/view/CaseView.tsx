import { useMemo, useRef, useState } from "react";
import { useDirectorHost } from "../../animation/react/directorHost";
import { useProofMotion } from "../../animation/react/useProofMotion";
import { EvidenceLadder } from "../../components/EvidenceLadder";
import { paperTilt, stampTilt } from "../../components/tilt";
import { LINKS } from "../../config/links";
import {
  DRAFT_INTRO,
  DRAFT_TIME_CONTROL,
  illustrativeIntro,
  JACK_BROWSER_FACE_SERVER_CASE,
  JACK_DRAFT_FACES,
  JACK_SERVER_FACE_SERVER_CASE,
  SOURCE_NOTE_GENERIC,
} from "../../content/caseView";
import { BROWSER_NOT_SERVER, BROWSER_NOT_SERVER_EXPLANATION, NO_ANOMALY, REPLAY_SOURCE_LINK_LABEL, REPLAY_SOURCE_NOTE } from "../../content/copy";
import { CASE_MODE_BY_ID } from "../../content/modes";
import type { EvidenceStatusId } from "../../content/evidence";
import {
  CASE_HEADING,
  PROOF_BROWSER_FACE,
  PROOF_HASH_LABEL,
  PROOF_HASH_VALUE,
  PROOF_HEADING,
  PROOF_INTRO,
  PROOF_LADDER_NOTE,
  PROOF_LADDER_TITLE,
  PROOF_NEGATIVE_LEAD,
  PROOF_NEGATIVE_TAIL,
  PROOF_SERVER_FACE,
  REPLAY_SOURCE_LEAD,
  replayIntro,
} from "../../content/sections";
import { SYSTEM_ZONE } from "../../data/replay.stream";
import { Mascot } from "../../mascots/Mascot";
import { buildTracks } from "../../replay/tracks";
import { replayView } from "../../replay/view";
import { hasFixedPass } from "../fix/fixLabel";
import { SuggestedFix } from "../fix/SuggestedFix";
import type { DraftCase, SampleCase } from "../model";
import { useCaseStore } from "../store";
import { CaseHeader } from "./CaseHeader";
import { DraftCaseView } from "./DraftCaseView";
import { RevealPanel } from "./RevealPanel";
import { TimeControlNote } from "./TimeControlNote";
import { TwoTrackReplay } from "./TwoTrackReplay";
import { useReplay } from "./useReplay";
import { useReplayMotion } from "./useReplayMotion";
import { DraftTimeline, VersionTimeline } from "./VersionTimeline";

/**
 * One wing claw hooking over the folder's top edge (y = 8 in a 180 x 24 box that matches the Bat's width). The
 * Bat's lower wing tips sit at x = 42 and x = 138 of its 180-unit viewBox; the second claw is this one mirrored.
 */
const BAT_CLAW = "M34 2 C38 -1 45 1 46 7 C47 13 44 18 39 19 M44 3 C49 2 53 6 52 12 C51 16 48 18 46 18";

/** The bandage's loose end, from the foot of the strip out past the tag's right edge and down (64 x 48 box): three gentle curves. */
const BANDAGE_END = "M6 0 C8 10 14 16 22 16 C32 16 38 24 44 30 C50 36 54 40 58 44";

type Faces = { readonly browser: { title: string; text: string }; readonly server: { title: string; text: string } };

const isServerSide = (c: SampleCase) => c.stream.some((e) => e.serverClock !== "not controlled");

/** The sheet's dressing: the folder tab, Bat Scout peeking over the top edge with his claws in front. */
function SheetDressing({ tab, tabKey }: { readonly tab: string; readonly tabKey: string }) {
  return (
    <>
      <p className="case-file__tab stamp" style={stampTilt(tabKey, 3)}>
        {tab}
      </p>
      {/* Behind the paper: only the part above the top edge shows. The claws are in front of it. */}
      <div className="case-file__bat">
        <Mascot id="bat-scout" width={144} />
      </div>
      <svg className="case-file__claws" viewBox="0 0 180 24" focusable="false" aria-hidden="true">
        <path d={BAT_CLAW} />
        <path d={BAT_CLAW} transform="translate(180 0) scale(-1 1)" />
      </svg>
    </>
  );
}

/** The case-scoped proof: the ladder marking the current rung, Jack's panel with the case's time control, the hash tag. */
function CaseProof({ caseId, current, faces, timeControl, method }: { readonly caseId: string; readonly current?: EvidenceStatusId; readonly faces: Faces; readonly timeControl: string; readonly method: "browser" | "server" | "none" }) {
  const root = useRef<HTMLDivElement>(null);
  const host = useDirectorHost();
  // Parts start hidden ("armed") when motion is on and a director is mounted, so the animation never flashes the
  // finished state first. Fixed at mount: the attribute is removed by the effect, not re-rendered.
  const [armed] = useState(() => (host && !host.getEnv().reducedMotion ? "" : undefined));
  useProofMotion(root, caseId);
  return (
    <div className="case__proof" ref={root}>
      <div className="proof__intro">
        <h3 className="case__proof-title">{PROOF_HEADING}</h3>
        <p>{PROOF_INTRO}</p>
      </div>

      <div className="proof__layout">
        <div className="proof__ladder">
          <h4 className="proof__subhead">{PROOF_LADDER_TITLE}</h4>
          <p className="proof__note">{PROOF_LADDER_NOTE}</p>
          <div className="proof__scroll" style={paperTilt("proof-ladder-scroll", 0.4, 0)} data-armed={armed}>
            <span className="proof__rail-top" aria-hidden="true" />
            <div className="proof__raven" aria-hidden="true">
              <Mascot id="raven-archivist" width={80} decorative actor="case:ladder-raven" />
            </div>
            <span className="proof__rail-bottom" aria-hidden="true" />
            <EvidenceLadder current={current} />
          </div>
        </div>

        <div className="proof__side">
          <div className="jack-panel" role="group" aria-labelledby="jack-statement" style={paperTilt("proof-jack-panel", 0.5, 0)}>
            <div className="jack-panel__paper">
              <h4 id="jack-statement" className="jack-panel__statement">
                {BROWSER_NOT_SERVER}
              </h4>
              <p className="jack-panel__now" aria-hidden="true">
                <span data-now="browser">Browser side</span>
                <span data-now="server">Server side</span>
              </p>
              <div className="jack-panel__faces">
                <div className="jack-panel__face jack-panel__face--browser" data-face="browser">
                  <p className="jack-panel__face-title">{faces.browser.title}</p>
                  <p>{faces.browser.text}</p>
                  <span className="jack-panel__underline" aria-hidden="true" />
                </div>
                <div className="jack-panel__face jack-panel__face--server" data-face="server">
                  <p className="jack-panel__face-title">{faces.server.title}</p>
                  <p>{faces.server.text}</p>
                  <span className="jack-panel__underline" aria-hidden="true" />
                </div>
              </div>
            </div>
            {/* Jack carries the panel on his crossbar, his split head on the seam. */}
            <div className="jack-panel__jack">
              <Mascot id="two-faced-jack" width={136} />
            </div>
          </div>
          <p className="proof__explain">{BROWSER_NOT_SERVER_EXPLANATION}</p>
          <TimeControlNote text={timeControl} method={method} />

          <p className="proof__negative">
            {PROOF_NEGATIVE_LEAD} <q className="proof__quote">{NO_ANOMALY}</q>. {PROOF_NEGATIVE_TAIL}
          </p>

          <div className="proof__hash" data-armed={armed}>
            <div className="proof__mummy">
              <Mascot id="mummy-wrapper" width={64} />
            </div>
            <div className="proof__tag-wrap">
              <div className="proof__tag paper-piece" style={paperTilt("proof-hash-tag", 1.4, 2)}>
                <p className="proof__tag-label">{PROOF_HASH_LABEL}</p>
                <p className="proof__tag-value mono">{PROOF_HASH_VALUE}</p>
              </div>
              <span className="proof__bandage" aria-hidden="true">
                <span className="proof__bandage-wrap" />
                <span className="proof__bandage-turn" />
                <span className="proof__bandage-turn" />
                <svg className="proof__bandage-end" viewBox="0 0 64 48" focusable="false">
                  <path className="proof__bandage-edge" d={BANDAGE_END} />
                  <path className="proof__bandage-cloth" d={BANDAGE_END} />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A sample case: the case-file sheet with the two-track replay, the case-scoped proof and the suggested fix. */
export function SampleCaseView({ c }: { readonly c: SampleCase }) {
  const root = useRef<HTMLDivElement>(null);
  const replay = useReplay(c);
  const view = replayView(c, replay.state.index);
  const model = useMemo(() => buildTracks(c), [c]);
  const fixedPass = hasFixedPass(c);
  const serverSide = isServerSide(c);
  useReplayMotion(root, c, view.index, { dragging: replay.dragging });
  const isFullCalendar = c.issue.href === LINKS.issue7998.href;

  return (
    <div ref={root} className="case-view" data-case={c.id} data-mode={c.mode}>
      <p className="case-view__intro">{c.replayModeLabel === "Recorded replay" ? replayIntro(c.stream.length) : illustrativeIntro(c.stream.length)}</p>

      <article className="case-file paper-sheet" aria-labelledby="case-file-title" style={paperTilt("replay-case-file", 0.5, 0)} data-case-sheet="">
        <SheetDressing tab={c.replayModeLabel} tabKey="replay-folder-tab" />
        <CaseHeader c={c} revealed={view.revealed} fixedPass={fixedPass} />
        <VersionTimeline c={c} index={view.index} />

        {c.mode === "blind-hunt" ? (
          <RevealPanel c={c} revealed={view.revealed} />
        ) : (
          <p className="case-file__source">
            {isFullCalendar ? (
              <>
                <span className="case-file__source-note">{REPLAY_SOURCE_NOTE}</span> <span>{REPLAY_SOURCE_LEAD}</span>{" "}
                <a href={c.issue.href} rel="noreferrer">
                  {REPLAY_SOURCE_LINK_LABEL}
                </a>
                .
              </>
            ) : (
              <>
                <span className="case-file__source-note">{SOURCE_NOTE_GENERIC}</span>{" "}
                <span>{REPLAY_SOURCE_LEAD}</span>{" "}
                <a href={c.issue.href} rel="noreferrer">
                  {c.issue.label}
                </a>
                .
              </>
            )}
          </p>
        )}

        <TwoTrackReplay
          c={c}
          view={view}
          playing={replay.state.playing}
          model={model}
          liveText={replay.liveText}
          onAction={replay.apply}
          onDragChange={replay.setDragging}
          systemZone={serverSide ? undefined : isFullCalendar ? SYSTEM_ZONE : undefined}
        />

        {/* Stands on the bottom edge, past the right edge on wide screens, beak toward the strip. */}
        <div className="case-file__raven">
          <Mascot id="raven-archivist" width={88} />
        </div>
      </article>

      <CaseProof
        caseId={c.id}
        current={view.ladderRung}
        faces={serverSide ? { browser: JACK_BROWSER_FACE_SERVER_CASE, server: JACK_SERVER_FACE_SERVER_CASE } : { browser: PROOF_BROWSER_FACE, server: PROOF_SERVER_FACE }}
        timeControl={c.timeControl}
        method={serverSide ? "server" : "browser"}
      />

      <SuggestedFix c={c} revealed={view.revealed} />
    </div>
  );
}

/** A draft: the honest "Draft, not run" sheet, the unlit ladder, no replay and no suggested fix. */
export function DraftView({ d }: { readonly d: DraftCase }) {
  return (
    <div className="case-view" data-case={d.id} data-mode={d.mode} data-draft="">
      <p className="case-view__intro">{DRAFT_INTRO}</p>
      <article className="case-file paper-sheet" aria-labelledby="case-file-title" style={paperTilt("replay-case-file", 0.5, 0)} data-case-sheet="">
        <SheetDressing tab={CASE_MODE_BY_ID[d.mode].label} tabKey="draft-folder-tab" />
        <DraftCaseView d={d} />
        <DraftTimeline d={d} />
        <div className="case-file__raven">
          <Mascot id="raven-archivist" width={88} />
        </div>
      </article>
      <CaseProof caseId={d.id} faces={JACK_DRAFT_FACES} timeControl={DRAFT_TIME_CONTROL} method="none" />
    </div>
  );
}

/**
 * The Case_View (Requirements 22.1 to 22.9, 8.1 to 8.6, 16.1, 16.3): the selected case from the case store. The
 * region heading stays put (`#case-title`, focused by `openCase`); everything below it remounts when the
 * selection changes, which resets the replay to the first event (Requirement 22.9).
 */
export function CaseView() {
  const { selected } = useCaseStore();
  return (
    <>
      <div className="replay__intro">
        <h2 id="case-title" tabIndex={-1}>
          {CASE_HEADING}
        </h2>
      </div>
      {selected.kind === "draft" ? <DraftView key={selected.id} d={selected} /> : <SampleCaseView key={selected.id} c={selected} />}
    </>
  );
}
