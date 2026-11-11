import { describe, expect, it } from "vitest";
import { LINKS } from "../../config/links";
import { REPLAY_STREAM } from "../../data/replay.stream";
import { SETUP_CHECKS, SETUP_STATES, setupStatusText } from "../../data/setup-checklist";
import * as COPY from "../copy";
import { COPY_STRINGS, HEADLINE, NO_ANOMALY, POSITIONING } from "../copy";
import { CASE_MODES } from "../modes";
import { CREW, MASCOT_IDS } from "../crew";
import { EVIDENCE_BY_ID, EVIDENCE_LADDER, EVIDENCE_STATUSES, ladderRank } from "../evidence";
import { FLOW_STEPS } from "../flow";
import { SECTION_IDS, SECTION_NODES } from "../nodes";
import * as SECTIONS from "../sections";

/** Format an ISO instant in an IANA zone as "YYYY-MM-DD HH:mm:ss UTC±h[:mm]". */
function formatLocal(instant: string, tz: string): string {
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

const all = () => Object.values(COPY_STRINGS).join("\n");

describe("content modules", () => {
  it("has 14 unique mascots matching the id union, with 8 tier 1 and 6 tier 2, Doctor Stitch among the agents", () => {
    expect(CREW).toHaveLength(14);
    expect(new Set(CREW.map((m) => m.id))).toEqual(new Set(MASCOT_IDS));
    expect(CREW.filter((m) => m.tier === 1)).toHaveLength(8);
    expect(CREW.filter((m) => m.tier === 2)).toHaveLength(6);
    expect(CREW.filter((m) => m.kind === "agent")).toHaveLength(6);
    const stitch = CREW.find((m) => m.id === "doctor-stitch");
    expect(stitch).toMatchObject({
      name: "Doctor Stitch",
      tier: 1,
      kind: "agent",
      job: "Patch-maker: stitches a suggested fix and the regression test that proves it.",
    });
    expect(CREW.filter((m) => m.kind === "system")).toHaveLength(6);
    expect(CREW.filter((m) => m.kind === "companion")).toHaveLength(2);
    for (const m of CREW) {
      expect(m.job.length).toBeGreaterThan(0);
      expect(m.sections.length).toBeGreaterThan(0);
      for (const s of m.sections) expect(SECTION_IDS).toContain(s);
    }
  });

  it("assigns mascots to regions per the design's per-region table", () => {
    const inRegion = (id: string) => CREW.filter((m) => (m.sections as readonly string[]).includes(id)).map((m) => m.id);
    expect(inRegion("open")).toEqual(["wraith-director", "watchtower-warden", "mini-bat"]);
    expect(new Set(inRegion("case"))).toEqual(
      new Set(["bat-scout", "pumpkin-mechanic", "raven-archivist", "doctor-stitch", "spider-weaver", "mummy-wrapper", "two-faced-jack", "mini-bat"]),
    );
    expect(inRegion("crew")).toHaveLength(14);
    expect(new Set(inRegion("close"))).toEqual(new Set(["raven-archivist", "skeleton-scribe"]));
  });

  it("flow has six ordered steps covering every agent and system mascot once, Doctor Stitch on fix", () => {
    expect(FLOW_STEPS.map((s) => s.id)).toEqual(["scope", "plan", "approve", "run", "evidence", "fix"]);
    expect(FLOW_STEPS.find((s) => s.id === "fix")?.mascots).toEqual(["doctor-stitch", "skeleton-scribe"]);
    const attached = FLOW_STEPS.flatMap((s) => s.mascots);
    const expected = CREW.filter((m) => m.kind !== "companion").map((m) => m.id);
    expect([...attached].sort()).toEqual([...expected].sort());
    expect(FLOW_STEPS.filter((s) => s.burst).map((s) => s.id)).toEqual(["approve"]);
  });

  it("nodes cover the seven regions in order with the layout stamps and themes", () => {
    expect(SECTION_NODES.map((n) => n.id)).toEqual([...SECTION_IDS]);
    expect([...SECTION_IDS]).toEqual(["open", "lost-hour", "library", "case", "crew", "flow", "close"]);
    expect(SECTION_NODES.map((n) => n.theme)).toEqual(["night", "night", "dusk", "night", "dusk", "night", "dawn"]);
    expect(SECTION_NODES.map((n) => n.stamp)).toEqual([
      "23:59 · 31 Oct",
      "01:59 → 03:00",
      "03:33",
      "04:44",
      "05:15",
      "06:00",
      "06:58",
    ]);
  });

  it("evidence ladder is ordered, has text, definitions and unique shapes", () => {
    expect(EVIDENCE_LADDER.map((s) => s.label)).toEqual([
      "Planned",
      "Observed anomaly",
      "Reproduced",
      "Known-issue match",
      "Fixed-version verified",
    ]);
    expect(EVIDENCE_BY_ID.inconclusive.rank).toBeNull();
    expect(new Set(EVIDENCE_STATUSES.map((s) => s.shape)).size).toBe(6);
    for (const s of EVIDENCE_STATUSES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.definition.length).toBeGreaterThan(0);
    }
  });

  it("links keep demo and GitHub as placeholders and the others real", () => {
    expect(LINKS.demo.placeholder).toBe(true);
    expect(LINKS.github.placeholder).toBe(true);
    expect(LINKS.issue7998.href).toBe("https://github.com/fullcalendar/fullcalendar/issues/7998");
    expect(LINKS.issue30021.href).toBe("https://github.com/calcom/cal.com/issues/30021");
    expect(LINKS.issue30021.placeholder).toBe(false);
    expect(LINKS.playwrightClock.href).toBe("https://playwright.dev/docs/clock");
    expect(LINKS.kiroween.href).toBe("https://kiroween.devpost.com/");
    expect(LINKS.kiroCrew.href).toBe("https://github.com/kirodotdev/KiroCrew");
    for (const key of ["issue7998", "playwrightClock", "kiroween", "kiroCrew"] as const) {
      expect(LINKS[key].placeholder).toBe(false);
    }
  });

  it("copy constants hold the fixed strings and avoid banned phrases", () => {
    expect(HEADLINE).toBe("Bugs are hiding in time.");
    expect(POSITIONING).toBe("An autonomous regression investigator for date-sensitive apps.");
    // The retired CTA and its note are gone (decision D19, task 5.3).
    expect("CTA_PRIMARY" in COPY).toBe(false);
    expect("CTA_NOTE" in COPY).toBe(false);
    expect(all()).not.toMatch(/Enter the Clocktower|App opens in the next milestone/);
    for (const s of [
      "Demo mode, simulated status",
      "Not contacted in demo mode",
      "Draft, not run: cases run in the next milestone",
      "Draft case created, not run",
      "Not saved: browser storage unavailable",
      "Remove draft",
      "Issue hidden until the reveal",
      "Same behaviour as the public report",
      "Did not match",
      "Suggested fix",
      "Illustrative diff",
      "No upstream fix found",
      "Fixed-version check not run",
      "illustrative pin",
      "Sample replay (illustrative data), not a real finding",
      "Illustrative replay modelled on the public report, not a real recorded run",
      "Recorded replay",
      "Illustrative replay",
      "Browser clock controlled",
      "Server time zone set",
      "Browser time ≠ server time",
      "No anomaly observed in tested cases",
      "Open a case",
    ]) {
      expect(Object.values(COPY_STRINGS)).toContain(s);
    }
    expect(NO_ANOMALY).toBe("No anomaly observed in tested cases");
    expect(all()).not.toMatch(/no bugs found/i);
    expect(all()).not.toMatch(/time travel enabled/i);
    expect(all()).not.toMatch(/\blive\b/i);
    expect(all()).not.toMatch(/\bmerged\b/i);
  });

  it("has the three Case_Mode labels with one-line descriptions", () => {
    expect(CASE_MODES.map((m) => m.label)).toEqual(["Known issue", "Blind hunt", "Open hunt"]);
    expect(CASE_MODES.map((m) => m.needsIssue)).toEqual([true, true, false]);
    expect(new Set(CASE_MODES.map((m) => m.shape)).size).toBe(3);
  });
});

