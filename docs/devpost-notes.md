# Devpost notes

Working notes for the Kiroween 2026 entry. Check them against the current Devpost rules page before submitting: the rules page could not be fetched on 2026-11-19 (HTTP 403), so the category rules below are not re-confirmed.

## Category

- **Entered:** Costume Contest. The hand-inked, cel-painted interface and the mascot cast.
- **Supporting angles, in the text only** (unless the rules allow more than one category):
  - **Frankenstein:** Kiro agents stitched to a Docker sandbox runner, a clock and time-zone sweep harness, a version comparator and GitHub.
  - **Resurrection:** old date-boundary bugs from public issue trackers revived as reproducible evidence. The sample scenario is based on FullCalendar #7998 and is labelled sample; it is not a TimeWraith finding.

## One-line pitch

TimeWraith points a crew of Kiro agents at a public repository, sweeps its time-sensitive code across 13 time zones and their DST changes, and reports only the bugs it can reproduce from clean containers, with a fix that has to pass eight gates.

## What to claim, and what not to

| Claim | Evidence |
|---|---|
| Found and fixed a real DST bug in rrule | Case `b80d4d45` (fixed version verified): default `dtstart` one hour early in the repeated hour, `America/Los_Angeles` |
| Found and fixed a real DST bug in cron-parser | Case `1b20d89a` (fixed version verified): `addHour` at the Lord Howe fall-back. Say that an open PR (#453, another author) fixes the same behaviour |
| Says when it cannot test | date-fns run ended inconclusive with the reasons; Temporal supplied by a polyfill and labelled as such |
| Does not invent bugs | Violations are repeated from clean containers, judged by a second agent with its own reproduction, and need a regression test that fails before the fix |

Do not claim: that it works on any repository, that the bugs were unknown to the maintainers, or that fixes were merged upstream.

## Demo video plan (about 3 minutes)

1. Clock intro and home page (Costume Contest).
2. Crew page: Docker, Crew container, Kiro sign-in.
3. Open the rrule case: findings, the reproduced bug, the regression test, the eight gates, the PR description generated from the repository's template.
4. Start a new case on **kelektiv/node-cron** (`cron` on npm, branch `main`) and show it live: discovery, plan, environment check, sweep. See below.
5. The Activity tab: the agents' decisions with the rule that code applied to each.

## Second live demo repository: kelektiv/node-cron

Chosen on 2026-11-19 from GitHub data, without spending Kiro credits on a trial run:

- Single package, TypeScript, 8 source files in `src/`, Jest with `@swc/jest`, `package-lock.json`, no workspaces. Its `jest.config.json` has no `testMatch`, so a generated test is collected without a runner profile.
- It is about time zones: `CronTime` computes the next run with luxon in a given zone.
- Open DST issues filed by others: #1049 (`getNextMatch()` returns past dates near DST boundaries, 2026-03-08) and #1087 (`getNextDateFrom` returns a date before its input in the repeated fall-back hour, regression in 4.1.1, 2026-09-08). #1102 and #1103 were opened on 2026-11-14 and 2026-11-15; check who filed them before mentioning them.

Risks: the run is not proven. Its `jest.config.json` enforces a coverage threshold, so a single generated test exits non-zero; TimeWraith reads the harness output files, not the exit code, so this should not matter. Record the video from a case that has already finished, and cut the waiting.
