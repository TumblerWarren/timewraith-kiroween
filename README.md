# TimeWraith

**An autonomous regression investigator for date-sensitive apps.** Give it a public GitHub repository and a ref. A Kiro Crew of agents finds time-sensitive code, designs clock experiments, runs them in an isolated Docker sandbox, and reports only the bugs it can reproduce. A suggested fix is called verified only after it passes eight gates.

Built for Kiroween 2026.

## How it works

Kiro agents propose. Plain code decides.

1. **Repository.** Clones the pinned commit with hardened Git and records what the repo supports.
2. **Discovery.** Bat Scout (Kiro agent) keeps the time-sensitive code worth testing, citing lines.
3. **Design.** Pumpkin Mechanic (Kiro agent) writes a small adapter per candidate. You approve the plan unless auto is on.
4. **Execution.** Code sweeps about 2,600 clock points per experiment across 13 time zones, with no network.
5. **Verification.** Raven Archivist (Kiro agent) rules on each violation. A bug needs 3 of 3 repeats and a failing generated regression test. If the repository's own tests or docs say the behaviour is deliberate, it is listed as intended behaviour, not a bug.
6. **Fix.** Doctor Stitch (Kiro agent) works like a developer through TimeWraith's tools: reads, searches, edits, runs the failing test, then submits. Eight gates decide, and you accept or reject.

The full flow, the agents, the tools and the gates are in [docs/agent-flow.md](docs/agent-flow.md).

## Run it

Requirements: Python 3.14 with [uv](https://docs.astral.sh/uv/), Node 20 or 22 with pnpm, and Docker Desktop.

```
uv --directory backend sync
uv --directory backend run uvicorn timewraith.api:app --host 127.0.0.1 --port 8787
pnpm --dir frontend install
pnpm --dir frontend dev
```

Open the frontend (Vite prints the address). On the Crew setup page, start Docker, start the Kiro Crew container and sign in to Kiro with the code shown. Then open a case on the New case page.

Without Kiro sign-in the backend runs the stub runtime. It never invents output, so judgment steps report "not run".

## Pages

| Address | Page |
|---|---|
| `#/` | Home: what it does, readiness, latest cases |
| `#/new` | Open a case |
| `#/cases` | Every case with its status |
| `#/cases/:id` | Case detail: status, steps, counters, Plan, Findings, Fixes, Activity |
| `#/crew` | Crew setup: Docker, container, sign-in and sign-out |
| `#/about` | How it works |

## Checks

```
uv --directory backend run pytest
uv --directory backend run ruff check src tests scripts
uv --directory backend run mypy src
pnpm --dir frontend verify
```

`pnpm --dir frontend verify` runs typecheck, lint, the style guard, the unit tests and the build.

## Documentation

| Document | What it covers |
|---|---|
| [docs/agent-flow.md](docs/agent-flow.md) | The flow, agents, fix tools, gates, outcomes and limits |
| [backend/README.md](backend/README.md) | Backend setup, invariants, fix gates, configuration, limits of the MVP |
| [docs/integration-contract.md](docs/integration-contract.md) | API contract between backend and frontend |
| [docs/kiro-usage.md](docs/kiro-usage.md) | How Kiro features were used, with dated evidence |

## Status and limits

- Supports JavaScript and TypeScript repositories tested with Vitest or Jest.
- Each investigation uses Kiro agent calls. Usage limits on the Kiro account stop agent steps, and the case says so.
- The MVP is local-only. Patches are downloaded, nothing is pushed to GitHub.
