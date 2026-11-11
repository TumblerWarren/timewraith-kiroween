# Requirements Document: TimeWraith Backend, Milestone 1

## Introduction

TimeWraith is a repository-agnostic temporal bug investigator, first optimized for JavaScript and TypeScript repositories. The user gives a public GitHub repository and a branch, tag or commit. Kiro Crew discovers the repository's time-sensitive behavior, designs temporal experiments, runs them in an isolated environment and identifies reproducible bugs.

This document covers **Milestone 1 (M1)** only: an unfamiliar repository goes in, and three artifacts come out:
- a **Feature_Map** of time-sensitive candidates with source references,
- an executable **Test_Plan** of temporal experiments, each with a chosen adapter and clock configuration,
- a **Capability_Report** that states what TimeWraith can and cannot do with this repository.

M1 reads files only. It does not install dependencies, build, launch or test the target. Execution (M2), verification and evidence (M3) and the Case Board connection (M4) are later milestones, and their requirements are listed only where M1 must prepare for them.

The frontend spec (`.kiro/specs/timewraith/`) is unchanged by this document. Its rule that the frontend makes no backend requests stays in force until M4.

Out of scope for M1: running any target code, private repositories, authentication, multi-user hosting, languages other than JavaScript and TypeScript (they get a Capability_Report only), Redis and RQ, S3 storage, Server-Sent Events, suggested fixes.

## Glossary

