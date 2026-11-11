import { TIME_CONTROL_TITLE } from "../../content/caseView";

export interface TimeControlNoteProps {
  /** The case's own statement of how it controlled time (`SampleCase.timeControl`). */
  readonly text: string;
  /** "browser" for a browser clock set by the Crew, "server" for a server-side setting, "none" for a draft. */
  readonly method: "browser" | "server" | "none";
}

/**
 * The selected case's time-control method under "Browser time ≠ server time" (Requirements 8.4, 26.5, 26.6).
 * FullCalendar: "Browser clock controlled with the Playwright clock ...". Cal.com: "The browser clock cannot
 * reach this bug ... Server time zone set to UTC ...". A draft has not run, so it says no clock was set.
 */
export function TimeControlNote({ text, method }: TimeControlNoteProps) {
  return (
    <div className="time-note" data-method={method}>
      <h5 className="time-note__title">{TIME_CONTROL_TITLE}</h5>
      <p className="time-note__text">{text}</p>
    </div>
  );
}
