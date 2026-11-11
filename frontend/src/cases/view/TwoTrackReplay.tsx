import { LadderStrip } from "../../components/LadderStrip";
import { CHECK_STAMP, CHECK_STAMP_ON } from "../../content/caseView";
import { stampTilt } from "../../components/tilt";
import { ClockInspector } from "../../replay/ClockInspector";
import { EventCard } from "../../replay/EventCard";
import type { ReplayAction } from "../../replay/replayMachine";
import { EventTrack, Scrubber, type ActionSource } from "../../replay/Scrubber";
import type { TrackModel } from "../../replay/tracks";
import { anomalyIndexOf, type ReplayView } from "../../replay/view";
import { ResultShape } from "../library/ResultShape";
import type { SampleCase } from "../model";
import { VersionClockTrack, VersionLegend } from "./VersionClockTrack";

export interface TwoTrackReplayProps {
  readonly c: SampleCase;
  readonly view: ReplayView;
  readonly playing: boolean;
  readonly model: TrackModel;
  /** Text of the polite live region (the new event, debounced while dragging; empty until the first change). */
  readonly liveText: string;
  readonly onAction: (action: ReplayAction, source: ActionSource) => void;
  readonly onDragChange: (dragging: boolean) => void;
  /** Zone of the browser under test, for browser-side cases. */
  readonly systemZone?: string;
}

/**
 * The two-track Replay_Lab (Requirements 7.1 to 7.13, 22.2 to 22.6): the event card and the clock inspector of
 * the current event, then one scrubber over the event track and the version and clock track, the versions in
 * text, the rung strip, and one polite live region for both tracks. The case's mode label and sample label are
 * on the sheet around it (CaseView).
 */
export function TwoTrackReplay({ c, view, playing, model, liveText, onAction, onDragChange, systemZone }: TwoTrackReplayProps) {
  const { event, index, total } = view;
  const check = event.check;
  const checkVersion = check ? c.versions.find((v) => v.id === check.versionId) : undefined;
  return (
    <div className="two-track" data-case={c.id} data-index={index}>
      <div className="case-file__body">
        <EventCard event={event} total={total}>
          {check ? (
            <p className="event-card__check stamp" data-check-stamp="" data-result={check.result} style={stampTilt(`check-${c.id}-${event.id}`, 3)}>
              <ResultShape result={check.result} size={22} />
              <span>
                {CHECK_STAMP[check.result]} {CHECK_STAMP_ON} <span className="mono">{checkVersion?.label ?? check.versionId}</span>
              </span>
            </p>
          ) : null}
        </EventCard>
        <ClockInspector event={event} stream={c.stream} version={view.version} systemZone={systemZone} />
      </div>

      <Scrubber events={c.stream} index={index} playing={playing} valueText={view.ariaValueText} onAction={onAction} onDragChange={onDragChange}>
        <EventTrack events={c.stream} index={index} anomalyAt={anomalyIndexOf(c.stream)} />
        <VersionClockTrack model={model} index={index} />
      </Scrubber>

      <VersionLegend versions={c.versions} model={model} index={index} />

      <p className="visually-hidden" aria-live="polite" aria-atomic="true" data-replay-live="">
        {liveText}
      </p>

      <div className="case-file__verdict">
        <LadderStrip current={view.ladderRung} />
      </div>
    </div>
  );
}