describe("section prose voice and honesty (visual revision R1)", () => {
  const prose = Object.entries(SECTIONS)
    .flatMap(([name, value]) => {
      if (typeof value === "string") return [[name, value] as const];
      if (typeof value === "function") return [[name, (value as (n: number) => string)(13)] as const];
      if (Array.isArray(value)) return value.map((v: { title: string }, i) => [`${name}[${i}]`, v.title] as const);
      return Object.values(value as Record<string, string>).map((v) => [name, v] as const);
    })
    .filter(([, text]) => typeof text === "string");

  it("drops the old slogan headings", () => {
    const all = prose.map(([, t]) => t).join("\n");
    for (const old of ["Five steps from hunch to evidence.", "Every claim carries its rating.", "One hour that never happens.", "Meet the Crew."]) {
      expect(all).not.toContain(old);
    }
  });

  it("has no em-dashes, rhetorical questions, 'from X to Y' or 'Every X' openings", () => {
    for (const [name, text] of prose) {
      expect(text, name).not.toMatch(/[\u2014\u2013]/);
      expect(text, name).not.toMatch(/\?/);
      expect(text, name).not.toMatch(/\bfrom \w+ to \w+/i);
      expect(text, name).not.toMatch(/(?:^|\.\s)Every\b/);
    }
  });

  it("keeps the honesty rules", () => {
    for (const [name, text] of prose) {
      expect(text, name).not.toMatch(/\blive\b/i);
      expect(text, name).not.toMatch(/no bugs found|time travel/i);
      expect(text, name).not.toMatch(/new finding/i);
    }
    expect(SECTIONS.replayIntro(13)).toMatch(/sample/);
    expect(SECTIONS.replayIntro(13)).toMatch(/recorded/);
  });
});

