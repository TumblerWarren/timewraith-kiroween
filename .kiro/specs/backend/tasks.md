# Implementation Plan: TimeWraith Backend, Milestone 1

## Overview

The plan builds M1 in slices that each end in passing tests:
1. Task 1 checks the tools, most importantly whether Kiro Crew can do what design decision B1 needs.
2. The scaffold and the schemas come next.
3. After that, the deterministic pipeline: ingest, analyzer, discovery, planning.
4. Then the agent layer: stub first, then Kiro Crew.
5. Persistence and the API follow.
6. The plan ends with the validation run on three unrelated repositories and a checkpoint.

Implementation language: Python 3.14 in `backend/`, managed by `uv`. Commands run from the repo root, for example `uv --directory backend run pytest`. Do not start `uvicorn` or `docker compose up` from the agent; tell the user the command. Tests marked `*` are optional. All others are required.

## Tasks

- [ ] 1. Tool check for the backend (design B1, B2, B8)
  - [ ] 1.1 Install and verify Kiro Crew (needs the user)
    - Read the official install guides (`docs/guides/install.md` and `docs/guides/windows-install.md` in `kirodotdev/KiroCrew`) and give the user the exact install and sign-in commands; the user runs them
    - Confirm the six points from the design: install on Windows, `kiro-cli` sign-in, headless dispatch from Python through the documented client, an agent profile that removes built-in tools and allows only one MCP server, per-session MCP configuration, reading a final reply and its task status
    - Write a throwaway probe in `backend/scripts/probe_kiro_crew.py` that opens one session, dispatches one subagent with a restricted profile, and prints the reply. Record the client version, the API calls used and the result
    - Record everything in `docs/backend-tool-check.md` with a verdict: B1 (Kiro Crew client) or B2 (`kiro-cli` over ACP). If neither works, stop and ask the user
    - _Requirements: 9.3, 9.4, 6.4_
  - [ ] 1.2 Check the local toolchain
    - Record `git`, `rg`, `uv`, `python`, `docker` versions and whether Docker Desktop is running; recommend Git 2.50.1 or later (design B6)
    - Check that `tree-sitter`, `tree-sitter-javascript` and `tree-sitter-typescript` install under Python 3.14 with `uv`; if not, record fallback B8
    - _Requirements: 14.1_

- [ ] 2. Scaffold `backend/`
  - [ ] 2.1 Create the project
    - `pyproject.toml` (FastAPI, uvicorn, pydantic, pydantic-settings, SQLAlchemy 2, asyncpg, Alembic, httpx, the tree-sitter packages or the fallback, an MCP Python SDK for `tw-tools`); dev: pytest, pytest-asyncio, Hypothesis, Ruff, mypy
    - `src/timewraith/config.py` with all `TW_*` settings and the defaults of design B11; `version.py`; `.env.example`; add `backend/.env` and `.venv` to `.gitignore`
    - `compose.yaml` with Postgres 17 on host port 5433 and a named volume
    - Ruff and mypy strict config; a `backend/README.md` with the commands
    - _Requirements: 14.1, 14.2, 14.4_
  - [ ] 2.2 Add the `pytest` layout and the fixture-repo builder
    - `tests/fixtures/repos/` sources for `expiry-lib`, `cron-scheduler`, `react-calendar`, `python-only`, `no-time`, and a builder that turns each into a local Git repo in a temp dir
    - The `db` marker, skipped when `TW_TEST_DATABASE_URL` is unreachable
    - _Requirements: 14.3_

- [ ] 3. Data contracts
  - [ ] 3.1 Write the Pydantic models in `schemas/` from the design's Data contracts section, including the `Labelled` base with the fixed `kind` and runtime labels
    - _Requirements: 5.2, 7.2, 7.7, 12.1, 12.4, 3.3_
  - [ ] 3.2 Write `schemas/export.py` and check in `backend/schemas/*.schema.json`
    - _Requirements: 10.3_
  - [ ] 3.3 Test that the export matches the checked-in files
    - _Requirements: 10.3_

