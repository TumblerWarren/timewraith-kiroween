# TimeWraith

**An autonomous regression investigator for date-sensitive apps.** Give it a public GitHub repository and a ref. A Kiro Crew of agents finds time-sensitive code, designs clock experiments, runs them in an isolated Docker sandbox, and reports only the bugs it can reproduce. A suggested fix is called verified only after it passes eight gates.

Built for Kiroween 2026.

## How it works

Kiro agents propose. Plain code decides.

1. **Repository.** Clones the pinned commit with hardened Git and records what the repo supports.
2. **Discovery.** Bat Scout (Kiro agent) keeps the time-sensitive code worth testing, citing lines.
3. **Design.** Pumpkin Mechanic (Kiro agent) writes a small adapter per candidate. You approve the plan unless auto is on.
4. **Execution.** Code sweeps about 2,600 clock points per experiment across 13 time zones, with no network.
5. **Verification.** The first violation per experiment may be verified when budget allows. Raven investigates after clean repeats (three by default); a defect also needs a failing regression test. If the repository's own tests or docs say the behaviour is deliberate, it is listed as intended behaviour, not a bug.
6. **Fix.** Doctor Stitch (Kiro agent) works like a developer through TimeWraith's tools: reads, searches, edits, runs the failing test, then submits. Eight gates decide, and you accept or reject.

The full flow, the agents, the tools and the gates are in [docs/agent-flow.md](docs/agent-flow.md).

## Real cases

Two TimeWraith runs on public repositories reached **fixed version verified**: the bug was reproduced from clean containers, a regression test fails before the fix and passes after it, and the fix passed all eight gates. Neither fix has been sent upstream yet.