describe("mock data", () => {
  it("replay stream is a valid, honest sample", () => {
    expect(REPLAY_STREAM.length).toBeGreaterThanOrEqual(8);
    expect(REPLAY_STREAM.length).toBeLessThanOrEqual(20);
    expect(new Set(REPLAY_STREAM.map((e) => e.id)).size).toBe(REPLAY_STREAM.length);
    let prevOffset = -1;
    let prevRank = 0;
    REPLAY_STREAM.forEach((e, i) => {
      expect(e.seq).toBe(i);
      expect(e.id).toBe(`e${String(i + 1).padStart(2, "0")}`);
      expect(e.tOffsetMs).toBeGreaterThan(prevOffset);
      prevOffset = e.tOffsetMs;
      const rank = ladderRank(e.status);
      expect(rank).not.toBeNull();
      expect(rank as number).toBeGreaterThanOrEqual(prevRank);
      prevRank = rank as number;
      expect(e.browserClock.local).toBe(formatLocal(e.browserClock.instant, e.browserClock.tz));
      if (e.browserClock.controlled) expect(e.text).toContain("Browser clock controlled");
      expect(e.serverClock).toBe("not controlled");
      expect(e.text).not.toMatch(/time travel enabled|no bugs found/i);
    });
  });

  it("setup checklist statuses are all labelled simulated, with distinct shapes", () => {
    for (const state of Object.values(SETUP_STATES)) expect(state.text).toContain("simulated");
    for (const check of SETUP_CHECKS) expect(setupStatusText(check)).toContain("simulated");
    expect(new Set(Object.values(SETUP_STATES).map((s) => s.shape)).size).toBe(3);
  });
});