- [ ] 4. Ingestion
  - [ ] 4.1 `ingest/url.py` and `ingest/refs.py`: the URL grammar, normalisation and ref rules of the design; `git ls-remote` resolution with argument lists only
    - _Requirements: 1.2, 1.4_
  - [ ] 4.2 `ingest/clone.py` and `ingest/workspace.py`: hardened fetch of one SHA, limits, the Workspace location check, retention cleanup
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  - [ ] 4.3 Property tests for URL and ref validation (Hypothesis)
    - _Requirements: 1.2_
  - [ ] 4.4 Integration tests for the clone: hooks do not run, no submodules, symlinks become files, limits fail with a named reason
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 5. Repository analyzer and Capability_Report
  - [ ] 5.1 `analyzer/manifests.py`, `frameworks.py`, `tests.py`: detection from files only, workspaces, fake timers, clock injection points, recorded commands
    - _Requirements: 3.1, 15.1, 2.4_
  - [ ] 5.2 `analyzer/capabilities.py`: the Capability_Report items table, including `clock.server` always unsupported and the "Unsupported in M1" rule
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  - [ ] 5.3 Unit tests: the expected Capability_Report for each fixture repo
    - _Requirements: 3.1 to 3.5_

- [ ] 6. Temporal Discovery Engine
  - [ ] 6.1 `discovery/catalog.py` and `scan.py`: the Signal_Catalog, file selection and skip rules with counts, `in_test` tagging
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ] 6.2 `discovery/syntax.py`: Tree-sitter queries for call sites, enclosing units, imports and exports; the fallback scope finder (B8)
    - _Requirements: 4.1, 5.1_
  - [ ] 6.3 `discovery/candidates.py` and `scoring.py`: grouping, stable ids, Bug_Category rules, reachability, existing tests, score with parts
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ] 6.4 Unit tests: each Signal_Kind found in a minimal snippet; Bug_Category rules
    - _Requirements: 4.1, 5.2_
  - [ ] 6.5 Property tests: determinism under file-order shuffles; stable Candidate ids; score monotonic and parts sum to total
    - _Requirements: 4.5, 5.2_

- [ ] 7. Checkpoint: deterministic Feature_Map
  - Run the pipeline up to discovery on the five fixture repos and show the user the Feature_Map of `expiry-lib` and `react-calendar`. Ask whether the candidates look right before planning starts

- [ ] 8. Planning
  - [ ] 8.1 `planning/templates.py`: the Experiment templates table with fixed reference dates
    - _Requirements: 7.1_
  - [ ] 8.2 `planning/metamorphic.py`: the catalog with exceptions and the selection rule
    - _Requirements: 8.1, 8.2, 8.3, 7.5_
  - [ ] 8.3 `planning/adapters.py` and `plan.py`: Adapter choice, Clock_Scope, Executability with reasons, ordering and caps, recorded setup steps
    - _Requirements: 7.2, 7.3, 7.4, 7.6, 7.7, 12.3, 15.1_
  - [ ] 8.4 Tests: every template zone is valid in `zoneinfo`; DST instants fall in a real gap or overlap; no property is attached when an exception applies; every Experiment has a Clock_Scope; `browser` scope never claims server time
    - _Requirements: 7.1, 7.4, 8.3, 12.3_

