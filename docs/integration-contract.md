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

## Endpoints

| Method and path | Use |
|---|---|
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

- A backend investigation is a new case kind, `live`, next to `sample` and `draft`. Its `Target` is `{kind: "repository", repoUrl, version: {kind: "commit", value: revision}}` once `target.revision` is set.
- `Investigation.versions` has the frontend `VersionEntry` meaning (fields in snake_case: `includes_suggested_fix`). The first entry is the revision under test (`role` becomes `affected` once a bug is reproduced); each verified fix adds a `patched-<bug_id>` entry with `result: "passes"`.
- `Investigation.status` is the case's ladder status. It never decreases.
- `stage == "awaiting-plan-approval"` shows the approve control (Flow step "approve").
- A `Bug` maps to the Case view's finding: `title`, `category`, `clock`, `failure`, `regression_test`, `issue_match_label`, and `fix`.
- `fix.attempts[-1].diff` is a unified diff of the source change; split it into `DiffLine`s for the fix panel. `fix.label` is the exact label to show.

## SSE events

`GET /investigations/{id}/events` sends `event: replay` messages whose `data` is one `ReplayEvent`. The shape is the frontend's `ReplayEvent` from `frontend/src/data/types.ts`, plus these differences:

- `id` is `e001`, `e002`, … (three digits; live runs can exceed 20 events). `seq` equals the SSE `id:` line. Reconnect with `Last-Event-ID` to resume.
- `browserClock` is always `null` in the MVP (no browser adapter). `serverClock` is either `"not controlled"` or a `ServerClockReading` with `method: "unit-test"`; its `label` reads "Test process clock set: TZ=…; unit-level test of …". It is the test process clock, not an app server. Never render it as "Browser clock controlled".
- New `kind` values: `stage` (pipeline stage changed; `data.stage`), `capability` (`data.items`), `approval` (`data.approval` is `plan` or `fix`; `data.pending: true` while waiting), `gate` (`data` is a `GateResult` plus `bug_id`, `attempt`). Extend `ReplayEventKind` with these; existing kinds keep their meaning.
- `data` is optional extra payload for the new kinds and for `explore` (top candidates), `plan` (`ready` count), `compare` (matched issue), `reveal` (`issue_url`, `outcome`: `match`, `no-match` or `not-judged`).
- `event: end` with `{"stage": ...}` closes the stream when the investigation is `completed`, `failed` or `cancelled`.

Actors: Wraith Director (opens and files the case), Watchtower Warden (stages, approvals, gates), Bat Scout (capabilities, discovery), Pumpkin Mechanic (plan, experiments), Spider Weaver (observed anomalies), Raven Archivist (repeats, verification, issue match, fix review), Two-Faced Jack (Blind hunt seal and reveal), Doctor Stitch (fix attempts).

## Labels (Requirement 16, extended)

| Situation | Label |
|---|---|
| Investigation running | "Live" (`replay_label`) |
| Investigation finished | "Recorded investigation replay" |
| Stub agent runtime | `runtime_label` = "Stub runtime, not a Kiro Crew run". Show it on the case |
| Discovery output | "These are candidates, not proven bugs." |
| Bug | Only exists after 3/3 clean repeats plus Raven's judgement: "Reproduced" |
| Issue search | `issue_match_label`: "Known issue: #n", "No matching public issue found", "Possible related issues found; match not judged", "Issue search unavailable" |
| Fix | `fix.label`: "Suggested fix · verified" only when all 8 gates passed; "Suggested fix · not verified", "No safe fix found", "No fix attempted: …", "Fix not attempted: fix budget reached" |
| No anomalies | "No anomaly observed in tested cases" |
| Gateway badge | "Gateway connected" when `/health` answers; otherwise keep "Demo mode, simulated status" and show only sample and draft cases |

The two sample cases keep their existing labels.

## Running locally

```
uv --directory backend sync
uv --directory backend run uvicorn timewraith.api:app --host 127.0.0.1 --port 8787
```

Docker Desktop must be running for anything after plan approval. Without it the investigation fails with `sandbox_unavailable` and a clear message.