- **Backend**: The Python 3.14 FastAPI service and its modules in `backend/`.
- **Investigation**: One analysis of one Target_Revision. It has an id, a status and the three output artifacts.
- **Target_Repository**: A public GitHub repository given by its HTTPS URL.
- **Target_Ref**: The branch, tag or commit the user gives.
- **Target_Revision**: The full 40-character commit SHA that the Target_Ref resolved to when the Investigation started. All output refers to the Target_Revision, never to a moving branch name.
- **Workspace**: The directory that holds one cloned Target_Revision, under `TW_WORKSPACE_DIR`, outside this git repository.
- **Repository_Analyzer**: The module that detects language, package manager, frameworks, workspaces, build scripts and test runners.
- **Temporal_Discovery_Engine**: The module that finds Signals and groups them into Candidates.
- **Signal**: One deterministic finding in the source: a file, a line range, a Signal_Kind and a short excerpt. Example: a `Date.now()` call in `src/auth/session.ts` lines 40 to 41.
- **Signal_Kind**: The type of a Signal, from the Signal_Catalog in the design (for example `time.now`, `time.timer`, `lib.date_fns`, `field.expiry`, `compare.date`, `tz.conversion`).
- **Candidate**: A group of related Signals in one code unit (function, method, component or module) that may hold time-sensitive behavior worth testing. A Candidate is never a bug.
- **Bug_Category**: One of the four M1 categories, `timezone_conversion`, `midnight_rollover`, `dst_transition`, `expiry_boundary`, or `other_temporal`.
- **Feature_Map**: The ranked list of Candidates for one Investigation.
- **Hypothesis**: A short statement of what could go wrong in a Candidate at a given time condition, with the Signals it is based on.
- **Experiment**: One planned temporal test: target Candidate, Adapter, Clock_Config, inputs, Oracle and Executability.
- **Test_Plan**: The ordered list of Experiments for one Investigation.
- **Adapter**: The execution method an Experiment will use from M2 on: `browser` (Playwright clock), `js_tests` (Vitest or Jest with fake timers), `node_function` (an isolated Node.js call with a controlled clock). `python_tests`, `http_api` and `container_app` are reserved names for later milestones.
- **Clock_Config**: The clock setup of an Experiment: the instant (ISO 8601 with offset), the IANA time zone, the clock mode (`fixed`, `paused`, `advance` with a step), and the Clock_Scope.
- **Clock_Scope**: Which clock the Experiment controls: `browser`, `test_process` or `node_process`. The app server's clock is never implied by a `browser` scope.
- **Oracle**: How an Experiment decides pass or fail: `existing_test` (an assertion from the repository's own tests), `specified_expectation` (a documented rule found in code, docs or types), or `invariant` (a Metamorphic_Property).
- **Metamorphic_Property**: A property that must hold across related runs when no exact expected output is known, with its declared exceptions. Example: converting one UTC instant between time zones preserves the instant.
- **Executability**: Whether an Experiment can run in M2: `ready`, `needs_setup` (with the missing piece named) or `not_controllable` (with the reason).
- **Capability_Report**: The per-repository statement of what was detected and what TimeWraith can and cannot do, each item with a status (`supported`, `unsupported`, `unknown`) and a reason.
- **Agent_Runtime**: The interface through which the Backend calls agents. Implementations: Kiro_Crew_Runtime and Stub_Runtime.
- **Kiro_Crew_Runtime**: The Agent_Runtime implementation that uses Kiro Crew (on `kiro-cli`, over ACP) through its Python client.
- **Stub_Runtime**: The deterministic Agent_Runtime used in tests and whenever Kiro Crew is not available. Its output is labeled "Stub runtime, not a Kiro Crew run".
- **Agent_Step**: One of the judgment steps that may call the Agent_Runtime: Candidate review (Bat Scout), Hypothesis writing (Bat Scout), Experiment design (Pumpkin Mechanic), with the Wraith Director as the parent session.
- **Audit_Log**: The append-only record of every Agent_Runtime call and every agent tool call.
- **Engine_Version**: The version string of the deterministic pipeline (analyzer, discovery, planning), stored with every Investigation.

## Requirements

### Requirement 1: Investigation request

**User Story:** As a user, I want to give TimeWraith only a repository URL and a ref, so that I can start an investigation without knowing which time feature to test.

#### Acceptance Criteria

1. WHEN a client sends `POST /api/v1/investigations` with a `repository_url` and a `ref`, THE Backend SHALL create an Investigation with status `queued` and return its id.
2. THE Backend SHALL accept only `https://github.com/<owner>/<repo>` URLs (optionally ending in `.git`), where owner and repository names match GitHub's allowed characters, and SHALL reject every other scheme, host, port, credential, query or fragment with a 422 response that names the rule.
3. THE Backend SHALL accept an optional `hints` object (free-text focus, paths to include or exclude) and SHALL NOT require it.
4. THE Backend SHALL resolve the Target_Ref to a Target_Revision before cloning and SHALL store both. IF the ref cannot be resolved, THEN THE Investigation SHALL end with status `failed` and the reason `ref_not_found`.
5. THE Backend SHALL NOT require a known bug, an issue URL, a test case or a repository-specific configuration file.

### Requirement 2: Ingestion and Workspace safety

**User Story:** As the operator, I want cloning to be safe and bounded, so that an untrusted repository cannot harm the host.

#### Acceptance Criteria

1. THE Backend SHALL clone only the Target_Revision, without submodules, without Git LFS content, with Git hooks disabled, and with `https` as the only allowed transport.
2. THE Backend SHALL enforce limits on clone time, total Workspace size and file count (defaults in the design) and SHALL end the Investigation with status `failed` and a named reason when a limit is exceeded.
3. THE Backend SHALL create each Workspace under `TW_WORKSPACE_DIR`, SHALL refuse a `TW_WORKSPACE_DIR` inside this git repository, and SHALL NOT follow symbolic links that point outside the Workspace.
4. THE Backend SHALL NOT run any command from the Target_Repository in M1: no install, build, test, lifecycle script or Git hook.
5. THE Backend SHALL delete a Workspace after a configurable retention period and SHALL keep the stored artifacts.

### Requirement 3: Repository analysis and Capability_Report

**User Story:** As a user, I want to know what TimeWraith detected about my repository and what it can test, so that I never mistake a gap for a result.

#### Acceptance Criteria

1. THE Repository_Analyzer SHALL detect, from files only: primary languages, package manager (from lockfiles), workspace layout (monorepo packages), frameworks (at least React, Next.js, Vue, Angular, Svelte, Express, NestJS, plain Node.js), test runners (Vitest, Jest, Mocha, Playwright, Cypress), fake-timer usage in existing tests, and date libraries (moment, moment-timezone, date-fns, date-fns-tz, dayjs, luxon, Temporal polyfill, rrule, cron libraries).
2. THE Backend SHALL produce a Capability_Report for every Investigation that reached analysis, including failed or unsupported ones.
3. Each Capability_Report item SHALL have a status (`supported`, `unsupported`, `unknown`), a reason and, where it applies, the files that support it.
4. WHEN the primary language is not JavaScript or TypeScript, THE Capability_Report SHALL say "Unsupported in M1: <language>" and THE Backend SHALL NOT produce Experiments for that code.
5. WHEN no Adapter can control the clock of a Candidate, THE Capability_Report SHALL say so with the reason and SHALL NOT fill the gap with a guessed result.

### Requirement 4: Temporal signal discovery

**User Story:** As a user, I want TimeWraith to find time-sensitive code by itself, so that I do not have to point at it.

#### Acceptance Criteria

1. THE Temporal_Discovery_Engine SHALL detect every Signal_Kind in the Signal_Catalog, including current-time reads (`Date.now()`, `new Date()` with no argument, `performance.now()`), timers (`setTimeout`, `setInterval`), date construction and parsing, date arithmetic and comparison, time-zone and locale formatting (`Intl.DateTimeFormat`, `toLocaleString`, `timeZone` options), date-library calls, expiry and schedule fields (names such as `expiresAt`, `ttl`, `validUntil`, `trialEnd`, `cron`), and cron expressions.
2. Each Signal SHALL record the file path relative to the Workspace root, the start and end line, the Signal_Kind, a confidence (`high`, `medium`, `low`) and an excerpt of at most 200 characters.
3. THE Temporal_Discovery_Engine SHALL skip `node_modules`, build output, vendored and minified files, lockfiles, and files above the size limit, and SHALL record the number of skipped files by reason.
4. THE Temporal_Discovery_Engine SHALL tag Signals in test files as `in_test` and SHALL use them as evidence of existing coverage, not as Candidates.
5. FOR a given Target_Revision and Engine_Version, THE Temporal_Discovery_Engine SHALL produce the same Signals in the same order.

### Requirement 5: Candidates and the Feature_Map

**User Story:** As a user, I want related signals grouped into features with a reason, so that I can see what is worth testing.

#### Acceptance Criteria

1. THE Temporal_Discovery_Engine SHALL group Signals into Candidates by their enclosing code unit (function, method, class, component or module).
2. Each Candidate SHALL have an id that is stable for the same Target_Revision and Engine_Version, a title, the code unit's location, its Signals, one or more Bug_Categories, a deterministic score with the score's parts, the existing tests that reference it, and the status `candidate`.
3. THE Feature_Map SHALL list Candidates in score order and SHALL state "These are candidates, not proven bugs."
4. THE Feature_Map SHALL link each Candidate to the routes, pages or exports that reach it, when the Repository_Analyzer detected them.
5. THE Backend SHALL NOT mark any Candidate as a bug in M1.

### Requirement 6: Agent_Steps

**User Story:** As a user, I want Kiro Crew to judge which candidates matter and why, so that the plan reflects reasoning rather than keyword counts alone.

#### Acceptance Criteria

1. THE Backend SHALL call the Agent_Runtime only for the Agent_Steps (candidate review, Hypothesis writing, Experiment design). Cloning, analysis, signal discovery, scoring, schema validation and Executability decisions SHALL be deterministic code.
2. Every Agent_Step output SHALL be validated against its Pydantic schema. Output that fails validation SHALL be retried at most twice and then dropped, and the drop SHALL be recorded in the Audit_Log and the Investigation.
3. Every file reference, line range and Signal id in agent output SHALL exist in the discovery index. References that do not exist SHALL be removed and counted.
4. Agents SHALL get read-only tools limited to the Workspace (read file, list files, search) and no shell, no network and no write access. Every tool call SHALL be checked against the allowlist and recorded in the Audit_Log.
5. THE Backend SHALL treat repository content shown to agents as untrusted data, SHALL wrap it as quoted data in prompts, and SHALL NOT let it change the tool allowlist or the output schema.
6. IF the Agent_Runtime is unavailable or fails, THEN THE Backend SHALL complete the Investigation with the deterministic ranking and deterministic Experiment templates and SHALL label the affected sections "Agent review not run".
7. Each Agent_Step output SHALL record which runtime produced it. Stub_Runtime output SHALL be labeled "Stub runtime, not a Kiro Crew run".

### Requirement 7: Test_Plan

**User Story:** As a user, I want an executable plan of temporal experiments, so that the next milestone can run them without redesign.

#### Acceptance Criteria

1. FOR each selected Candidate, THE Backend SHALL plan at least one baseline Experiment and the boundary Experiments its Bug_Categories call for (defined in the design): for `expiry_boundary`, one minute before, the exact instant and one minute after; for `midnight_rollover`, 23:59:59, 00:00:00 and 00:00:01 local, plus month end, year end and 29 February; for `dst_transition`, the spring-forward gap and the fall-back overlap in at least two zones with different rules; for `timezone_conversion`, at least one zone west and one east of UTC, one non-whole-hour offset, and UTC.
2. Each Experiment SHALL have an Adapter, a Clock_Config with an explicit Clock_Scope, inputs, an Oracle and an Executability.
3. THE Backend SHALL choose the Adapter from the Capability_Report, in this order: `js_tests` when a supported test runner exists and the Candidate is importable from a test, `node_function` when the Candidate is a pure or clock-injected module function, `browser` when the Candidate is reached only through UI.
4. WHEN a Candidate's behavior depends on a server clock that no M1 Adapter controls, THE Experiment SHALL have Executability `not_controllable` and the reason "Server clock not controlled by this adapter".
5. Each Experiment with Oracle `invariant` SHALL name its Metamorphic_Property and the exceptions that apply.
6. THE Test_Plan SHALL be ordered by Candidate score, then by Experiment type (baseline first), and SHALL cap the number of Experiments per Investigation (default in the design).
7. THE Test_Plan SHALL be expressed in a versioned JSON format that the M2 executor reads without the Agent_Runtime.

### Requirement 8: Metamorphic_Properties

**User Story:** As a user, I want checks that work without a known expected output, and I want them to avoid false alarms.

#### Acceptance Criteria

1. THE Backend SHALL ship a catalog of Metamorphic_Properties, each with an id, a statement, the Bug_Categories it applies to and its declared exceptions.
2. THE catalog SHALL include at least: instant preservation across zone conversion; display-zone change does not change a stored timestamp; serialize then parse round-trip preserves the instant; adding N days then subtracting N days returns the start date in a zone without a transition on those days; ordering of two instants is the same in every zone.
3. Each property SHALL declare its exceptions (for example, wall-clock arithmetic across a DST transition, intentional rounding, date-only values without a zone), and THE planner SHALL NOT select a property for an Experiment whose inputs fall under one of its exceptions.

### Requirement 9: Agent_Runtime and Kiro Crew

**User Story:** As the developer, I want agents behind one interface, so that Kiro Crew can be replaced or stubbed without touching the pipeline.

#### Acceptance Criteria

1. THE Backend SHALL define an Agent_Runtime interface with one method per Agent_Step that takes typed input and returns typed output.
2. THE Backend SHALL provide a Stub_Runtime whose output depends only on its input.
3. THE Backend SHALL provide a Kiro_Crew_Runtime built on the officially documented Kiro Crew Python client, with the Wraith Director as the parent session and Bat Scout and Pumpkin Mechanic as subagents or agent profiles.
4. THE runtime SHALL be selected by configuration (`TW_AGENT_RUNTIME=stub|kiro_crew`). WHEN `kiro_crew` is selected and Kiro Crew is not reachable at startup, THE Backend SHALL log the reason and report the runtime as unavailable in `GET /api/v1/health`; it SHALL NOT switch to the stub silently.
5. THE Audit_Log SHALL record for every Agent_Runtime call: Investigation id, Agent_Step, runtime, start and end time, outcome, and for every tool call the tool name, arguments (with Workspace-relative paths) and result status.

### Requirement 10: API

**User Story:** As the frontend developer, I want a small, typed API, so that the Case Board can show real investigations in M4.

#### Acceptance Criteria

1. THE Backend SHALL expose: `POST /api/v1/investigations`, `GET /api/v1/investigations`, `GET /api/v1/investigations/{id}`, `GET /api/v1/investigations/{id}/feature-map`, `GET /api/v1/investigations/{id}/test-plan`, `GET /api/v1/investigations/{id}/capabilities`, and `GET /api/v1/health`.
2. THE Backend SHALL report Investigation status as one of `queued`, `cloning`, `analyzing`, `discovering`, `reviewing`, `planning`, `completed`, `failed`, with the current stage and timestamps.
3. THE Backend SHALL export the JSON Schemas of all response models to `backend/schemas/` and SHALL fail a test when the checked-in export differs from the models.
4. In M1, THE Backend SHALL bind to `127.0.0.1` by default and SHALL allow cross-origin requests only from configured frontend origins.
5. Error responses SHALL use one JSON shape with a machine-readable code and a human-readable message and SHALL NOT include stack traces, secrets or absolute host paths.

### Requirement 11: Persistence

**User Story:** As the operator, I want investigations and their artifacts stored, so that results survive restarts and can be compared.

#### Acceptance Criteria

1. THE Backend SHALL store Investigations, Signals, Candidates, Experiments, Capability_Reports and the Audit_Log in PostgreSQL, with schema changes only through Alembic migrations.
2. THE Backend SHALL store with each Investigation: the Target_Repository, Target_Ref, Target_Revision, Engine_Version, runtime, and start and end times.
3. WHEN an Investigation is requested for a Target_Revision and Engine_Version that already has a completed Investigation, THE Backend SHALL create a new Investigation and SHALL NOT reuse or overwrite the earlier one.

### Requirement 12: Honesty in output

**User Story:** As a judge or user, I want every output to say exactly what it is, so that I can trust it.

#### Acceptance Criteria

1. THE Feature_Map, Test_Plan and Capability_Report SHALL each carry a `kind` label: "Discovery candidates, not verified bugs", "Planned experiments, not run", and "Capability report".
2. In human-readable text of M1 artifacts (titles, labels, summaries, reasons), THE Backend SHALL NOT call anything a "bug", "failure", "reproduced", "verified" or "Live", except inside a Hypothesis that states a possibility ("could", "may"). Schema field names such as `bug_categories` are not affected.
3. Every Clock_Config SHALL state its Clock_Scope, and THE Backend SHALL NOT describe a `browser` scope as controlling server time.
4. Each artifact SHALL state the runtime that produced its agent parts, or "Agent review not run".

### Requirement 13: Repository-agnostic engine and validation

**User Story:** As the team, I want proof that the engine works on repositories it has never seen, so that the core promise holds.

#### Acceptance Criteria

1. THE core engine (`analyzer/`, `discovery/`, `planning/`) SHALL contain no repository-specific names, paths or rules. A test SHALL scan these modules for the names of the validation repositories and fail if any appears.
2. THE team SHALL run M1 on at least three unrelated open-source JavaScript or TypeScript repositories from different domains (listed in the design, to be confirmed by the user), each pinned to a commit SHA.
3. FOR each validation repository, the run SHALL produce a Feature_Map with at least one Candidate, a Test_Plan with at least one Experiment that is `ready` or `needs_setup`, and a Capability_Report. Results and a short manual precision review (true candidate, plausible, not time-sensitive) SHALL be written to `docs/reports/backend-m1-validation.md`.
4. Deterministic outputs (Signals, Candidates without agent fields, Experiment templates) for the validation repositories SHALL be kept as snapshot tests.

### Requirement 14: Tooling and quality gate

**User Story:** As the developer, I want one command that proves the backend is healthy.

#### Acceptance Criteria

1. THE Backend SHALL use Python 3.14 managed by `uv` with a committed `uv.lock`.
2. `uv --directory backend run pytest`, `ruff check`, `ruff format --check` and `mypy --strict src` SHALL pass with zero errors before a task is marked done.
3. Tests SHALL run without network, without Docker and without Kiro Crew, using small synthetic repositories in `backend/tests/fixtures/repos/` and the Stub_Runtime. Tests that need PostgreSQL SHALL be marked and skipped when it is not reachable.
4. Secrets and machine paths SHALL come from environment variables or `backend/.env` (git-ignored), with a committed `backend/.env.example`.

### Requirement 15: Preparation for M2 to M4

**User Story:** As the team, I want M1 shaped so that execution, verification and the UI connect without rework.

#### Acceptance Criteria

1. THE Test_Plan format SHALL include every field the M2 executor needs to run an Experiment in a restricted container: Adapter, Clock_Config, entry point (test file, module export or URL path), inputs, Oracle, and the setup steps the Repository_Analyzer detected (install and test commands, recorded but not run).
2. THE Investigation status model SHALL be able to add M2 and M3 stages (`executing`, `verifying`) without changing existing stage names.
3. THE Backend SHALL emit an internal event for every stage change and Agent_Step, in a shape that M4 can stream over Server-Sent Events.
