---
inclusion: always
---

# TimeWraith: what it is and the rules it keeps

TimeWraith finds, reproduces and fixes date, time and daylight-saving bugs in public JavaScript and TypeScript
repositories (Jest or Vitest, root package). A Kiro Crew of agents does the thinking. Code decides what counts.

## The rule behind every change
**The agent proposes. Code referees.** An agent may suggest a suspect, an experiment, a verdict or a patch. Code runs it
again, checks the evidence and the numbers, and says yes or no. Never let an agent's word be the evidence.

- A bug is reported only if a reproduction fails 3 of 3 at the failing point and passes at a control point, and the
  cited source lines exist in the repository.
- A fix is "verified" only if the eight gates pass. The last gate is an independent review, and its objection blocks a
  patch only when code can reproduce it (`pipeline._review_gate`).
- Say plainly when a run measured little. A case with no bug is `inconclusive`, not clean, when experiments could not
  run or only checked "does not crash" (`_run_health`).
- Local-time functions (`getMonth`, `setHours`, an `in` option) legitimately differ by process zone. Do not report that
  as a bug.

## Scope (frozen for the hackathon)
JavaScript and TypeScript, Jest or Vitest, the root package, dependencies that install in the sandbox. Do not add
languages, runners, monorepo support or new rules without a failing case that needs them.

## Cost
Every agent run spends Kiro credits. Test with fakes (`backend/tests`), not live cases. Re-run a live case only to check
a change that fakes cannot.