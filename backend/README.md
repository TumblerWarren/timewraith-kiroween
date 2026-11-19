# TimeWraith backend (MVP)

You give it a public GitHub repository and a ref. Kiro agents propose and code decides, through five steps:

| # | Step | Owner | Kind | What happens | Who decides |
|---|---|---|---|---|---|
| 1 | Repository | Wraith Director | code | Clones one commit with hardened Git (no hooks, submodules, LFS or symlinks) and builds the capability report | Code |
| 2 | Time-sensitive code discovery | Bat Scout | Kiro agent | Bat reviews the top 15 scanner candidates and can choose up to six JS/TS source files to inspect for additional leads | Scanner selections cite their own signals. Source leads cite a matching line and quote, and take priority within the experiment budget |
| 3 | Autonomous experiment design | Pumpkin Mechanic | Kiro agent | Writes an **adapter** (how to call the code, which output fields to read) and picks invariants from a fixed catalog | Code drops invariants the adapter cannot feed and checks the adapter at baseline. The harness picks the clock points |
| — | Plan approval | you | | Skipped when `auto` is set | |
| 4 | Controlled execution | Spider Weaver | code | Sweeps about 2,600 clock points per experiment in 13 zones: every DST transition 2024–2026 (±1 ms to ±1 h), month ends, leap day, and anchors. Runs in no-network Docker | Invariant oracles in `sweep.py` |
| 5 | Independent bug verification | Raven Archivist | Kiro agent | Violations repeated 3/3 from clean containers get a verdict: defect, intended behaviour, allowed exception or adapter error. Before the verdict, code collects the repository's own tests and docs about that code and transition (`intent.py`) | A bug needs 3/3 repeats, a generated regression test that fails, and a defect verdict citing the invariant and the failing point. Intended behaviour needs a cited repository test that passes on the original revision, or a cited doc line; it is listed, never fixed |
| + | Fix | Doctor Stitch | Kiro agent, with tools | Works in a Kiro CLI session through TimeWraith's tools (read, search, edit, run the regression test, check all zones, submit). Up to 3 attempts per bug | Eight gates on a clean copy with only his diff applied, then you accept |

The flow with every decision point is drawn in [docs/agent-flow.md](../docs/agent-flow.md).

Every agent call produces a `DecisionRecord`: the claim, the evidence that resolved, how many citations were removed, the checks, and the rule that decided. Records are stored on the investigation, streamed as `decision` events and listed at `GET /investigations/{id}/decisions`.

## Invariants (the oracles)

| id | Needs field | Rule |
|---|---|---|
| `well_formed` | (always) | No throw, no NaN, no Invalid Date |
| `deterministic` | (always) | Same instant and zone give the same output |
| `local_date_matches` | `date` | "Today" equals the calendar date in the process zone (catches `toISOString().slice(0, 10)`) |
| `instant_zone_independent` | `instant` | A stored instant does not depend on the process zone |
| `flag_monotonic` | `flag` | Changes at most once as time moves forward (for example, expired stays expired) |
| `next_after_now` | `next` | Next run is after now, never moves backwards, and stays within `max_gap_ms` if set |

Each invariant lists its exceptions, which Pumpkin Mechanic and Raven Archivist see. The regression test for a bug is generated from the violated invariant, not written by an LLM.

## The eight fix gates (all required, cheapest first)

1. **test_first:** the violation repeated 3/3, and the generated regression test failed on the original code.
2. **diff_limits:** at most 3 files and 60 lines. No tests, test config, manifests, lockfiles, CI files, `__tw__/` or `.tw/` are touched.
3. **fixed:** the regression test passes 3/3, and a full 13-zone sweep shows the invariant holds.
4. **mutation_check:** reverting only the source change makes the test fail again.
5. **no_regressions:** the full suite has no new failures.
6. **no_new_anomalies:** no experiment shows a violation it did not show before.
7. **static_checks:** the repo's `tsc --noEmit` and ESLint do not newly fail.
8. **independent_review:** Raven Archivist reviews the diff without Doctor Stitch's reasoning.

