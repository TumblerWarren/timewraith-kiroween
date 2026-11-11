import { BROWSER_CLOCK_CONTROLLED, SERVER_TZ_SET } from "../content/copy";
import { ladderRank } from "../content/evidence";
import { HISTORY_KINDS, MILESTONE_ORDER, type VersionMilestone } from "../cases/model";
import type { ReplayEvent } from "../data/types";

/**
 * Mock_Event_Stream validator (design: Mock_Event_Stream schema; Property 11; Requirements 7.3, 16.5, 22.6, 22.7,
 * 23.1, 26.6). Pure and total: it returns every broken rule as a short message and never throws.
 *
 * Stream rules: 8 to 20 events; `seq` equals the index and ids are "e01", "e02", ... in order; `tOffsetMs` strictly
 * increases; the ladder rank never decreases (Inconclusive is not allowed in a sample stream); a browser reading's
 * `local` equals its instant formatted in its zone; "Browser clock controlled" appears in the text exactly when the
 * browser clock is controlled; no banned wording.
 *
 * Case rules: every `versionId` and `check.versionId` is in the case's versions; an event with a server clock
 * reading never says "Browser clock controlled" and its label says "Server time zone set"; `fixed-version-verified`
 * appears only at or after a `passes` check on a fixed or patched version that follows a `fails` check on an
 * affected version; a Blind hunt has exactly one `reveal` event, after the first `reproduced` status, matching
 * `case.reveal.eventId`, and no event before it names the hidden issue number; other modes have no reveal.
 */
export interface StreamCase {
  readonly mode: "known-issue" | "blind-hunt" | "open-hunt";
  readonly versions: readonly { readonly id: string; readonly role: "affected" | "fixed" | "patched" | "under-test" }[];
  readonly reveal?: { readonly eventId: string };
  readonly issue?: { readonly href: string; readonly label: string };
  /** When present, the Version_Timeline rules apply too (D21; Property 34). */
  readonly timeline?: readonly VersionMilestone[];
}

export interface StreamValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export const MIN_EVENTS = 8;
export const MAX_EVENTS = 20;

/** Format an ISO instant in an IANA zone as "YYYY-MM-DD HH:mm:ss UTC±h[:mm]" (the stream's `local` format). */
export function formatLocal(instant: string, tz: string): string {
  const date = new Date(instant);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMin = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const offset = `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`;
}

const BANNED = /time travel enabled|no bugs found|\bmerged\b|new finding|discovered by timewraith/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function safeFormatLocal(instant: string, tz: string): string | null {
  try {
    return formatLocal(instant, tz);
  } catch {
    return null;
  }
}

/** "30021" from ".../issues/30021", or null. */
function issueNumber(href: string | undefined): string | null {
  const m = href ? /\/issues\/(\d+)\/?$/.exec(href) : null;
  return m ? (m[1] as string) : null;
}

export function validateStream(stream: readonly ReplayEvent[], c: StreamCase): StreamValidation {
  const errors: string[] = [];
  try {
    check(stream, c, errors);
  } catch (error) {
    errors.push(`validator could not read the stream: ${String(error)}`);
  }
  return { ok: errors.length === 0, errors };
}

