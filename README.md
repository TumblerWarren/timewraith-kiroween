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

## Run it with Docker (one command)

Requirement: Docker (Docker Desktop 4.29 or later, or Docker Engine 26 or later). Nothing else is installed on your machine.

```
docker compose up -d --build
```

Open <http://localhost:8787>. On the Crew setup page, sign in to Kiro once: pick Google, GitHub or Builder ID, then approve the code in your browser. The cloned repositories, the edits, the fix branches, the patches and the case database all live in the `timewraith-data` Docker volume, and the Kiro sign-in lives in `timewraith-crew-home`. `docker compose down` keeps both; `docker compose down -v` deletes them.

The API has no login and listens on `127.0.0.1` only. On Linux, pass the group of the Docker socket: `DOCKER_GID=$(stat -c %g /var/run/docker.sock) docker compose up -d --build`. The settings you can override are in [.env.example](.env.example).

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

- **Publish to GitHub Container Registry:** push a tag such as `v0.1.0`. The workflow `.github/workflows/image.yml` builds both platforms and pushes `ghcr.io/<owner>/<repo>`.
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

- Supports JavaScript and TypeScript repositories tested with Vitest or Jest.
- Each investigation uses Kiro agent calls. Usage limits on the Kiro account stop agent steps, and the case says so.
- The MVP is local-only. Patches are downloaded, nothing is pushed to GitHub.