Before the gates run, Doctor Stitch's root cause must cite real source lines.

### Fix sessions (Doctor Stitch with tools)

Each fix attempt is one Kiro CLI session in the Kiro Crew container, with the agent profile `tw-doctor-stitch`. The session has no shell and no built-in file tools. Its only tools are TimeWraith's, served by `backend/agents/tw_mcp_proxy.py`, a small stdio MCP server that forwards each call to `POST /api/v1/internal/fix-tools/call` with a token that works only while that attempt runs. The tools and their limits are in [docs/agent-flow.md](../docs/agent-flow.md#the-fix-step-in-detail).

Edits are exact text (`replace`) or line ranges (`replace_lines`), keep the file's line endings, and refuse tests, test config, manifests, lockfiles, CI files and generated files. After `submit`, the backend takes `git diff` and applies it to a new clean copy before the gates run, so the patch is judged on its own. If the time budget runs out during the fix step, the case keeps its bugs and regression tests.

## Adapter repair sessions (Pumpkin Mechanic with tools)

After install, an adapter must run at ordinary instants in UTC and New York, return its fields, and keep every rule its fields feed. An adapter that fails gets one Kiro CLI session with the profile `tw-pumpkin-mechanic` (`designsession.py`): read the code, rewrite the adapter, run it at points he picks, recheck, submit. Code reruns the check on submit. A rule that still breaks at ordinary instants is dropped. Limits: `TW_DESIGN_SESSION_S` (480), `TW_MAX_DESIGN_CALLS` (25), `TW_MAX_ADAPTER_RUNS` (8). Details in [docs/agent-flow.md](../docs/agent-flow.md#baseline-check-and-adapter-repair-pumpkin-with-tools).

## Verification sessions (Raven Archivist with tools)

With the Kiro Crew container runtime, selected repeated violations can receive a Kiro CLI session when budget permits with the profile `tw-raven-archivist`. Her tools (`verifysession.py`) read the repository, run probes against the real code with a frozen clock in a read-only sandbox, run repository tests, search issues and pull requests, and submit a verdict. A defect is accepted only when code reruns her reproduction: its check fails 3/3 at the failing point, passes at a control point, and the regression test made from it fails with an assertion. The full rules are in [docs/agent-flow.md](../docs/agent-flow.md#agentic-verification-raven-with-tools). Limits: `TW_VERIFY_SESSION_S` (600), `TW_MAX_VERIFY_CALLS` (30), `TW_MAX_PROBES` (12).

## Dependency install and self-healing

The install is the only sandbox step with network. Before it runs, the backend moves TimeWraith's own folders (`__tw__/`, `.tw/`) out of the workspace and puts them back afterwards, so the repository's install scripts (a `prepare` build or a lint) never see agent-written files.

If the install fails, it retries up to `TW_INSTALL_RETRIES` times (default 3), each time adding one action from a fixed list (`installfix.py`):

| Action | Chosen by code when the log shows |
|---|---|
| Newer Node (20, then 22, then 24) | `npm error code EBADENGINE`, an incompatible engine, or (after scripts were skipped) an engine warning |
| Skip install scripts (`--ignore-scripts`) | A failed lifecycle script (`prepare`, `postinstall`, `ELIFECYCLE`) |
| Allow peer conflicts (`--legacy-peer-deps`) | `ERESOLVE` or a peer dependency conflict |
| Lockfile not enforced (`npm install`, `--no-frozen-lockfile`) | A lockfile out of sync with `package.json` |

That list is only quick first aid. Any other failure, a timeout, and any retry that did not help goes to the install mechanic (profile `install-mechanic.md`, `installsession.py`). The agent decides what to do and tries again: it reads the repository, runs any commands it needs in the install sandbox, switches to any Node version that has an image, and runs `check_install` (the repository's test runner must start in a container without network). A failed check is not final while it has budget. If the agent runs out of ideas, a new round starts, told what the earlier rounds did (`TW_INSTALL_ROUNDS`, default 3, each up to `TW_INSTALL_SESSION_S`, default 45 minutes, up to `TW_MAX_INSTALL_COMMANDS` commands). The sandbox is the limit, not the agent: a throwaway container with all capabilities dropped, a read-only root, memory and process limits, no secrets, no Docker socket and only the case's workspace mounted. Afterwards code undoes changes to files git tracks, so a fix's diff stays the repository's own. If every round fails, the case stops with `install_failed`, what was tried and the key log lines. A Node version that worked is kept for the later sandbox runs.

## Commands (from the repo root)

```
uv --directory backend sync
uv --directory backend run uvicorn timewraith.api:app --host 127.0.0.1 --port 8787
uv --directory backend run pytest
uv --directory backend run ruff check src tests scripts
uv --directory backend run mypy src
uv --directory backend run python -m timewraith.schema_export
uv --directory backend run python scripts/harness_smoke.py ../frontend/node_modules   # harness with real Vitest, no Docker
```

Configuration: `backend/.env` (see `.env.example`). Data (SQLite, workspaces, patches) lives in `TW_DATA_DIR`, by default `~/.timewraith`, never inside this repository.

## Setting up the Crew from the frontend

The readiness board on the Crew setup page (`#/crew`) walks through three steps, each with one button. The backend side is `crew.py`, and the endpoints are under `/api/v1/system/`. Every POST needs the `X-TimeWraith: 1` header, which a cross-site form cannot send.

1. **Start Docker** (`POST /system/docker/start`) launches Docker Desktop on Windows or macOS. It runs only when you press the button.
2. **Start Kiro Crew** (`POST /system/crew/start`) pulls `ghcr.io/kirodotdev/kirocrew:stable` and runs it as the `timewraith-crew` container:
   - `--cap-drop ALL`, `no-new-privileges`, 2 GB memory and 256 processes;
   - the home directory in the `timewraith-crew-home` volume;
   - no repository and no workspace mounted.
3. **Sign in with Google, GitHub or Builder ID** (`POST /system/crew/login` with `{"method": "google" | "github" | "builder_id"}`). Builder ID runs `kiro-cli login --license free --use-device-flow`. `kiro-cli` shows its Google and GitHub choices only in a terminal menu, so for those the backend runs `agents/tw_login.py` in the container: it starts `kiro-cli login` in a pseudo-terminal, picks the menu entry by its label, and passes the printed code and `app.kiro.dev` link to the board. Different methods can be different Kiro accounts with separate credits. The board shows the one-time code and a link to the sign-in page, and you approve in your own browser. The sign-in persists in the volume. If the sign-in page shows an error (such as "We were unable to sign you in to your AWS Builder ID"), **Cancel sign-in** (`POST /system/crew/login/cancel`) stops the waiting `kiro-cli login` in the container, and **Sign in to Kiro** starts again with a new code.
4. **Sign out of Kiro** (`POST /system/crew/logout`) runs `kiro-cli logout` in the container. The setup page asks for confirmation first, because signing out stops real agent calls.
5. **Delete Crew** (`POST /system/crew/delete`) removes the Crew container and saved-sign-in volume after confirmation. Case history and the downloaded image remain. Setup or sign-in must finish first, and Docker must be running. Failed volume removal can be retried with Delete Crew.

The setup page shows the signed-in account, read from `kiro-cli whoami`.

With the default `TW_AGENT_RUNTIME=auto`, agent calls go to the container as soon as it is signed in. Judgment calls run `kiro-cli chat --no-interactive --trust-tools=` in a fresh empty directory, so those agents get no tools. Fix sessions are the only exception, and they get TimeWraith's tools only. To remove everything: `docker rm -f timewraith-crew` and `docker volume rm timewraith-crew-home`.

## Agent runtime

The profiles in `backend/agents/` include Bat Scout, Pumpkin Mechanic, Raven Archivist, Doctor Stitch, Wraith Director and the install mechanic. Initial review, design and planning use structured responses. With the container runtime, Pumpkin and Raven can also use scoped tools in repair and verification sessions, and Doctor Stitch uses scoped fix tools. Repository content supplied to agents is treated as untrusted data.

Settings are read from `TW_*` environment variables or `backend/.env`. The ones you are most likely to change:

| Variable | Default | Meaning |
|---|---|---|
| `TW_DATA_DIR` | `~/.timewraith` | SQLite database, workspaces and patches. Must be outside this repository |
| `TW_AGENT_RUNTIME` | `auto` | `auto`, `stub` or `command` |
| `TW_INVESTIGATION_BUDGET_S` | `10800` | Active time per investigation (three hours) |
| `TW_MAX_AGENT_CALLS` | `40` | Agent calls per investigation |
| `TW_MAX_FIX_ATTEMPTS` | `3` | Fix attempts per bug |
| `TW_FIX_SESSION_S` | `720` | Time per fix session |
| `TW_MAX_TOOL_CALLS` | `40` | Tool calls per fix session |
| `TW_INSTALL_RETRIES` | `3` | Quick fixed retries after a failed dependency install, before the install mechanic |
| `TW_INSTALL_ROUNDS` | `3` | Install mechanic rounds, each told what the earlier ones tried |
| `TW_INSTALL_SESSION_S` | `2700` | Time for one install mechanic round |
| `TW_MAX_INSTALL_COMMANDS` / `TW_MAX_INSTALL_CALLS` | `300` / `400` | Commands and tool calls per round |
| `TW_CREW_BACKEND_URL` | `http://host.docker.internal:8787` | How the Kiro Crew container reaches this backend's fix tools |

Every setting and its limit is listed in `src/timewraith/config.py`.

Runtimes:

- `TW_AGENT_RUNTIME=auto` (default): the local Kiro Crew container once it is signed in, otherwise the stub.
- `TW_AGENT_RUNTIME=stub`: no LLM. Steps 1, 2 and 4 machinery work; steps 3 and 5 and the fix report "not run" instead of guessing, so nothing gets swept.
- `TW_AGENT_RUNTIME=command` with `TW_AGENT_COMMAND`: runs the command (`{agent}` is replaced by the profile name) with the profile, the task and the reply schema on stdin, and expects one JSON object on stdout. This is the seam for Kiro Crew / `kiro-cli` once its headless call is confirmed (backend spec task 1.1).

## Limits of the MVP

- Python cases use a Python 3.14 worker. The Crew reads repository source, selects a supported setup (uv lock, requirements file, root package or dependency-free source), and designs a pytest experiment. Each probe runs offline in a fresh container with read-only source and dependencies. The worker sets the process time zone and controls Python’s Unix, date/datetime, and monotonic clocks. Probes can use `timewraith_clock.advance(seconds, wall=True, monotonic=True)` to move wall and elapsed time independently. Published regression tests run with ordinary pytest and supply their own time inputs. Raven checks that the selected source ran, the assertion fails repeatedly, and the control passes. The Director can propose another lead within the case budget. Older approved plans can still replay existing pytest files.
- JavaScript and TypeScript with Vitest or Jest, run from the repository root. Harness files live in `__tw__/` next to the source. With Jest, runs of TimeWraith's own files pass `--testMatch '**/__tw__/**'`, so a narrow `testMatch` does not skip them. With Vitest, an `include` pattern that excludes them still leads to "No output: the runner did not collect the harness".
- TypeScript adapters get a `// @ts-nocheck` header, so a strict typecheck does not reject agent-written test glue.
- Regex detectors plus a brace-depth scope finder (Tree-sitter fallback B8).
- The intent search is plain text. It finds the repository's tests and docs by file name and by mention of the code, so a project that documents its behaviour somewhere else is not found.
- The Kiro account has a monthly usage limit. When it is reached, agent steps stop and the case says "Agents stopped" with the reason.
- No browser adapter and no server-clock control; both are reported in the capability report.
- Clock points are a fixed sweep. There is no shrinking: the first failing instant per invariant and zone is reported.
