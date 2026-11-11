import type { CSSProperties } from "react";
import { RESULT_WORDS, ResultShape } from "../library/ResultShape";
import { CURRENT_MARK, VERSION_ROLE_TEXT, VERSION_TRACK_LABEL } from "../../content/caseView";
import { ILLUSTRATIVE_PIN } from "../../content/copy";
import { indexToFraction } from "../../replay/replayMachine";
import { TRACK_PAD_PX, trackLeft } from "../../replay/Scrubber";
import type { TrackModel, VersionRun } from "../../replay/tracks";
import type { VersionEntry, VersionRole } from "../model";

const isFixedRole = (role: VersionRole) => role === "fixed" || role === "patched";

/** Band span: half a peg spacing either side of the run's first and last pegs, inside the track. */
function bandStyle(run: VersionRun, total: number): CSSProperties {
  const step = total > 1 ? 1 / (total - 1) : 1;
  const lf = Math.max(0, indexToFraction(run.from, total) - step / 2);
  const rf = Math.min(1, indexToFraction(run.to, total) + step / 2);
  return { left: trackLeft(lf), width: `calc(${rf - lf} * (100% - ${2 * TRACK_PAD_PX}px))` };
}

export interface VersionClockTrackProps {
  readonly model: TrackModel;
  readonly index: number;
}

/**
 * The version and clock track (design: "Two tracks, one timeline"; Requirements 22.2 to 22.4). Directly under the
 * event track, on the same x positions: one band per version run (affected: a cross; fixed or patched: a check;
 * labels in mono on paper) and one clock chip per event (browser reading, server setting or none, by shape).
 * The current chip carries the same filled ring as the current peg, and its value is printed under it.
 * It sits inside the slider, which gives the whole scrubber one accessible value; `VersionLegend` lists the
 * versions in text outside it.
 */
export function VersionClockTrack({ model, index }: VersionClockTrackProps) {
  const total = model.clocks.length;
  const current = model.clocks[index];
  return (
    <div className="vtrack" data-track="versions">
      <div className="vtrack__bands">
        {model.versions.map((run) => {
          const isCurrent = run.from <= index && index <= run.to;
          return (
            <span
              key={`${run.versionId}-${run.from}`}
              className="vtrack__band"
              data-role={run.role}
              data-version={run.versionId}
              data-current={isCurrent ? "true" : "false"}
              style={bandStyle(run, total)}
            >
              <span className="vtrack__bar">
                <span className="vtrack__mark" data-mark={isFixedRole(run.role) ? "check" : run.role === "affected" ? "cross" : "dash"} />
              </span>
              <span className="vtrack__label mono">{run.label}</span>
            </span>
          );
        })}
      </div>
      <ol className="vtrack__chips" role="list">
        {model.clocks.map((chip) => (
          <li
            key={chip.index}
            className="vtrack__chip"
            data-scope={chip.scope}
            data-controlled={chip.controlled ? "true" : "false"}
            data-current={chip.index === index ? "true" : "false"}
            style={{ left: trackLeft(indexToFraction(chip.index, total)) }}
          >
            <span className="visually-hidden">{chip.label}</span>
          </li>
        ))}
      </ol>
      <p className="vtrack__readout mono" data-scope={current?.scope}>
        {current?.value}
      </p>
    </div>
  );
}

export interface VersionLegendProps {
  readonly versions: readonly VersionEntry[];
  readonly model: TrackModel;
  readonly index: number;
}

/** The versions of the track in text, in check order: label, role, result by shape and word, current marked. */
export function VersionLegend({ versions, model, index }: VersionLegendProps) {
  const currentId = model.versions.find((r) => r.from <= index && index <= r.to)?.versionId;
  const order = versions.filter((v) => model.versions.some((r) => r.versionId === v.id));
  return (
    <ul className="vtrack-legend" role="list" aria-label={VERSION_TRACK_LABEL}>
      {order.map((v) => (
        <li key={v.id} className="vtrack-legend__item" data-role={v.role} data-current={v.id === currentId ? "true" : "false"}>
          <span className="vtrack-legend__mark" data-mark={isFixedRole(v.role) ? "check" : v.role === "affected" ? "cross" : "dash"} aria-hidden="true" />
          <span className="vtrack-legend__label mono">{v.label}</span>
          <span className="vtrack-legend__role">
            {VERSION_ROLE_TEXT[v.role]}
            {v.source === "illustrative-pin" ? `, ${ILLUSTRATIVE_PIN}` : ""}
          </span>
          <span className="vtrack-legend__result">
            <ResultShape result={v.result} size={18} />
            {RESULT_WORDS[v.result]}
          </span>
          {v.id === currentId ? <span className="vtrack-legend__current">{CURRENT_MARK}</span> : null}
        </li>
      ))}
    </ul>
  );
}