| Repository | Bug TimeWraith reproduced | Where it shows |
|---|---|---|
| [jkbrzt/rrule](https://github.com/jkbrzt/rrule) | The default `dtstart` (now) comes out one hour early during the repeated DST hour, because `setMilliseconds` re-resolves the ambiguous local hour to the earlier offset (`src/parseoptions.ts:43`) | `America/Los_Angeles`, 2026-11-01 09:00Z |
| [harrisiirak/cron-parser](https://github.com/harrisiirak/cron-parser) | `addHour` does not advance at the Lord Howe DST end (a 30-minute fall-back), so an hourly expression loops until `LOOP_LIMIT` and throws | `Australia/Lord_Howe`, 2024-04-06 14:00Z |

An open upstream pull request, cron-parser #453 by another author, fixes the same `addHour` behaviour. TimeWraith found the bug on its own and then matched it to that pull request; it does not claim the bug was unknown.

Not every run finds something. On date-fns (a heavily tested monorepo) TimeWraith reported the run as inconclusive instead of clean, because three of its candidates need the `Temporal` API that Node 22 lacks. That led to the environment check and the Temporal polyfill described under Status and limits.

## Quick start for judges: one command, nothing to clone

Requirement: Docker (Docker Desktop 4.29 or later, or Docker Engine 26 or later). Run this once:

```
docker run -d --name timewraith --restart unless-stopped -p 127.0.0.1:8787:8787 --label com.docker.compose.project=timewraith --label com.docker.compose.service=app -v timewraith-data:/data -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/tumblerwarren/timewraith-kiroween:latest
```

Then open <http://localhost:8787>. The image already contains four finished cases (node-cron, rrule, cron-parser and date-fns), so you can read a complete run without signing in or spending credits. The page walks you through the rest: it starts the Kiro Crew and GitHub containers itself, and you sign in to Kiro once with your own account (approve a code in your browser). The image runs on `linux/amd64` and `linux/arm64`. To remove everything later: `docker rm -f timewraith` and `docker volume rm timewraith-data`.

`:latest` is the image built from `main` the last time the maintainer ran the publish workflow by hand. Merges do not publish. To pin one build, use its commit tag, for example `ghcr.io/tumblerwarren/timewraith-kiroween:sha-1234567`.
## Run it with Docker (one command)

Requirement: Docker (Docker Desktop 4.29 or later, or Docker Engine 26 or later). Nothing else is installed on your machine.

```
docker compose up -d --build
```

Open <http://localhost:8787>. On the Crew setup page, sign in to Kiro once: pick Google, GitHub or Builder ID, then approve the code in your browser. The cloned repositories, the edits, the fix branches, the patches and the case database all live in the `timewraith-data` Docker volume, and the Kiro sign-in lives in `timewraith-crew-home`. `docker compose down` keeps both; `docker compose down -v` deletes them.

For judging, download or clone the tagged GitHub release into a local folder and run the Compose command above from that folder. Use Docker Desktop in Linux-container mode on Windows or macOS, or Docker Engine with the Compose plugin on Linux. Sign in with your own Kiro account to run the live Crew. To try the workflow, open a case for `https://github.com/kelektiv/node-cron` on `main`, choose **Open hunt**, then approve the plan when prompted.

The API has no login and listens on `127.0.0.1` only. On Linux, pass the group of the Docker socket: `DOCKER_GID=$(stat -c %g /var/run/docker.sock) docker compose up -d --build`. The settings you can override are in [.env.example](.env.example).

### Rebuild after code changes

From the repository root, run this after changing frontend or backend code:

```sh
docker compose up -d --build timewraith
```

Compose rebuilds the app image and recreates the container when the image changes. Your cases and sign-ins stay in their Docker volumes. A plain `docker compose restart` reuses the existing image.

## Run the image on any Docker (no compose file)

TimeWraith is one image. It needs the Docker socket and one volume. It creates its own network and starts the Kiro Crew and GitHub containers from the setup page, so nothing else is configured.

```
docker run -d --name timewraith --restart unless-stopped -p 127.0.0.1:8787:8787 \
  --label com.docker.compose.project=timewraith --label com.docker.compose.service=app \
  -v timewraith-data:/data -v /var/run/docker.sock:/var/run/docker.sock <image>
```

`<image>` is `timewraith:local` after `docker build -t timewraith:local .` in the repository root, or the registry name once the image is published (below).

On Windows PowerShell, use a backtick for line breaks:

```
docker run -d --name timewraith --restart unless-stopped -p 127.0.0.1:8787:8787 `
  --label com.docker.compose.project=timewraith --label com.docker.compose.service=app `
  -v timewraith-data:/data -v /var/run/docker.sock:/var/run/docker.sock timewraith:local
```

`/var/run/docker.sock` is correct on Docker Desktop for Windows and macOS too: it is a path inside the Docker engine, not on your PC.

The two `--label` options make Docker Desktop show the app, the Kiro Crew, the GitHub container and the test sandboxes as one group named `timewraith`; the app passes the same label on to every container it starts. Open <http://localhost:8787>. The image runs on `linux/amd64` and `linux/arm64`. The container starts as root only to read the Docker socket and then runs the app as an unprivileged user. Anyone who can reach port 8787 can start containers on your Docker host, so keep the port on `127.0.0.1`.

- **Publish to GitHub Container Registry:** run the workflow by hand from the Actions tab (Run workflow, branch `main`). The single workflow `.github/workflows/build.yml` verifies the frontend, builds both platforms and pushes `ghcr.io/<owner>/<repo>` as `latest`, then creates a GitHub Release; only a manual run on `main` publishes.
- **Move it to a machine without internet:** `docker save timewraith:local | gzip > timewraith.tar.gz`, then `docker load -i timewraith.tar.gz` there. The Kiro Crew image (`ghcr.io/kirodotdev/kirocrew:stable`) is still pulled on first setup.

### Everyday commands for the image

| Task | Command |
|---|---|
| See it is healthy | `docker ps --filter name=timewraith` (look for `healthy`), then open <http://localhost:8787> |
| Read the log | `docker logs -f timewraith` |
| Stop and start | `docker stop timewraith` / `docker start timewraith` |
| Update to a new build | `docker build -t timewraith:local .`, then `docker rm -f timewraith`, then the `docker run` line again. Cases and sign-ins stay: they are in the volumes |
| Bring in cases from a TimeWraith run on your PC | `docker run --rm -v timewraith-data:/data -v "$HOME/.timewraith:/import:ro" timewraith:local python -m timewraith.importer /import` (add `--case <id>` for one case, `--replace` to overwrite) |
| Delete the app, keep the data | `docker rm -f timewraith` |
| Delete everything, including cases and sign-ins | `docker rm -f timewraith timewraith-crew timewraith-git`, then `docker volume rm timewraith-data timewraith-crew-home timewraith-git-home` and `docker network rm timewraith-net` |

Run a second copy side by side by changing the names: `-e TW_CREW_CONTAINER=… -e TW_GIT_CONTAINER=… -e TW_CREW_VOLUME=… -e TW_GIT_VOLUME=… -e TW_CREW_NETWORK=…`, a different `-p` port and a different `-v` data volume. The Kiro and GitHub sign-ins live in the Crew and GitHub containers, so after an update you are still signed in unless you delete those volumes. If the Crew container was created by an older version and cannot reach the app (cases show "Stub runtime"), attach it once: `docker network connect timewraith-net timewraith-crew`.

## Run it from source

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
| `#/` | Clock intro. Skip or the lantern opens Home |
| `#/home` | Home: the repository field, how the crew works, the time bugs |
| `#/new` | Open a case (`#/new?repo=<url>` pre-fills the repository) |
| `#/cases` | Every case with its status |
| `#/cases/:id` | Case detail: status, steps, counters, Plan, Findings, Fixes, Activity |
| `#/crew` | Crew setup: Docker, container, sign-in and sign-out |
| `#/about` | How it works |

## Design

The interface uses the Violet Midnight theme: a dark violet ground, IM Fell English for body text, Barlow Condensed for headings and JetBrains Mono for code and timestamps. The colour tokens, type scale, motion rules and the banned-style list are in [docs/design-system.md](docs/design-system.md). The earlier parchment and clocktower direction in `TimeWraith_Product_UIUX_Design_Specification.docx` is superseded for visual identity.

## Checks

```
uv --directory backend run pytest
uv --directory backend run ruff check src tests scripts
uv --directory backend run mypy src
pnpm --dir frontend verify
```

`pnpm --dir frontend verify` runs typecheck, lint, the style guard, the unit tests (including the colour contrast test) and the build.

## Asset pipeline

The mascot art is generated with Codex and cleaned by scripts in `tools/art/`:

```
python tools/art/codex_gen.py --id <mascot>/<part> --subject "<what to draw>"   # generate, copy to frontend/assets/masters/, cut out
python tools/art/cutout.py <master.png> --id <mascot>/<part>                    # trim and place on the 1024 x 1024 canvas
python tools/art/contact_sheet.py <id> [<id> ...]                               # contact sheet on dark, light and checkerboard
pnpm --dir frontend shots                                                       # build, then screenshots of the pages
```

The full procedure, including the magenta chroma-key fallback, is the `generate-mascot-asset` skill in `.kiro/skills/`.

## Documentation

| Document | What it covers |
|---|---|
| [docs/agent-flow.md](docs/agent-flow.md) | The flow, agents, fix tools, gates, outcomes and limits |
| [docs/design-system.md](docs/design-system.md) | Colours, type, spacing, motion, Reduce Motion and the style guard rules |
| [docs/landing-motion.md](docs/landing-motion.md) | The clock intro, the home page lantern and the repository field |
| [backend/README.md](backend/README.md) | Backend setup, invariants, fix gates, configuration, limits of the MVP |
| [docs/integration-contract.md](docs/integration-contract.md) | API contract between backend and frontend, and the frontend routes |
| [docs/kiro-usage.md](docs/kiro-usage.md) | How Kiro features were used, with dated evidence |

## Status and limits

- Supports the full investigation and fix workflow for JavaScript and TypeScript projects using Vitest or Jest.
- For Python cases, Bat reads source and proposes a temporal hypothesis. After plan approval, the Crew selects dependency setup and writes pytest experiments, even for repositories without tests. Raven checks a separately written reproduction at the failing and control dates. Doctor Stitch can repair the implicated Python source and supply a standalone pytest regression. Verified fixes use the case’s existing approval, branch, and pull request flow.
- Each investigation uses Kiro agent calls. Usage limits on the Kiro account stop agent steps, and the case says so.
- Investigations run locally. Accepted fixes can be downloaded or explicitly prepared and shared through the optional GitHub workflow.
- Before any experiment, a canary test checks that the repository's runner can run a generated test at all. When it cannot (for example a Vitest config that only includes files named `test.ts`), a shared runner profile is tried, then an agent repair; if nothing works the case ends early as inconclusive, with the reason.
- When the code under test uses `Temporal` and Node lacks it, TimeWraith installs `temporal-polyfill` into `.tw/deps` (outside the repository, no install scripts) and loads it as the global. The case says so, because findings about that code then depend on the polyfill.
- A run that could test only part of its plan says how much and why (adapter, environment or a throttled agent service). With fewer than 70% of experiments run and no bug, it is inconclusive, not clean.
- If the Kiro account runs out of usage or its sign-in expires, the case lists the steps that did not run. After you sign in again (another account works), Continue runs only those steps in the same case.
- Each experiment's adapter must import the code it claims to test; an adapter that tests some other function is refused.

## Built with Kiro

Two kinds of Kiro use: Kiro built the project, and Kiro agents are the product's runtime.

- **The runtime is a Kiro Crew.** The agents (Bat Scout, Pumpkin Mechanic, Raven Archivist, Doctor Stitch, Wraith Director, and the install mechanic) run as Kiro CLI sessions in the `ghcr.io/kirodotdev/kirocrew:stable` container. They reach the case only through TimeWraith's own MCP tools (`backend/agents/tw_mcp_proxy.py`), so code decides what is accepted. Their instructions are in `backend/agents/*.md`.
- **Specs.** `.kiro/specs/timewraith/` (requirements, design, tasks) for the product and the interface, and `.kiro/specs/backend/` for the investigation engine. On 2026-11-11 an audit against `tasks.md` found that the Version Timeline (design D21) was missing, and the reveal-honesty property test it led to caught a real leak: the case id was used as a DOM id (see [docs/kiro-usage.md](docs/kiro-usage.md)).
- **Hooks.** Ten hooks in `.kiro/hooks/` with helpers in `scripts/hooks/`. `backend-ruff-on-save` is enabled: when a Python file under `backend/src` or `backend/tests` is saved, it runs `ruff check` and `ruff format --check` and sends a failure back to the agent. The other nine come from the landing-page work (lint and typecheck on save, the banned-style guard, Reduce Motion coverage, the asset pipeline on master save, unit tests after a task, a shell guard and a debug dump) and are disabled (`"enabled": false`). The debug hook pinned the real hook event schema on 2026-11-10 (`docs/kiro-usage.md`).
- **Skills.** Four workspace skills in `.kiro/skills/`: `generate-mascot-asset`, `add-motion-effect`, `run-landing-qa` and `write-kiro-usage-readme` (which produced this section). Their discovery by the agent was confirmed on 2026-11-10.
- **Steering.** Three steering files in `.kiro/steering/`: `product` (always on: the agent proposes and code referees, scope, cost), `backend` (matches `backend/**/*.py`: the module map, the checklist for adding a rule, the checks before a commit) and `windows-shell` (always on: how to work on this machine). They were written on 2026-11-20. The nine files of 2026-11-10 (landing-page design and motion rules) are not in the repository.

## Hackathon category

**Costume Contest** is the entered category: the hand-inked, cel-painted interface and its mascot cast (Bat Scout, Pumpkin Mechanic, Raven Archivist, Doctor Stitch, Wraith Director, Watchtower Warden). Two supporting angles are described in the text only:

- **Frankenstein:** a crew of Kiro agents stitched to a Docker sandbox runner, a clock and time-zone sweep harness, a version comparator and GitHub.
- **Resurrection:** old date-boundary bugs from public issue trackers revived as reproducible evidence. The sample scenario in the interface comes from FullCalendar #7998; it is labelled sample and is not presented as a TimeWraith finding.

Notes for the Devpost entry are in [docs/devpost-notes.md](docs/devpost-notes.md).

## License

TimeWraith is available under the [MIT License](LICENSE).