- [ ] 9. Agent layer
  - [ ] 9.1 `runtime/base.py`, `stub.py`, `validate.py`, `audit.py`: the interface, the StubRuntime, output validation with reference checks and retries, the Audit_Log writer
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7, 9.1, 9.2, 9.5_
  - [ ] 9.2 `runtime/tools_server.py`: the `tw-tools` MCP server with path confinement, caps and auditing
    - _Requirements: 6.4, 9.5_
  - [ ] 9.3 `runtime/prompts.py` and the three agent profiles in `backend/agents/`: untrusted-data framing, built-in tools disabled, only `tw-tools` allowed
    - _Requirements: 6.4, 6.5_
  - [ ] 9.4 `runtime/kiro_crew.py` (or the B2 fallback, per task 1.1): Wraith Director session, Bat Scout and Pumpkin Mechanic subagents, session directory outside the Workspace, health check, no silent fallback
    - _Requirements: 9.3, 9.4, 6.7_
  - [ ] 9.5 Tests: invented ids and paths are removed; Hypotheses without "could"/"may" are rejected; agent edits cannot change adapter, scope or Executability; `tw-tools` refuses `..`, absolute, drive-letter and UNC paths; every tool call is audited
    - _Requirements: 6.2, 6.3, 6.4, 12.2_
  - [ ]* 9.6 Prompt-injection test: a fixture file containing instructions aimed at agents does not change the tool set or the output schema (Kiro Crew runtime, manual run)
    - _Requirements: 6.5_

- [ ] 10. Persistence and jobs
  - [ ] 10.1 `db/models.py` and the first Alembic migration from the design's Persistence section; `db/repo.py`
    - _Requirements: 11.1, 11.2, 11.3_
  - [ ] 10.2 `jobs/runner.py` and `pipeline.py`: in-process runner with the concurrency cap, stage updates, events, `interrupted` on restart
    - _Requirements: 10.2, 15.2, 15.3_
  - [ ]* 10.3 `db` tests for the repository layer and the migration (needs Docker Desktop running)
    - _Requirements: 11.1_

- [ ] 11. API
  - [ ] 11.1 `api/app.py`, `routes.py`, `errors.py`, `events.py`: the endpoints, status model, error shape, localhost bind, CORS
    - _Requirements: 1.1, 1.3, 1.5, 10.1, 10.2, 10.4, 10.5_
  - [ ] 11.2 Integration test: a full run on `expiry-lib` with the StubRuntime through the API; 409 before ready; error shape without absolute paths
    - _Requirements: 10.1, 10.2, 10.5, 12.1, 12.4_
  - [ ] 11.3 Honesty text test: banned words absent from generated labels and reasons across all fixture runs
    - _Requirements: 12.2_

- [ ] 12. Repository-agnostic validation
  - [ ] 12.1 Add the guard test that scans `analyzer/`, `discovery/` and `planning/` for the validation repository names
    - _Requirements: 13.1_
  - [ ] 12.2 Ask the user to confirm the three validation repositories (design B10), pin each to a commit SHA, run M1 with the StubRuntime and then with Kiro Crew
    - _Requirements: 13.2, 13.3_
  - [ ] 12.3 Write `docs/reports/backend-m1-validation.md`: per repository, the Capability_Report summary, the top 10 Candidates with a manual precision label (true candidate, plausible, not time-sensitive), the Experiment counts by Executability, and the stub and Kiro Crew outputs side by side
    - _Requirements: 13.3_
  - [ ]* 12.4 Snapshot tests of the deterministic outputs for the three repositories (stored as JSON, refreshed only on an Engine_Version change)
    - _Requirements: 13.4_

- [ ] 13. Final checkpoint for M1
  - `pytest`, `ruff check`, `ruff format --check` and `mypy --strict src` pass with zero errors
  - Show the user the validation report and the open items for M2 (containers, Redis and RQ, executor) and M4 (SSE, frontend types)
  - Append an entry to `docs/kiro-usage.md` for the backend spec and for any hook or steering rule that caught something

## Notes

- Kiro Crew is not installed yet (2026-11-11). Tasks 2 to 8 do not depend on it, so they can proceed while task 1.1 waits for the user.
- Docker Desktop is installed but was not running on 2026-11-11. Only tasks 10.3 and the database part of 11 need it.
- The frontend is untouched until M4. Its no-network rule stays in force.
