# TimeWraith: a Kiro Crew that hunts time bugs, and the credit budget I got wrong

*This post is being written as part of **Kiroween 2026**, the Kiro hackathon hosted on Devpost, and it is my entry for the **Bonus Blog Prize**. I entered TimeWraith in the **Costume Contest** category, with **Frankenstein** and **Resurrection** as supporting angles in the text.*

*By [your name].*

> **Before you publish:** replace `[your name]`, `[repo URL]`, `[demo video]`, and `[Devpost URL]`. Read the fact-check notes at the end first. The README is stale on two points (number of verified cases and whether the fixes were sent upstream), so do not copy those claims without updating them.

---

## Key points (the short version)

- **What I built:** TimeWraith, an autonomous regression investigator for date-sensitive apps. You give it a public GitHub repository and a ref. A Kiro Crew finds time-sensitive code, designs clock experiments, runs them in an isolated Docker sandbox, and reports only bugs it can reproduce. A suggested fix is called "verified" only after eight gates.
- **Why time bugs:** DST fall-back hours, 30-minute DST shifts, leap days, month ends, and time-zone conversions are where "works on my machine" becomes a production incident. A test suite can be green in one zone and wrong in another.
- **The core rule:** the agent proposes, code referees. Agents suggest suspects, experiments, verdicts, and patches. Code re-runs the evidence and decides what counts.
- **What actually worked:** three finished runs in the shipped image reached "fixed version verified" (node-cron, rrule, cron-parser), and a date-fns run ended honestly as inconclusive instead of pretending to be clean.
- **What Kiro did:** Kiro Crew is the runtime (agents in a container, scoped MCP tools), and Kiro specs, steering, hooks, and skills built the project. The same rule appears in the product code and in the build workflow.
- **The mistake:** I spent about 1,800 of my 4,000 Kiroween credits on the frontend, including a redesign after the first design did not work. That left about 2,200 for the backend and for testing an agentic app that itself spends Kiro credits.
- **The second mistake:** I over-restricted the agents and tools for safety, then had to write a separate adapter path for every language. The result is a narrow tool, not a general bug finder.
- **The honest limit:** TimeWraith is not "run it on any repo and it finds bugs." It supports JavaScript/TypeScript with Jest or Vitest at the root package, plus a partial Python path. It does not control browser or server clocks. It says "inconclusive" when it cannot test enough.
- **The lesson:** build the core loop before the costume. Kiro is excellent at structure and discipline; it is not an image model. And a credit budget is a design constraint, not an afterthought.

---

## The problem: time is the worst input

Most bugs are reproducible. Time bugs are not. They depend on the process time zone, the IANA database, the host clock, the test runner's fake timers, and the exact instant you happen to run the code.

A few examples of the shape:

- In a fall-back hour, the same local wall-clock time happens twice. Which one did the code mean?
- Lord Howe Island shifts by 30 minutes, not an hour. Code that assumes a whole-hour DST shift can stop advancing.
- A "next run" calculation can return an instant before "now," and then a scheduler loops until it throws.
- A date stored as an instant can quietly depend on the machine's time zone.

These bugs are hard to see in code review because the code looks reasonable. They are hard to test because you need to control the clock, the zone, and the calendar at the same time. That is the gap TimeWraith is built for.

## What TimeWraith does

TimeWraith takes a public GitHub repository and a ref. It then runs this pipeline, plus an optional fix step:

1. **Repository.** It clones the pinned commit with hardened Git settings and records what the repository supports: language, package manager, test runner, lockfile, fake-timer use, and so on. (`backend/src/timewraith/ingest.py`, `analyze.py`, `environment.py`)
2. **Discovery.** Bat Scout, a Kiro agent, reviews scanner candidates and keeps the time-sensitive code worth testing, citing its own signals. Code drops citations it cannot resolve. (`backend/src/timewraith/discovery.py`, `backend/agents/bat-scout.md`)
3. **Design.** Pumpkin Mechanic, a Kiro agent, writes a small adapter per candidate: how to call the code, which output fields to read, and which invariants from a fixed catalog apply. Code checks the adapter at ordinary instants before it is allowed to sweep. (`backend/src/timewraith/designsession.py`, `backend/agents/pumpkin-mechanic.md`)
4. **Execution.** Code sweeps about 2,600 clock points per experiment across 13 time zones, covering DST transitions from 2024 to 2026, month ends, leap day, and anchors. The sweep runs in Docker with no network. (`backend/src/timewraith/sweep.py:22-38`, `sandbox.py`)
5. **Verification.** A violation is selected for verification when the budget permits: the flow docs say the first violation of each experiment (`docs/agent-flow.md:178-181`). It must repeat in every clean run, three times by default, or it is rejected. Raven Archivist, a Kiro agent, gives a verdict: defect, intended behaviour, allowed exception, or adapter error. A defect also needs a generated regression test that fails on the original code. (`backend/src/timewraith/verifysession.py`, `intent.py`, `backend/agents/raven-archivist.md`)
6. **Fix (optional).** Doctor Stitch, a Kiro agent, works like a developer through TimeWraith's own tools: read, search, edit, run the failing test, check all zones, submit. The diff is applied to a new clean copy and must pass eight gates. (`backend/src/timewraith/fixsession.py`, `backend/agents/doctor-stitch.md`)

The full flow is drawn in `docs/agent-flow.md:11-74`. The eight gates are in `docs/agent-flow.md:213-226`:

1. `test_first`: the violation repeated 3/3 and the regression test failed on the original.
2. `diff_limits`: at most 3 files and 60 changed lines, no protected files.
3. `fixed`: the regression test passes 3/3 and all 13 zones hold.
4. `mutation_check`: undoing the source change makes the test fail again.
5. `no_regressions`: the full test suite has no new failures.
6. `no_new_anomalies`: no experiment shows a new violation.
7. `static_checks`: the repository's typecheck and lint do not newly fail.
8. `independent_review`: Raven reviews the diff without seeing Doctor Stitch's reasoning.

The important part is not the list. It is that a fix is not "verified" because an agent said so. It is verified because code re-ran the evidence on a clean copy.

## The rule that shaped everything: the agent proposes, code referees

This sentence appears in `.kiro/steering/product.md:10-12` and in the backend design. It is the difference between a demo and a tool.

Every agent decision is stored as a `DecisionRecord`: the claim, the evidence that resolved, how many citations were dropped, the checks, the decision, and the code rule that decided. `GET /api/v1/investigations/{id}/decisions` lists them. If an agent cites a source line that does not exist, the citation is dropped and counted. If a verdict has no resolvable evidence, it is rejected. (`docs/agent-flow.md:93-97`)

That rule is also why the product can say "no" to itself. On date-fns, three candidates needed the `Temporal` API that Node 22 did not have. TimeWraith did not pretend the run was clean. It reported the run as inconclusive, added a Temporal polyfill outside the repository, and labelled findings that depend on it. (`README.md:31`, `README.md:177-185`)

## What it found, honestly

The shipped image contains four finished cases. Three reached "fixed version verified" in the database, and one is honestly inconclusive. The README's "Real cases" section currently lists two, so update it before publishing.

