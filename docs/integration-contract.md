# Frontend ↔ backend integration contract (MVP)

For the frontend session. Types come from the backend: the JSON Schemas in `backend/schemas/*.schema.json` are generated from the Pydantic models in `backend/src/timewraith/models.py` and are the source of truth. Generate TypeScript from them (for example with `json-schema-to-typescript` through a `pnpm` script) and fail CI when the generated file is stale. This document covers only what the types cannot say.

Base URL: `http://127.0.0.1:8787/api/v1`. CORS allows `http://localhost:5173` by default (`TW_CORS_ORIGINS`).

## User decisions this contract implements (2026-11-11)

| Topic | Decision |
|---|---|
| Targets | Public GitHub repositories only. **Remove the local-app option from the Open-a-case form.** |
| Modes | All three: `open-hunt`, `known-issue`, `blind-hunt`. Known issue and Blind hunt need an issue URL of the same repository. |
| Approvals | Two stops: approve the plan before any target code runs, and accept the fix after it passed all gates. An `auto` toggle on the form skips the plan stop (the fix still has to be accepted to download it). |
| Drafts | Stay in `localStorage`. Each draft card gets a **Run this draft** button that posts it to the backend. |
| Fix output | Downloadable patch (source change + regression test). The backend never writes to GitHub. |
| Gates | Eight, all required: test first, fixed, no regressions, no new anomalies, diff limits, static checks, independent review, mutation check. |
| Limits | 30 min active time per investigation, 5 bugs taken to fixing, 40 agent calls, 3 fix attempts per bug. |

## Flow strip (top of the Case Board)

`GET /flow` returns the steps in order. Render the five main steps as the strip and the `follow_on` step (Fix) after it:

| # | `id` | Title | Owner | `kind` |
|---|---|---|---|---|
| 1 | `repository` | Repository | Wraith Director | `code` |
| 2 | `discovery` | Time-sensitive code discovery | Bat Scout | `kiro-agent` |
| 3 | `design` | Autonomous experiment design | Pumpkin Mechanic | `kiro-agent` |
| 4 | `execution` | Controlled execution | Spider Weaver | `code` |
| 5 | `verification` | Independent bug verification | Raven Archivist | `kiro-agent` |
| follow-on | `fix` | Fix | Doctor Stitch | `kiro-agent` |

Show the `kind`: steps 1 and 4 are code on purpose (they produce the facts), and the Kiro agents are judged against those facts. Each step also has `does` and `decides` strings for a tooltip. The active step is `Investigation.phase` (also in `InvestigationSummary`), and every event carries `phase`.

## Endpoints

| Method and path | Use |
|---|---|
| `GET /flow` | The flow strip above |
| `GET /system/setup` | Docker Desktop, Kiro Crew container and Kiro sign-in state (`SetupStatus`) |
| `POST /system/docker/start` · `/system/crew/start` · `/system/crew/login` | The readiness board's three buttons. They need the `X-TimeWraith: 1` header (the client sends it on every POST). The login answer carries `login.code` and `login.url` while waiting for approval |
| `GET /investigations/{id}/decisions` | `DecisionRecord[]`: the "why" behind every agent step |
| `GET /health` | Gateway badge and setup checklist: `gateway`, `agent_runtime.{name,label}`, `sandbox.{available,detail}` |
| `POST /investigations` | Body `CreateInvestigation`: `{repository_url, ref, mode, issue_url?, area?, auto}`. Returns `202` with `InvestigationSummary` |
| `GET /investigations` | Case library: `InvestigationSummary[]`, newest first |
| `GET /investigations/{id}` | Full `Investigation` (bugs, fixes, gates, versions, runs, notes). In Blind hunt, `request.issue_url` is `null` until the reveal |
| `GET /investigations/{id}/events` | SSE stream, see below |
| `GET /investigations/{id}/feature-map` · `/test-plan` · `/capabilities` | Artifacts; `409 not_ready` before their stage finished |
| `POST /investigations/{id}/approve-plan` | Plan stop; `409 not_awaiting_approval` otherwise |
| `POST /investigations/{id}/cancel` | Stops at the next step boundary |
| `POST /investigations/{id}/bugs/{bug_id}/fix/accept` or `/reject` | Fix stop; only for `fix.state == "verified"` |
| `GET /investigations/{id}/bugs/{bug_id}/patch` | The patch file; only after accept |
| `GET /investigations/{id}/audit` | Agent call log (for a "how the Crew decided" panel, optional) |

