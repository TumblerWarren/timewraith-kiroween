# TimeWraith backend (MVP)

Give it a public GitHub repository and a ref. It clones that one revision, finds time-sensitive code, plans controlled-clock experiments, and after you approve the plan, runs them in restricted Docker containers. Repeated anomalies become bugs only after 3/3 clean repeats and a verifier's judgement. Doctor Stitch then proposes fixes, and a fix is called verified only after it passes eight gates.

## Commands (from the repo root)

```
uv --directory backend sync
uv --directory backend run uvicorn timewraith.api:app --host 127.0.0.1 --port 8787
uv --directory backend run pytest
uv --directory backend run ruff check src tests
uv --directory backend run mypy src
uv --directory backend run python -m timewraith.schema_export
```

Configuration: `backend/.env` (see `.env.example`). Data (SQLite, workspaces, patches) lives in `TW_DATA_DIR`, by default `~/.timewraith`, never inside this repository.

## Pipeline

| Stage | Who | What | Code |
|---|---|---|---|
| cloning | Warden | Validate URL and ref, resolve to a SHA, hardened shallow clone (no hooks, no submodules, no LFS, no symlinks) | `ingest.py` |
| analyzing | Bat Scout | Package manager, test runner, fake timers, Node version, capability report | `analyze.py` |
| discovering | Bat Scout | Time signals → candidates per code unit → deterministic score | `discovery.py` |
| planning | Pumpkin Mechanic | Clock points per category (DST points computed from tzdb) | `planning.py` |
| awaiting-plan-approval | user | Skipped when `auto` is true | `pipeline.py` |
| installing | Warden | Dependency install in a container (network on only here) | `sandbox.py` |
| experimenting | Pumpkin Mechanic | Agent writes one test per experiment; harness runs it per clock point (`TZ`, `TW_INSTANT`), no network | `pipeline.py` |
| verifying | Raven Archivist | 3 repeats from fresh containers, then judge "bug" vs "test error"; issue search for known or new | `pipeline.py` |
| fixing | Doctor Stitch | Up to 3 attempts per bug, each through the eight gates | `pipeline.py` |

## The eight fix gates (all required)

1. **test_first:** the regression test failed 3/3 on the original revision with an assertion.
2. **fixed:** it passes 3 times in the failing zone and once in another zone.
3. **no_regressions:** the full suite has no failures that were not there before.
4. **no_new_anomalies:** every kept experiment at every clock point is no worse than before.
5. **diff_limits:** at most 3 files and 60 lines. No tests, test config, manifests, lockfiles or CI files are touched.
6. **static_checks:** the repo's `tsc --noEmit` and ESLint do not newly fail.
7. **independent_review:** Raven Archivist reviews the diff without Doctor Stitch's reasoning.
8. **mutation_check:** reverting only the source change makes the regression test fail again.

Gates run cheapest first and stop at the first failure. The failure detail goes back to Doctor Stitch for the next attempt.

## Agent runtime

Agents propose; `pipeline.py` decides. Agents get no tools. Each prompt carries the needed source as quoted untrusted data, and each reply must validate against a Pydantic schema (2 retries). Ids that the agents invent are dropped.

- `TW_AGENT_RUNTIME=stub` (default): no LLM. Discovery and planning work. Experiments, judgements and fixes report "Agent runtime required" instead of guessing.
- `TW_AGENT_RUNTIME=command` with `TW_AGENT_COMMAND`: runs the command (`{agent}` is replaced by the agent name) with the prompt on stdin and expects one JSON object on stdout. This is the seam for Kiro Crew / `kiro-cli` once it is installed and its headless call is confirmed (backend spec task 1.1). Configure the agent profiles with no tools.

## Limits of the MVP

- JavaScript and TypeScript with Vitest or Jest only. The test harness runs from the repository root, so monorepo packages are reported as `unknown`.
- Regex detectors plus a brace-depth scope finder (Tree-sitter fallback B8). Expect noisy candidates in date-heavy libraries.
- No browser adapter and no server-clock control. Both are reported in the capability report.