| Repository | Bug TimeWraith reproduced | Where it shows | Upstream status |
|---|---|---|---|
| [jkbrzt/rrule](https://github.com/jkbrzt/rrule) | The default `dtstart` comes out one hour early during the repeated DST hour, because `setMilliseconds` re-resolves the ambiguous local hour to the earlier offset (`src/parseoptions.ts:43`) | `America/Los_Angeles`, 2026-11-01 09:00Z | PR [#679](https://github.com/jkbrzt/rrule/pull/679) is open, not merged |
| [harrisiirak/cron-parser](https://github.com/harrisiirak/cron-parser) | `addHour` does not advance at the Lord Howe DST end (a 30-minute fall-back), so an hourly expression returns the same instant or throws instead of producing a later run (`src/CronDate.ts:145`) | `Australia/Lord_Howe`, 2024-04-06 14:00Z | PR [#483](https://github.com/harrisiirak/cron-parser/pull/483) was closed; another author's PR [#453](https://github.com/harrisiirak/cron-parser/pull/453) addresses the same behaviour |
| [kelektiv/node-cron](https://github.com/kelektiv/node-cron) | `getNextDateFrom` returns a time before `start` inside a repeated DST hour when the system clock is before the transition (`src/time.ts:330`, `src/time.ts:363`) | `America/Los_Angeles`, 2027-04-03 15:00Z | No upstream PR |
| [date-fns/date-fns](https://github.com/date-fns/date-fns) | No bug claimed. Three candidates needed `Temporal`, which the environment lacked | Inconclusive, with the reason | Not applicable |

The cron-parser story is the one I think about most. The maintainer closed my PR with a fair note: it duplicated #453, and the test file was out of tree and the PR did not include the tests in the expected place. That is not a code bug in TimeWraith. It is a contribution-etiquette bug. The tool had learned to reproduce a bug before it had learned to follow a repository's contribution rules. The later `contribute.py` path reads `CONTRIBUTING`, the PR template, commitlint, and package scripts, and places the test in the repository's test folder, but that work came after this PR. I would test the contribution path on a fork before opening a real PR next time.

The rrule PR is still open. I am not claiming it was merged, and I am not claiming the bug was unknown to the maintainers. TimeWraith found it on its own, then matched it to public evidence. That distinction matters.

## How Kiro was used

There are two kinds of Kiro use in this project: Kiro built the project, and Kiro agents are the product's runtime. They are related, but they are not the same thing.

### 1. Kiro Crew is the runtime

The agents run as Kiro CLI sessions in the `ghcr.io/kirodotdev/kirocrew:stable` container. The container is deliberately boring and locked down: `--cap-drop ALL`, `no-new-privileges`, 2 GB memory, 256 processes, no repository mounted, no workspace mounted. (`backend/src/timewraith/crew.py:197-235`)

The agents reach a case only through TimeWraith's own MCP tools. `backend/agents/tw_mcp_proxy.py` is a small stdio MCP server that forwards each call to `/api/v1/internal/fix-tools/call` with a token that works only while that attempt runs. Doctor Stitch gets 100 tool calls and 12 minutes. Raven gets 30 calls and 10 minutes. Pumpkin gets 25 calls and 8 minutes. When the budget is spent, every tool except `submit` refuses. (`docs/agent-flow.md:191-205`, `docs/agent-flow.md:153-176`, `backend/src/timewraith/config.py:56-60`, `:86`, `:90-97`)

Repository text is treated as untrusted data. Every excerpt in a prompt is wrapped in a `data-<random hex>` tag, and the tag is stripped from the excerpt first, so a repository cannot close the block and start giving the agent instructions. (`backend/src/timewraith/agents.py:161-171`)

That is the "safety over freedom" choice I made. It keeps unknown repository code away from the host, and it keeps an agent from wandering. It also makes the tool less general, which is the trade-off I will come back to.

### 2. Specs

The project has two spec folders:

- `.kiro/specs/timewraith/` for the product and interface: requirements, design, tasks.
- `.kiro/specs/backend/` for the investigation engine.

The spec was not decoration. On 2026-11-11 I audited `tasks.md` against the code, because two earlier sessions had been interrupted and I did not want to tick work that did not exist. The audit found that the Version Timeline (design D21) was missing, so I built it from the design. The property test that came out of that work, the reveal-honesty test, caught a real leak: the Case Card used the case id as a DOM id and in `aria-labelledby`. The card now uses `useId`. (`docs/kiro-usage.md:54-58`)

That is the kind of thing a spec is for. It gives you a checklist that survives a lost session.

### 3. Steering

Steering is the part I would keep even if I dropped everything else. It is how you stop re-explaining the same rules to the agent every session.

The repository has three steering files:

- `.kiro/steering/product.md` (always on): what the product is, the "agent proposes, code referees" rule, the frozen scope, and the cost rule. The cost rule is blunt: "Every agent run spends Kiro credits. Test with fakes (`backend/tests`), not live cases. Re-run a live case only to check a change that fakes cannot." (`product.md:27-29`)
- `.kiro/steering/backend.md` (matches `backend/**/*.py`): the module map, the checklist for adding a new invariant, and the checks before a commit. The checklist is specific: add the id to `InvariantId`, add the rule in `sweep.py`, update `INVARIANT_CATEGORY` and the frontend labels, regenerate schemas. (`backend.md:21-35`)
- `.kiro/steering/windows-shell.md` (always on): the shell habits that cost me time on this machine. Redirect noisy output to a file, do not trust PowerShell quoting, keep CRLF when editing, do not run `docker exec` as root. (`windows-shell.md:5-13`)

The 2026-11-20 entry in `docs/kiro-usage.md:64-67` records why these were added: the earlier nine steering files from 2026-11-10 were not in the repository, and the hooks were disabled. Writing the steering down again, against the real files, was part of getting the submission honest.

### 4. Hooks

There are ten hook entries across nine files in `.kiro/hooks/`, with helpers in `scripts/hooks/`. One is enabled:

- `backend-ruff-on-save`: on `PostFileSave`, when a Python file under `backend/src` or `backend/tests` is saved, it runs `ruff check` and `ruff format --check`, and sends a failure back to the agent. The script was tested by hand with a real event; whether Kiro fires it on a save in a live session was not checked. (`.kiro/hooks/backend-ruff-on-save.json`)

The other nine are disabled but documented:

- `style-guard-on-save`: fails on glow, `backdrop-filter`, blurred shadows, purple/cyan gradients, colour literals outside `tokens.css`, pumpkin-600 as text, nested rounded cards.
- `lint-typecheck-on-save`: ESLint and `tsc --noEmit` on a saved frontend file.
- `reduce-motion-coverage`: checks the animation registry and fallbacks after animation edits.
- `tests-after-task`: runs frontend unit/property tests and the art tool pytest suite when a spec task finishes.
- `asset-pipeline-on-master-save`: runs the cutout script and asset QA when a master image is saved.
- `asset-qa-refresh`: prints the asset QA summary after a Codex run.
- `guard-shell`: two hooks in one file. One blocks `.ps1` shims for Codex and OpenCode; the other runs the style guard before `git commit`.
- `debug-hook-event`: the one that pinned the real hook event schema.

The debug hook is a good example of not guessing. The Kiro docs did not list the STDIN JSON for hooks, so I enabled the debug hook once and captured real events. `PostFileSave` gives `session_id`, `hook_event_name`, `cwd`, and `file_path`. `PreToolUse` with matcher `shell` gives `tool_name: "execute_pwsh"` and `tool_input.command`. `PostToolUse` adds `tool_response` as a single string. The helper scripts already tried those names first, so the logic did not need to change, but the schema is now recorded in `scripts/hooks/read-event.mjs`. (`docs/kiro-usage.md:21-38`)

Hooks are not magic. They are a way to make a rule run at the moment it matters, instead of hoping the agent remembers it.

### 5. Skills

There are four workspace skills:

- `generate-mascot-asset`: generate one mascot part or pose with Codex, prefer a transparent PNG, fall back to a magenta chroma key, trim and place on a 1024×1024 canvas, run QA, and log the result. (`SKILL.md:1-35`)
- `add-motion-effect`: add a new narrative animation to the MotionDirector registry with a priority, a settle state, and a Reduce Motion fallback. (`SKILL.md:9-15`)
- `run-landing-qa`: build, run unit/property tests, run Lighthouse, capture Playwright screenshots at 1440 and 390 px in Reduce Motion mode, compare against thresholds, and write a report. (`SKILL.md:11-28`)
- `write-kiro-usage-readme`: collect specs, steering, hooks, skills, and dated evidence from `docs/kiro-usage.md`, and write the Kiro-usage section and Devpost notes without claiming anything the files do not support. (`SKILL.md:9-23`)

The last one is the most important for a hackathon. It is a skill whose job is to keep the submission honest.

### 6. MCP

MCP is the seam between the Kiro agent and the case. `backend/agents/tw_mcp_proxy.py` is a stdio MCP server inside the Crew container; the backend gates every call by the attempt token and the tool budget. Doctor Stitch, Raven and Pumpkin use it, and their Kiro profiles do not get the built-in shell, file or web tools. The agent can read, search and edit a repository only through the tools TimeWraith exposes, and the built-in tools are neither in the profile nor trusted. (`backend/src/timewraith/agents.py:280-301`, `backend/src/timewraith/designsession.py:6`, `backend/src/timewraith/verifysession.py:3`)

That is also why the MCP layer is the place to audit. If a tool is not in the proxy, the agent cannot use it. If a call is not in the token's attempt, the backend refuses it. The safety is in the seam, not in the prompt.

## The build story: where the credits went

Kiroween 2026 gives participants 4,000 free Kiro credits. You request them on the Devpost Resources tab by December 1, 2026 at 12:00 pm PT, and ID verification is required. The credits are a one-time grant; they must be redeemed by December 4, 2026 and expire on December 31, 2026 at 11:59 pm PT. The submission period runs from October 30 to December 4, 2026 at 2:00 pm PT. (Devpost, Kiroween 2026 Resources and Rules)

I started with the plan I thought was obvious: find time-related bugs in any project and any language. That plan did not survive contact with the credit budget. Testing an agentic application is not like testing a normal app. Every live run spends credits on discovery, design, verification, and sometimes a fix session. In the seeded runs, a single investigation used 18 to 30 agent calls, including a run that found nothing, because the agents still have to read, reason, and report. (`backend/src/timewraith/config.py:48-51`, and the seeded cases' `budget` records)

I also did not want to spend my own credits. I wanted the 4,000 to be enough. It was not, and I did spend more later.

### The frontend detour

I spent a lot of time on the frontend. At first I gave Kiro links to motion-inspiration sites and reference videos, hoping it would produce a Halloween-themed interface in my taste. It did not. The output was technically a frontend, but it was not the frontend I wanted.

The image problem made it worse. The models I had in Kiro at the time (Opus and Sonnet) could write SVG, CSS, and React, but they did not have native raster image generation. The newest GPT image models were not in my Kiro setup. So the assets were mostly code: placeholder SVGs, CSS shapes, and hand-built vector figures. Giving the model a site reference did not help much, because the reference depended on custom art that did not exist yet. The animation review from that period is blunt about it: only 3 of 14 mascots had real generated art; the other 11 plus the Mini Ghost were placeholder SVGs, and every pose was a whole-figure tween with no anticipation or secondary motion. (`docs/reports/anim-review/round1/review.md:17-24`)

So I changed the approach. I designed the motion first: what moves, when it moves, how it reacts, and what the fallback is. I made rough sketches in Paint. Then I used ChatGPT/Codex to generate the art in parts, so the parts could be animated separately: a body, wings, a lantern arm, a pose. The `generate-mascot-asset` skill and `tools/art/` scripts are the result: `codex_gen.py` generates one image per request, `cutout.py` trims and cleans it, `contact_sheet.py` puts it on dark, light, and checkerboard backgrounds for review. (`README.md:151-162`, `.kiro/skills/generate-mascot-asset/SKILL.md:18-35`)

Then I went back to Opus with a written prompt and the reference image. That is when the landing page finally moved the way I wanted:

- The midnight clock intro: the hands tick from 11:55 to 12:00, the bell strikes, a perspective swarm of 245 bats fills the canvas, the clock disappears, and the lantern wraith materializes. (`frontend/src/animation/react/MidnightIntro.tsx:26-160`, `frontend/src/components/cinematic/swarm.ts:1-66`)
- The home page lantern: it follows a route over the page, reacts to the pointer and to clicks, and reveals nearby text as it passes. Once revealed, the text stays visible. (`frontend/src/components/cinematic/LanternWraith.tsx:4-19`, `:66-253`)
- The crew page eye: an eye opens, a sound plays, and the crew setup begins. (`frontend/src/components/cinematic/CrewAwakening.tsx:15-109`)

The visual system is called Violet Midnight: near-black violet surfaces, IM Fell English for body text, Barlow Condensed for headings, JetBrains Mono for code, and a style guard that bans glass blur, glows, blurred shadows, neon gradients, and colour literals outside `tokens.css`. Every animation has a Reduce Motion path. (`docs/design-system.md:5-10`, `:95-120`, `docs/landing-motion.md:7-29`)

The whole frontend process cost about 1,800 credits, including the redesign after the first design did not work. That left about 2,200 for the backend and for testing the agentic app. In hindsight, that split was backwards. The frontend is the part judges see, but the backend is the part that decides whether the product is real.

### The backend mistake: I optimized for safety before generality

The backend is where I failed to plan properly.

Because TimeWraith tests repositories from unknown sources, I did not want to give agents a free hand. The sandbox is strict: no network during the sweep, `--cap-drop ALL`, `no-new-privileges`, a read-only root, a memory limit, a process limit, no Docker socket, and only the case workspace mounted. (`backend/src/timewraith/sandbox.py:88-126`) The Kiro Crew container is also locked down and has no repository mounted. (`backend/src/timewraith/crew.py:197-235`)

That was the right instinct for safety. The cost was generality. Each language needs its own worker, adapter, clock control, test harness, and regression-test generator. JavaScript and TypeScript with Jest or Vitest are supported end to end. Python has a partial path with a Python 3.14 worker and pytest experiments. Other languages do not. (`backend/README.md:134-143`)

I also restricted the agents' tool choices too early. Instead of giving them a small, general set of primitives and letting code referee the results, I gave them narrow tools and a fixed plan. That made the system safer and easier to reason about, but it also meant the agents could not adapt to a repository I had not anticipated. The tool became a specialist, not a generalist.

If I did it again, I would build the smallest end-to-end loop first: clone one repository, design one adapter, sweep one clock point, verify one violation, and only then add the next language. I would keep the sandbox strict, but I would make the agent's tool surface more general and put the safety in the code that checks the output, not in the list of tools the agent is allowed to call.

## What works, and what does not

**Works:**

- JavaScript and TypeScript projects using Jest or Vitest, run from the root package.
- Clock sweeps across 13 zones, including Lord Howe (30-minute DST), Kathmandu (45-minute offset), Kiritimati (UTC+14), and Pago Pago (UTC-11). (`backend/src/timewraith/sweep.py:22-38`)
- A fixed invariant catalog, so the pass/fail decision is code, not an LLM. (`backend/src/timewraith/sweep.py:41-70`, `backend/README.md:19-30`)
- Independent verification with a generated regression test.
- A fix workflow with eight gates and an optional GitHub contribution path.
- Honest outcomes: "no bugs," "intended behaviour," "inconclusive," "agents stopped," and "no safe fix" are all distinct. (`docs/agent-flow.md:247-257`)

**Does not work (yet):**

- It is not a general bug finder. It is a time-bug investigator.
- It does not support every language. Python is partial; other languages are not supported.
- It does not control browser clocks or server clocks. The capability report says so. (`backend/README.md:142`)
- The sweep is a fixed set of clock points. There is no shrinking or adaptive search. The first failing instant per invariant and zone is reported. (`backend/README.md:143`)
- The intent search is plain text. A project that documents its behaviour somewhere unexpected may be missed. (`backend/README.md:140`)
- A Kiro account has a monthly usage limit. When it is reached, agent steps stop and the case says "Agents stopped" with the reason. (`backend/README.md:141`)
- The fixes are not merged upstream. One PR is open; one was closed as a duplicate. Do not claim otherwise.
- The README still says "Two TimeWraith runs ... reached fixed version verified" and "Neither fix has been sent upstream yet." Both are stale. Update them before publishing.

## What I would do differently

1. **Budget credits by phase, not by vibe.** Write down a cap for the UI, the core loop, the agent testing, and the demo. The UI is seductive because progress is visible. The backend is where the product actually lives.
2. **Build the core loop before the costume.** One repository, one adapter, one clock point, one verdict. If that loop is not convincing, no amount of mascot art will save the demo.
3. **Do not ask a coding model to be an image model.** Use the right tool for raster art. Design the motion first, generate the parts, then wire them. The `generate-mascot-asset` skill exists because that workflow works.
4. **Write steering before the code.** The product steering file is the cheapest way to keep scope, cost, and honesty in one place. The backend steering file is the checklist that stops a new invariant from breaking four other files.
5. **Use hooks for the rules you keep forgetting.** Ruff on save is boring, which is why it is useful. The style guard and Reduce Motion coverage checks are the same idea for the frontend.
6. **Make safety constraints configurable.** A strict sandbox is good. A narrow tool surface that cannot adapt is a capability limit disguised as a security decision.
7. **Test contribution rules on a fork.** A reproduced bug is not a contribution. The repository's test placement, commit style, and PR template are part of the product.
8. **Keep the honesty in the product, not just the README.** "Inconclusive" is a valid result. "Agents stopped" is a valid result. A tool that can say "I did not test enough" is more trustworthy than one that always claims a clean run.

## Try it

The quickest path is one Docker command. It needs Docker Desktop 4.29+ or Docker Engine 26+:

```bash
docker run -d --name timewraith --restart unless-stopped -p 127.0.0.1:8787:8787 \
  --label com.docker.compose.project=timewraith \
  --label com.docker.compose.service=app \
  -v timewraith-data:/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/tumblerwarren/timewraith-kiroween:latest
```

Then open <http://localhost:8787>. The image contains four finished cases, so you can read a complete run without signing in or spending credits. To run the live Crew, sign in to Kiro once on the Crew page with your own account.

- Repository: `[repo URL]`
- Demo video: `[demo video]`
- Devpost entry: `[Devpost URL]`
- Kiroween 2026: <https://kiroween.devpost.com/>

## Closing

TimeWraith is not a general bug finder. It is a narrow, stubborn instrument for one of the worst classes of bugs. It sweeps the clock, repeats the evidence in clean containers, and refuses to call a fix verified until eight gates pass. The narrowness is the point.

I spent too much of my Kiroween budget on the frontend, and I over-constrained the backend because I was afraid of unknown repositories. Both mistakes taught me the same lesson: the hard part is not making an agent do something impressive once. The hard part is making the system decide what counts, and then making it say "I don't know" when it does not.

The Kiroween categories ask for a haunting interface, a chimera of technologies, or something brought back from the dead. TimeWraith is a little of all three. The costume is Violet Midnight. The chimera is a scanner, a Docker clock sweep, a Kiro Crew, and a fix gate stitched into one pipeline. The resurrection is the bug report that normally ends with "cannot reproduce."

That is what I would build again.

---

## Source map (for the curious)

| Claim | Source |
|---|---|
| One-line product description, flow, real cases | `README.md:3`, `README.md:11-31` |
| Full flow diagram, agents, evidence rule | `docs/agent-flow.md:11-97` |
| Eight gates, fix sessions, limits | `docs/agent-flow.md:191-226`, `:259-270` |
| Invariants and zones | `backend/src/timewraith/sweep.py:22-70` |
| Runtime limits and sandbox flags | `backend/src/timewraith/config.py:41-112`, `sandbox.py:88-126`, `crew.py:197-235` |
| Untrusted data markers | `backend/src/timewraith/agents.py:161-171` |
| MCP proxy for agent tools | `backend/agents/tw_mcp_proxy.py` |
| Kiro specs | `.kiro/specs/timewraith/{requirements,design,tasks}.md`, `.kiro/specs/backend/*` |
| Steering files | `.kiro/steering/{product,backend,windows-shell}.md` |
| Hooks | `.kiro/hooks/*.json`, `scripts/hooks/` |
| Skills | `.kiro/skills/*/SKILL.md` |
| Kiro usage evidence | `docs/kiro-usage.md` |
| Asset pipeline and Codex findings | `docs/tool-check.md`, `tools/art/`, `.kiro/skills/generate-mascot-asset/` |
| Landing motion and clock intro | `frontend/src/animation/react/MidnightIntro.tsx`, `frontend/src/components/cinematic/*`, `docs/landing-motion.md` |
| Visual system and style guard | `docs/design-system.md`, `frontend/src/styles/tokens.css` |
| Animation review that led to the redesign | `docs/reports/anim-review/round1/review.md` |

## Fact-check notes before publishing

1. **Kiroween 2026 must be mentioned in the post.** The rules require the blog to say it is being written as part of Kiroween 2026. The opening line does that. Keep it.
2. **Publish during the submission period.** The window is October 30 to December 4, 2026 at 2:00 pm PT. The Bonus Blog Prize is 2,000 bonus Kiro credits for the top 100 eligible submissions, so the post has to be public on a third-party platform and the URL has to go on the Devpost submission form.
3. **Credit figures are personal.** The 4,000 / 1,800 / 2,200 numbers are your account, not something the repository records. If you want to be extra safe, say "about" or "roughly."
4. **The README is stale.** It says two verified cases; the seed database and `seed/README.md` show three (node-cron, rrule, cron-parser) plus one inconclusive (date-fns). It also says neither fix was sent upstream; rrule PR #679 is open and cron-parser PR #483 was closed. Update the README before publishing, or phrase the blog as "at the time of writing."
5. **Do not claim merged fixes.** The rrule PR is open, not merged. The cron-parser PR was closed as a duplicate of #453 by another author. The node-cron case has no upstream PR.
6. **Do not claim the bugs were unknown.** The cron-parser case explicitly matched an existing open PR (#453). The rrule and node-cron cases may also have public reports; say "found independently and matched against public evidence," not "the maintainers did not know."
7. **Do not claim it works on any repository.** The supported surface is JavaScript/TypeScript with Jest or Vitest at the root package, plus a partial Python path. The README's "Status and limits" section is the source of truth.
8. **The image-generation story is a personal tooling observation.** Phrase it as "the models I had in Kiro at the time" rather than a universal claim about Kiro's model roster.