Errors always have the shape `{"error": {"code": "...", "message": "..."}}`. Show `message`; branch on `code`.

## Mapping to the Case Board

- A backend investigation is a case of kind `live`, next to `draft` (drafts are kept in this browser). Since redesign R4 each case has its own page at `#/cases/:id`. Its `Target` is `{kind: "repository", repoUrl, version: {kind: "commit", value: revision}}` once `target.revision` is set.
- `Investigation.versions` has the frontend `VersionEntry` meaning (fields in snake_case: `includes_suggested_fix`). The first entry is the revision under test (`role` becomes `affected` once a bug is reproduced); each verified fix adds a `patched-<bug_id>` entry with `result: "passes"`.
- `Investigation.status` is the case's ladder status. It never decreases.
- `stage == "awaiting-plan-approval"` shows the approve control (Flow step "approve").
- A `Bug` maps to the Case view's finding: `title`, `category`, `invariant` (which rule broke), `violation` (zone, instant, local wall time, detail), `clock`, `evidence`, `regression_test` (generated from the invariant, not by an LLM), `issue_match_label`, and `fix`.
- `Investigation.sweeps` holds one `SweepResult` per experiment (clock points run, zones, violations). `test_plan.experiments[]` shows each adapter, its invariants and `point_count`: show this at the plan approval stop.
- `fix.attempts[-1].diff` is a unified diff of the source change; split it into `DiffLine`s for the fix panel. `fix.label` is the exact label to show.

## SSE events

`GET /investigations/{id}/events` sends `event: replay` messages whose `data` is one `ReplayEvent`. The shape is the frontend's `ReplayEvent` from `frontend/src/data/types.ts`, plus these differences:

- `id` is `e001`, `e002`, … (three digits; live runs can exceed 20 events). `seq` equals the SSE `id:` line. Reconnect with `Last-Event-ID` to resume.
- `browserClock` is always `null` in the MVP (no browser adapter). `serverClock` is either `"not controlled"` or a `ServerClockReading` with `method: "unit-test"`; its `label` reads "Test process clock set: TZ=…; unit-level test of …". It is the test process clock, not an app server. Never render it as "Browser clock controlled".
- Every event has `phase` (one of the flow step ids).
- New `kind` values: `stage` (pipeline stage changed; `data.stage`, `data.phase`), `capability` (`data.items`), `approval` (`data.approval` is `plan` or `fix`; `data.pending: true` while waiting), `gate` (`data` is a `GateResult` plus `bug_id`, `attempt`), `decision` (`data` is a `DecisionRecord`). Extend `ReplayEventKind` with these; existing kinds keep their meaning.
- A `decision` event is the "why" line for a step. Show `data.claim`, `data.evidence` (each `{kind, ref, why}`; refs already resolved by the backend), `data.decision` (`accepted`, `rejected`, `not_run`) and `data.rule` (the code rule that decided). `dropped_evidence` counts citations the backend removed because they did not resolve.
- `data` is optional extra payload for the new kinds and for `explore` (top candidates), `plan` (`ready` count), `compare` (matched issue), `reveal` (`issue_url`, `outcome`: `match`, `no-match` or `not-judged`).
- `event: end` with `{"stage": ...}` closes the stream when the investigation is `completed`, `failed` or `cancelled`.

Actors: Wraith Director (opens the case, capability report, files the case), Watchtower Warden (stages, approvals, gates), Bat Scout (discovery and candidate review), Pumpkin Mechanic (adapters, baseline checks), Spider Weaver (the sweep and observed violations), Raven Archivist (repeats, verdicts, issue match, fix review), Two-Faced Jack (Blind hunt seal and reveal), Doctor Stitch (fix attempts).

Stage names changed: `planning` is now `designing`. The full list is in `Investigation.schema.json`.