function check(stream: readonly ReplayEvent[], c: StreamCase, errors: string[]): void {
  if (stream.length < MIN_EVENTS || stream.length > MAX_EVENTS) {
    errors.push(`stream has ${stream.length} events; expected ${MIN_EVENTS} to ${MAX_EVENTS}`);
  }
  const versionRole = new Map(c.versions.map((v) => [v.id, v.role]));
  const ids = new Set<string>();
  let prevOffset = -Infinity;
  let prevRank = 0;
  let sawAffectedFail = false;
  let sawFixPass = false;
  let firstReproduced = -1;
  const reveals: number[] = [];
  const hiddenNumber = c.mode === "blind-hunt" ? issueNumber(c.issue?.href) : null;

  stream.forEach((e, i) => {
    const at = `event ${i} (${String(e.id)})`;
    if (e.seq !== i) errors.push(`${at}: seq ${e.seq} is not its index`);
    if (e.id !== `e${String(i + 1).padStart(2, "0")}`) errors.push(`${at}: id is not e${String(i + 1).padStart(2, "0")}`);
    if (ids.has(e.id)) errors.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (!Number.isFinite(e.tOffsetMs) || e.tOffsetMs < 0 || e.tOffsetMs <= prevOffset) {
      errors.push(`${at}: tOffsetMs ${e.tOffsetMs} does not strictly increase`);
    }
    prevOffset = e.tOffsetMs;

    const rank = ladderRank(e.status);
    if (rank === null || rank === undefined) errors.push(`${at}: status ${e.status} is not on the ladder`);
    else {
      if (rank < prevRank) errors.push(`${at}: status ${e.status} moves down the ladder`);
      prevRank = Math.max(prevRank, rank);
    }
    if (e.status === "reproduced" && firstReproduced === -1) firstReproduced = i;

    if (typeof e.text !== "string" || e.text.trim() === "") errors.push(`${at}: empty text`);
    const text = typeof e.text === "string" ? e.text : "";
    if (BANNED.test(text)) errors.push(`${at}: banned wording`);
    const saysBrowserControlled = text.includes(BROWSER_CLOCK_CONTROLLED);

    // Browser clock scope
    if (e.browserClock !== null) {
      const b = e.browserClock;
      const local = safeFormatLocal(b.instant, b.tz);
      if (local === null || local !== b.local) errors.push(`${at}: browser clock local ${b.local} does not match ${b.instant} in ${b.tz}`);
      if (b.controlled && !saysBrowserControlled) errors.push(`${at}: controlled browser clock but the text does not say "${BROWSER_CLOCK_CONTROLLED}"`);
    }
    if (saysBrowserControlled && e.browserClock?.controlled !== true) {
      errors.push(`${at}: says "${BROWSER_CLOCK_CONTROLLED}" without a controlled browser clock`);
    }

    // Server clock scope
    if (e.serverClock !== "not controlled") {
      const s = e.serverClock;
      if (saysBrowserControlled) errors.push(`${at}: a server-side event says "${BROWSER_CLOCK_CONTROLLED}"`);
      if (typeof s.tz !== "string" || s.tz === "") errors.push(`${at}: server clock reading has no zone`);
      if (!ISO_DATE.test(String(s.dateUnderTest))) errors.push(`${at}: server clock date ${String(s.dateUnderTest)} is not YYYY-MM-DD`);
      if (s.method !== "server-tz" && s.method !== "unit-test") errors.push(`${at}: unknown server clock method`);
      if (typeof s.label !== "string" || !s.label.startsWith(SERVER_TZ_SET)) errors.push(`${at}: server clock label does not say "${SERVER_TZ_SET}"`);
    }

    // Versions and checks
    if (!versionRole.has(e.versionId)) errors.push(`${at}: version ${e.versionId} is not in the case`);
    if (e.check !== undefined) {
      if (e.kind !== "verify" && e.kind !== "compare") errors.push(`${at}: a check on a ${e.kind} event`);
      const role = versionRole.get(e.check.versionId);
      if (role === undefined) errors.push(`${at}: checked version ${e.check.versionId} is not in the case`);
      if (e.check.result === "fails" && role === "affected") sawAffectedFail = true;
      if (e.check.result === "passes" && (role === "fixed" || role === "patched") && sawAffectedFail) sawFixPass = true;
    }
    if (e.status === "fixed-version-verified" && !sawFixPass) {
      errors.push(`${at}: fixed-version-verified before a fails check on the affected version and a passes check on a fixed one`);
    }

    // Reveal
    if (e.kind === "reveal") reveals.push(i);
    if (hiddenNumber !== null && reveals.length === 0 && e.kind !== "reveal" && text.includes(hiddenNumber)) {
      errors.push(`${at}: names the hidden issue before the reveal`);
    }
  });

  if (c.mode === "blind-hunt") {
    if (reveals.length !== 1) errors.push(`a Blind hunt needs exactly one reveal event, found ${reveals.length}`);
    const r = reveals[0];
    if (r !== undefined) {
      if (firstReproduced === -1 || r <= firstReproduced) errors.push("the reveal must come after the first reproduced status");
      if (c.reveal && stream[r]?.id !== c.reveal.eventId) errors.push(`the reveal event is not ${c.reveal.eventId}`);
    }
    if (!c.reveal) errors.push("a Blind hunt case needs reveal data");
  } else if (reveals.length > 0) {
    errors.push(`a ${c.mode} case has no reveal event`);
  }

  if (c.timeline !== undefined) checkTimeline(c.timeline, c, ids, errors);
}

/** Timeline rules (Property 34): five milestones in order, known versions and events, honest dates. */
function checkTimeline(timeline: readonly VersionMilestone[], c: StreamCase, eventIds: ReadonlySet<string>, errors: string[]): void {
  if (timeline.length !== MILESTONE_ORDER.length || timeline.some((m, i) => m.kind !== MILESTONE_ORDER[i])) {
    errors.push(`timeline must hold exactly ${MILESTONE_ORDER.join(", ")} in that order`);
  }
  const versionIds = new Set(c.versions.map((v) => v.id));
  let prevDate = "";
  for (const m of timeline) {
    const at = `timeline ${String(m.kind)}`;
    const history = HISTORY_KINDS.includes(m.kind);
    if (m.versionId === null) {
      if (m.kind !== "fixed-verified") errors.push(`${at}: has no version`);
    } else if (!versionIds.has(m.versionId)) errors.push(`${at}: version ${m.versionId} is not in the case`);
    if (m.eventId !== null && !eventIds.has(m.eventId)) errors.push(`${at}: event ${m.eventId} is not in the stream`);
    if (history && m.eventId !== null) errors.push(`${at}: a history milestone points at a replay event`);
    if (!history && m.kind !== "fixed-verified" && m.eventId === null) errors.push(`${at}: a replay milestone needs an event`);
    if (m.kind === "fixed-verified" && m.eventId === null && m.notRunText === undefined) errors.push(`${at}: an unrun milestone needs its not-run text`);
    if (m.date !== null) {
      if (!history) errors.push(`${at}: only history milestones carry a date`);
      if (m.illustrativePin) errors.push(`${at}: an illustrative pin carries no date`);
      if (!ISO_DATE.test(m.date.value)) errors.push(`${at}: date ${m.date.value} is not YYYY-MM-DD`);
      if (!/^https:\/\//.test(m.date.href)) errors.push(`${at}: the date has no source link`);
      if (m.date.value < prevDate) errors.push(`${at}: date ${m.date.value} is earlier than the milestone before it`);
      prevDate = m.date.value;
    }
  }
  const reported = timeline.find((m) => m.kind === "reported");
  if (reported?.date && c.mode === "blind-hunt" && c.issue && reported.date.href !== c.issue.href) {
    errors.push("timeline: the reported date does not link to the case's issue");
  }
}
