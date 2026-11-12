import { describe, expect, it } from "vitest";
import { LINKS } from "../../config/links";
import { SETUP_STATES, setupChecks, setupStatusText } from "../../data/setup-checklist";
import * as COPY from "../copy";
import { COPY_STRINGS, HEADLINE, NO_ANOMALY, POSITIONING } from "../copy";
import { CASE_MODES } from "../modes";
import { CREW, MASCOT_IDS } from "../crew";
import { EVIDENCE_BY_ID, EVIDENCE_LADDER, EVIDENCE_STATUSES } from "../evidence";
import { FLOW_STEPS } from "../flow";
import { SECTION_IDS, SECTION_NODES } from "../nodes";
import * as SECTIONS from "../sections";

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
      job: "Kiro agent: writes a fix, which counts only after it passes eight gates.",
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
      new Set(["bat-scout", "pumpkin-mechanic", "raven-archivist", "doctor-stitch", "spider-weaver", "two-faced-jack", "mini-bat"]),
    );
    expect(inRegion("crew")).toHaveLength(14);
    expect(new Set(inRegion("close"))).toEqual(new Set(["raven-archivist", "skeleton-scribe"]));
  });

  it("flow follows the backend's five steps plus the fix, covering every agent and system mascot once", () => {
    expect(FLOW_STEPS.map((s) => s.id)).toEqual(["repository", "discovery", "design", "execution", "verification", "fix"]);
    expect(FLOW_STEPS.map((s) => s.kind)).toEqual(["code", "kiro-agent", "kiro-agent", "code", "kiro-agent", "kiro-agent"]);
    expect(FLOW_STEPS.filter((s) => s.followOn).map((s) => s.id)).toEqual(["fix"]);
    expect(FLOW_STEPS.find((s) => s.id === "fix")?.mascots).toEqual(["doctor-stitch", "skeleton-scribe"]);
    const attached = FLOW_STEPS.flatMap((s) => s.mascots);
    const expected = CREW.filter((m) => m.kind !== "companion").map((m) => m.id);
    expect([...attached].sort()).toEqual([...expected].sort());
    expect(FLOW_STEPS.filter((s) => s.burst).map((s) => s.id)).toEqual(["design"]);
  });

  it("nodes cover the seven regions in order with their themes and no decorative clock stamps", () => {
    expect(SECTION_NODES.map((n) => n.id)).toEqual([...SECTION_IDS]);
    expect([...SECTION_IDS]).toEqual(["open", "lost-hour", "library", "case", "crew", "flow", "close"]);
    expect(SECTION_NODES.map((n) => n.theme)).toEqual(["night", "night", "dusk", "night", "dusk", "night", "dawn"]);
    for (const n of SECTION_NODES) expect(n).not.toHaveProperty("stamp");
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

  it("has only real links, with no placeholder addresses", () => {
    for (const link of Object.values(LINKS)) {
      expect(link.href).toMatch(/^https:\/\//);
      expect(link.href).not.toMatch(/example\.com|TODO|<user>/i);
    }
    expect(Object.keys(LINKS).sort()).toEqual(["kiroCrew", "kiroween", "playwrightClock"]);
    expect(LINKS.playwrightClock.href).toBe("https://playwright.dev/docs/clock");
    expect(LINKS.kiroween.href).toBe("https://kiroween.devpost.com/");
    expect(LINKS.kiroCrew.href).toBe("https://github.com/kirodotdev/KiroCrew");
  });

  it("copy constants hold the fixed strings and avoid banned phrases", () => {
    expect(HEADLINE).toBe("Bugs are hiding in time.");
    expect(POSITIONING).toBe("An autonomous regression investigator for date-sensitive apps.");
    // The retired CTA and its note are gone (decision D19, task 5.3).
    expect("CTA_PRIMARY" in COPY).toBe(false);
    expect("CTA_NOTE" in COPY).toBe(false);
    expect(all()).not.toMatch(/Enter the Clocktower|App opens in the next milestone/);
    for (const s of [
      "Crew readiness",
      "Gateway connected",
      "Backend offline: drafts only",
      "Draft, not run",
      "Draft case created, not run",
      "Run this draft",
      "Not saved: browser storage unavailable",
      "Remove draft",
      "Issue hidden until the reveal",
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
    expect(all()).not.toMatch(/\b(sample|illustrative data|demo mode)\b/i);
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
    for (const [name, text] of prose) expect(text, name).not.toMatch(/\bsample\b/i);
  });
});

describe("readiness data", () => {
  it("readiness states have distinct shapes, and every check waits while the backend is offline", () => {
    expect(new Set(Object.values(SETUP_STATES).map((s) => s.shape)).size).toBe(3);
    for (const check of setupChecks(null)) expect(setupStatusText(check)).toContain("Waiting");
  });
});
