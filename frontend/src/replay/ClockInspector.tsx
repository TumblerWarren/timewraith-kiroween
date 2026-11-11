import type { VersionEntry } from "../cases/model";
import { Clock } from "../components/Clock";
import {
  BROWSER_CLOCK_NOT_USED,
  INSPECTOR_BROWSER,
  INSPECTOR_DATE,
  INSPECTOR_SERVER,
  INSPECTOR_SYSTEM_ZONE,
  INSPECTOR_TITLE,
  INSPECTOR_VERSION,
  INSPECTOR_ZONE_CALENDAR,
  INSPECTOR_ZONE_SERVER,
  NO_ZONE_SET,
} from "../content/caseView";
import { BROWSER_CLOCK_CONTROLLED, SERVER_CLOCK_NOT_CONTROLLED, SERVER_TZ_SET } from "../content/copy";
import { REPLAY_NOT_CONTROLLED } from "../content/sections";
import type { ReplayEvent } from "../data/types";
import { parseLocal } from "./format";

export interface ClockInspectorProps {
  readonly event: ReplayEvent;
  /** The whole stream, to say in which events the Crew controls the browser clock. */
  readonly stream: readonly ReplayEvent[];
  /** The version the event ran against. */
  readonly version?: VersionEntry;
  /** Zone of the browser under test, for browser-side cases (FullCalendar: Asia/Kolkata). */
  readonly systemZone?: string;
}

/** 1-based first and last event number with a controlled browser clock, or undefined when there is none. */
function controlledSpan(stream: readonly ReplayEvent[]): { first: number; last: number } | undefined {
  const controlled = stream.filter((e) => e.browserClock?.controlled).map((e) => e.seq + 1);
  const first = controlled[0];
  const last = controlled[controlled.length - 1];
  return first === undefined || last === undefined ? undefined : { first, last };
}

/**
 * Clock inspector (design: "ClockInspector shows Target version, Browser clock, Calendar or schedule time zone,
 * and Server clock"; Requirements 7.5, 7.11, 26.5, 26.6). Each event's time control is named by its real scope:
 * "Browser clock controlled" only for a browser clock the Crew set, "Server time zone set" for a server-side
 * setting, never the first for a server event. Values are JetBrains Mono.
 */
export function ClockInspector({ event, stream, version, systemZone }: ClockInspectorProps) {
  const clock = event.browserClock;
  const server = event.serverClock === "not controlled" ? null : event.serverClock;
  const local = clock ? parseLocal(clock.local) : null;
  const span = controlledSpan(stream);
  const scope = clock ? "browser" : server ? "server" : "none";
  return (
    <div className="clock-inspector" data-scope={scope} data-controlled={clock?.controlled ? "true" : "false"}>
      <h4 className="clock-inspector__title">{INSPECTOR_TITLE}</h4>

      {clock && local ? (
        <div className="clock-inspector__dial">
          <Clock
            id="replay-clock"
            hours={local.hours}
            minutes={local.minutes}
            label={`Clock face reading ${String(local.hours).padStart(2, "0")}:${String(local.minutes).padStart(2, "0")} in ${clock.tz}`}
          />
        </div>
      ) : (
        <p className="clock-inspector__plate paper-piece" data-state={server ? "set" : "unset"}>
          <span className="clock-inspector__plate-shape" aria-hidden="true" />
          <span className="mono">{server ? `TZ=${server.tz}` : NO_ZONE_SET}</span>
          {server ? <span className="mono">{server.dateUnderTest}</span> : null}
        </p>
      )}

      <dl className="clock-inspector__fields">
        <div className="clock-inspector__field">
          <dt>{INSPECTOR_VERSION}</dt>
          <dd className="mono">{version?.label ?? event.versionId}</dd>
        </div>
        <div className="clock-inspector__field">
          <dt>{INSPECTOR_BROWSER}</dt>
          <dd>
            {clock && local ? (
              <>
                <span className="clock-inspector__state" data-state={clock.controlled ? "controlled" : "free"}>
                  <span className="clock-inspector__state-shape" aria-hidden="true" />
                  <span className="clock-inspector__state-text">{clock.controlled ? BROWSER_CLOCK_CONTROLLED : REPLAY_NOT_CONTROLLED}</span>
                </span>
                <time className="mono" dateTime={clock.instant}>
                  {clock.instant}
                </time>
                <span className="mono">
                  {local.date} {local.time} {local.offset}
                </span>
              </>
            ) : (
              <span className="clock-inspector__state" data-state="unused">
                <span className="clock-inspector__state-shape" aria-hidden="true" />
                <span className="clock-inspector__state-text">{BROWSER_CLOCK_NOT_USED}</span>
              </span>
            )}
          </dd>
        </div>
        {clock ? (
          <>
            <div className="clock-inspector__field">
              <dt>{INSPECTOR_ZONE_CALENDAR}</dt>
              <dd className="mono">{clock.tz}</dd>
            </div>
            {systemZone ? (
              <div className="clock-inspector__field">
                <dt>{INSPECTOR_SYSTEM_ZONE}</dt>
                <dd className="mono">{systemZone}</dd>
              </div>
            ) : null}
          </>
        ) : (
          <div className="clock-inspector__field">
            <dt>{INSPECTOR_ZONE_SERVER}</dt>
            <dd className="mono">{server ? server.tz : NO_ZONE_SET}</dd>
          </div>
        )}
        <div className="clock-inspector__field">
          <dt>{INSPECTOR_SERVER}</dt>
          <dd>
            {server ? (
              <>
                <span className="clock-inspector__state" data-state="server-set">
                  <span className="clock-inspector__state-shape" aria-hidden="true" />
                  <span className="clock-inspector__state-text">{server.label.startsWith(SERVER_TZ_SET) ? server.label : `${SERVER_TZ_SET}: ${server.label}`}</span>
                </span>
                <span>
                  {INSPECTOR_DATE}: <span className="mono">{server.dateUnderTest}</span>
                </span>
              </>
            ) : (
              SERVER_CLOCK_NOT_CONTROLLED
            )}
          </dd>
        </div>
      </dl>

      {span ? (
        <p className="clock-inspector__range">
          {BROWSER_CLOCK_CONTROLLED} in events {span.first} to {span.last} of this replay.
        </p>
      ) : null}
    </div>
  );
}