Endpoints added since the first version of this contract:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/system/crew/logout` | Sign the Kiro Crew container out of Kiro (`X-TimeWraith: 1` required) |
| `POST /api/v1/internal/fix-tools/list` and `/call` | Fix-session tools, called by the MCP proxy inside the container. Only a live fix-session token is accepted (`X-TW-Session`). Not for the frontend |
| `GET /api/v1/investigations/{id}` → `intended[]` | Repository-intended findings (`IntendedFinding`) |
| `InvestigationSummary.fix_verified_count`, `intended_count`, `error`, `message` | Counts and the stop reason for the case list |
| `GET /api/v1/health` → `limits` | The per-investigation limits, for the case page |

## Labels (Requirement 16, extended)

| Situation | Label |
|---|---|
| Investigation running | "Live" (`replay_label`) |
| Investigation finished | "Recorded investigation replay" |
| Stub agent runtime | `runtime_label` = "Stub runtime, not a Kiro Crew run". Show it on the case |
| Discovery output | "These are candidates, not proven bugs." |
| Bug | Only exists after 3/3 clean repeats, a failing generated regression test and Raven's defect verdict with resolvable evidence: "Reproduced" |
| Issue search | `issue_match_label`: "Known issue: #n", "No matching public issue found", "Possible related issues found; match not judged", "Issue search unavailable" |
| Fix | `fix.label`: "Suggested fix · verified" only when all 8 gates passed; "Fix not started", "Fix in progress", "No safe fix found", "No fix attempted: …", "Fix not attempted: fix budget reached" |
| Intended behaviour | Not a bug. `intended[]` lists it with the cited test or doc line. Shown as "No bugs: N findings are intended behaviour the repository documents" |
| Kiro usage limit | "Agents stopped" with "Kiro usage limit reached for this account…" (the backend's note). Never shown as a clean "Done" |
| No anomalies | "No anomaly observed in tested cases" |
| Gateway badge | "Gateway connected" when `/health` answers; otherwise "Backend offline: drafts only" and show only drafts |

The board ships no bundled or sample cases. The library lists live investigations from `GET /investigations`, then the drafts kept in this browser. Nothing is selected on load; the Case view shows "No case is open" until a case is opened.

## Frontend implementation (done 2026-11-11)

- `frontend/src/api/`: `types.ts` (the fields the board reads), `client.ts` (fetch and EventSource), `ApiProvider.tsx` (health every 30 s). `api/__tests__/contract.test.ts` fails when a field the board reads is missing from `backend/schemas/`.
- Vite proxies `/api` to `http://127.0.0.1:8787` in `dev` and `preview` (`TW_BACKEND_URL` overrides it), so no CORS is needed.
- Live cases: `cases/model.ts` (`LiveCase`), `cases/store.tsx` (list refresh every 15 s). Case page: `frontend/src/pages/case/CasePage.tsx` with the status banner (`app/status.ts`), the six-step tracker, counters and the tabs Overview, Plan, Findings (including intended behaviour), Fixes (the 8 gates, diff, accept or reject, patch download) and Activity (event log and decisions). The earlier single-page `LiveCaseView` was removed in redesign R4.
- `components/FlowStrip.tsx` is the five-step strip at the top of the Open-a-case region, and the Flow region uses the same steps.
- Removed: the decorative clock stamps (nav, thread nodes, "Filed 06:58"), the local-app target, the simulated setup statuses and demo-mode badge (both now follow `/health`), the placeholder links and hash, and the two sample cases (FullCalendar #7998, Cal.com #30021) with their replay scrubber, version timeline milestones and illustrative suggested-fix panel.

## Redesign R4: five pages (2026-11-11)

The one-page Case Board with seven regions is replaced by hash-routed pages (`frontend/src/app/router.ts`):

| Route | Page | Shows |
|---|---|---|
| `#/` | Home | Short hero, Crew readiness, the three latest cases |
| `#/new` | New case | The form, readiness, what each mode does |
| `#/cases` | Cases | Every case as a row with a status pill, filter by state |
| `#/cases/:id[/tab]` | Case | Status banner with the next action, six-step tracker, counters, tabs: overview, plan, findings, fixes, activity |
| `#/crew` | Crew setup | Docker, Kiro Crew container, sign-in, machine checks, limits, cleanup |
| `#/about` | How it works | Lost hour, the six steps, the Crew, the evidence ladder |

One status model (`app/status.ts`) feeds every page: Draft, Queued, Running, Waiting for you, Failed, Cancelled, Done, each with a shape, a word, a mascot and a one-line reason. Mascots use three sizes (32, 64, 160 px) and move only to show a running state. Removed: the scroll thread, ghost companion, overlay bats, ambient beats and the region sections.

Backend additions for R4: `InvestigationSummary.fix_verified_count`, `error`, `message`; `Investigation.budget` is read; `/health` returns `limits`; fix progress is saved at the start of each attempt; a missing ref reports the default branch ("The default branch is 'main'.").

## Fix sessions: Doctor Stitch with tools (2026-11-11)

Doctor Stitch no longer answers one prompt with whole files. Each fix attempt is one Kiro CLI session in the Kiro Crew container with the profile `tw-doctor-stitch` (written into the container by `KiroCrewDockerRuntime`). Its only tools are TimeWraith's (`@tw`), served by `backend/agents/tw_mcp_proxy.py`, a stdio MCP server that forwards each call to the backend:

| Endpoint | Auth |
|---|---|
| `POST /api/v1/internal/fix-tools/list` | `X-TW-Session: <token>` of a live session |
| `POST /api/v1/internal/fix-tools/call` `{name, arguments}` → `{result}` or `{error}` | same; the token dies when the attempt ends |

Tools (`fixsession.py`): `list_files`, `read_file` (number, tab, line), `search`, `replace` (exact text; falls back to a whitespace-insensitive match), `replace_lines`, `show_diff`, `run_regression_test` (8 per attempt), `check_all_zones` (the bug's experiment in all 13 zones, 3 per attempt), `run_tests` (4 per attempt), `submit`. Each attempt allows 40 tool calls and 12 minutes. Reads see only git-tracked files plus the regression test and adapter; edits refuse tests, config, manifests, lockfiles, CI and generated files, and keep the file's line endings. `submit` refuses once if the regression test has not passed since the last edit.

After `submit`, the backend takes `git diff`, resets the tree, and runs the 8 gates with only that diff applied (`git apply`); `diff_limits` counts lines from `git apply --numstat`. Every tool call is an event (`kind: "tool"`, `phase: "fix"`, `data: {bug_id, attempt, calls, max_calls}`), and `FixAttempt` records `tool_calls` and `test_runs`. Running out of the time budget during the fix step keeps the case and its bugs. A Kiro usage limit is reported as "Kiro usage limit reached for this account" and the case is not shown as a clean "Done".

Setting: `TW_CREW_BACKEND_URL` (default `http://host.docker.internal:8787`) is how the container reaches the backend.

## Intended behaviour check (2026-11-11)

A broken rule is not automatically a bug: the repository may do it on purpose (node-cron skips the repeated hour of a fall-back night and asserts so in `src/time/dst.test.ts:127`). Before the Raven rules, `intent.py` finds, by plain text search for any language:
- test files that mention the code under test, its module, or what it imports from the repository, and
- docs (README, CHANGELOG, `docs/`, `*.md`) that mention it,

keeping passages with time-transition words, ranked first when they match the transition at the clock point (`sweep.situation`: fall-back or spring-forward). The Raven sees them as `repository-intent` and can rule `intended_behavior`, citing `kind: "test"` or `kind: "doc"` lines.

Code decides: every cited line must exist in a test (or doc) file of the repository, not a TimeWraith file, and each cited test file must **pass on the original revision** in the sandbox. Then the finding goes to `Investigation.intended` (`IntendedFinding`), never to `bugs`, and no fix is attempted. A claim that does not check out is not reported, and the decision record says why. `InvestigationSummary.intended_count` counts them; the case page shows "No bugs: N findings are intended behaviour the repository documents" and lists them on the Findings tab with the citations.

## Running locally

```
uv --directory backend sync
uv --directory backend run uvicorn timewraith.api:app --host 127.0.0.1 --port 8787
```

Docker Desktop must be running for anything after plan approval. Without it the investigation fails with `sandbox_unavailable` and a clear message.
