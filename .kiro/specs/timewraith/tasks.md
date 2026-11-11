# Implementation Plan: TimeWraith Case Board

## Overview

The plan builds the TimeWraith Case Board (the home screen that replaced the landing page, design decision D14) in visible slices. Tasks 1 and 2 checked the tools and created the Kiro workspace (steering, hooks, skills, usage log). Task 3 delivered a scrollable, seven-section landing page with placeholder art; the Case Board reuses its sections, styles, content modules, mascots, tests, the R1 visual pass and the shots tool. From task 5 on, the plan finishes visual revision R2, restructures the page into the seven board regions with Doctor Stitch as the 14th mascot, then builds the Open-a-case form with draft cases, the case library with the two sample cases, and the case view with the Version_Timeline (design D21), the two-track replay, the Blind hunt reveal and the suggested fix. The animation layer follows (thread, MotionDirector, every signature moment), then the art pipeline with a Pilot_Pack of three full poses (Mini Bat, Wraith Director and Doctor Stitch, generated on 2026-11-10, D22) and an approval stop, the remaining cast, and release work (Lighthouse, Playwright screenshots at 360, 768 and 1440 px, an end-to-end animation check, the README with the Kiro-usage write-up and the three-category pitch, the LICENSE the user chooses, the swap of the placeholder links, and a final checkpoint).

Each phase builds first and then runs dedicated test sub-tasks. About a dozen tests are required (the ones Requirement 15 or a trust boundary depends on); the rest are optional with `*`. Every task names the requirements it covers.

Implementation language: TypeScript (strict) for `frontend/`; Python 3.14 (Pillow, numpy) for `tools/art/`; Node `.mjs` for hook helpers. Commands run from the repo root as `pnpm --dir frontend <script>`; do not start dev servers from the agent.

Phase order (design, Testing Strategy): tool check and Kiro workspace (done), landing skeleton (done), R2 and Case Board regions, Open-a-case form and drafts, case library and sample data, case view, thread and ghost, MotionDirector and clock, signature moments, art pipeline tools, Pilot_Pack and approval, rig parts and remaining cast, polish and release. Tasks from 5 on were renumbered for the Case Board; each moved task says which old task it was, and the Notes hold the full id map.

## Tasks

- [x] 1. Tool check (first task, Requirement 14.1)
  - [x] 1.1 Test one Codex CLI image generation and record the result
    - Run `codex.cmd exec --skip-git-repo-check -s workspace-write -C f:\Projects\kiroween-26` (the repository root) with this test prompt: "Generate one image of a single hand-inked cartoon bat with its wings open, vintage 1930s Halloween cartoon style, on a flat solid #FF00FF background, no text, no other objects." The prompt never asks for "transparent". Run `codex.cmd --version` first and record it
    - Create `docs/` and `docs/tool-check.md` if they do not exist; no user input is needed. If quota or authentication blocks the run, record the error text and use fallback level 2 from the design's fallback table
    - Record in `docs/tool-check.md`: whether `image_gen` was invoked non-interactively, the output folder under `~/.codex/generated_images`, whether the file could be copied into the workspace, latency, PNG mode and alpha presence, pixel size, and the visible quota cost of one image
    - Copy the result to `frontend/assets/masters/_toolcheck/` and write the verdict (fallback level 0, 1, 2 or 3 from the design's fallback table) at the top of `docs/tool-check.md`
    - Invoke the tool only through `codex.cmd`
    - _Requirements: 14.1, 14.2, 14.5, 13.1_

  - [x] 1.2 Check OpenCode CLI and the local toolchain, then record the work split
    - Run `opencode.cmd --version`; record success or the failure text (the design expects `EEXIST` on its log folder)
    - Check `node`, `pnpm`, `python` (3.14), Pillow and numpy versions; check for a Chrome or Chromium binary for Lighthouse
    - Append to `docs/tool-check.md`: OpenCode available yes/no, and the decision. If it is unavailable, the Cutout_Script (11.2), the sprite and rig components (7.2, 12.2) and the Asset_QA_Page (11.5) are done by the primary agent. If it works, those four tasks may be delegated through `opencode.cmd` and the primary agent reviews the result before the task is marked done
    - _Requirements: 14.3, 14.4, 14.5_

- [x] 2. Create the Kiro workspace configuration
  - [x] 2.1 Create the steering files in `.kiro/steering/`
    - Always-on: `product.md`, `tech.md`, `structure.md`, `tool-usage.md` (each under about 40 lines; `product.md` names the spec paths and does not embed `requirements.md`; `product.md` also records the three hackathon angles of design decision D10: Costume Contest as the lead for the UI (hand-inked, cel-painted UI and the mascot cast), Frankenstein (a Crew of agents stitched to Playwright clock control, a sandbox runner and a version comparator) and Resurrection (old date-boundary bugs from public issue trackers such as FullCalendar #7998 revived as reproducible evidence))
    - Write each file body from the design's "Steering" table and its `tool-usage.md` block (copy that block as written); write `tech.md` from the design's Stack table and `structure.md` from its module layout. Where the design gives only a summary, write the file from that summary. No further decisions are needed
    - `fileMatch`: `art-style-bible.md`, `design-tokens-copy.md`, `motion-rules.md` with the patterns from the design; embed with `#[[file:tools/art/style_bible.txt]]` and `#[[file:frontend/src/styles/tokens.css]]` (the `tokens.css` embed resolves only after task 3.2 creates that file, which is expected)
    - `auto`: `asset-pipeline.md` (`name` and `description` front matter); `manual`: `kiro-usage-log.md`
    - Create `tools/art/style_bible.txt` with the v1 Style_Bible text copied from the design (section "Style_Bible text (v1 ...)") so the embed resolves
    - _Requirements: 17.2, 17.4, 13.2, 17.6, 17.7_

  - [x] 2.2 Create the hook helper scripts and the style guard
    - `scripts/hooks/read-event.mjs` (defensive STDIN parsing: `readEvent`, `eventPath`, `eventCommand`)
    - Hook command helpers that exit 0 with a message when `frontend/` does not exist yet: `web-check.mjs` (lint and typecheck on save), `motion-coverage.mjs` (Reduce Motion coverage check), `asset-pipeline.mjs` (cutout and QA on master save), `run-tests.mjs` (tests after task, plus pytest on `tests/art` when it exists), `guard-shell.mjs` with modes `shims` (`.ps1` shim blocker) and `commit` (style guard and lint before `git commit`), `post-shell-qa.mjs` (asset QA refresh), `dump-event.mjs` (debug event dump)
    - `scripts/check-style-guard.mjs`: scan `frontend/src/**/*.{css,tsx}` for `backdrop-filter`, blurred `box-shadow`, `text-shadow` glow, purple or cyan gradients, stray hex colors outside `tokens.css`, `pumpkin-600` used as a text color, and nested rounded cards; print file, line and rule; exit 2 on violation
    - _Requirements: 12.7, 11.9, 14.5, 15.2_

  - [x] 2.3 Create the eight hook definitions in `.kiro/hooks/`
    - `lint-typecheck-on-save.json`, `style-guard-on-save.json`, `asset-pipeline-on-master-save.json`, `reduce-motion-coverage.json`, `tests-after-task.json` (PostTaskExec), `guard-shell.json` (two PreToolUse guards, exit 2 blocks), `asset-qa-refresh.json` (PostToolUse), `debug-hook-event.json` (disabled)
    - Use precise file-path matchers and `node scripts/hooks/<helper>.mjs` commands as in the design
    - _Requirements: 17.2, 17.4, 12.7, 15.2, 14.5_

  - [x] 2.4 Create the four workspace skills and seed the usage log
    - `.kiro/skills/generate-mascot-asset/`, `add-motion-effect/`, `run-landing-qa/`, `write-kiro-usage-readme/` each with `SKILL.md` (`name` equals the folder name, keyword-rich `description`) and `references/` files where the design names them (`prompt-template.md`, `part-specs.md`); copy the `generate-mascot-asset` and `add-motion-effect` bodies from the design, and write `run-landing-qa` and `write-kiro-usage-readme` from the one-line summaries in the design (the README skill must list the three category angles of D10, Costume Contest as the lead). `part-specs.md` starts as a short template that task 11.1 fills in from `assets.spec.json`
    - Create `docs/kiro-usage.md` with a header, the entry template (date, Kiro feature, what it caught, file reference) and the first entry for this workspace setup
    - _Requirements: 17.2, 17.4_

  - [x] 2.5 Pin the hook event schema and verify open research items
    - Enable `debug-hook-event.json` once, save a file and run one shell tool call, record the real STDIN JSON in `docs/kiro-usage.md`, update `read-event.mjs` field names, then disable the hook again. If no event is captured (for example, hooks load only at session start), keep the defensive field names, record "not captured" with the reason, and continue
    - Check whether `.kiro/skills/` is discovered (for example, ask Kiro to list the available skills or invoke `/generate-mascot-asset`). If it is not discovered, or the agent cannot determine this from its own session, record "unconfirmed" and add `manual` steering fallbacks (`/generate-mascot-asset` and the other three workflows) in `.kiro/steering/`; the fallbacks are cheap, so no question to the user is needed
    - Confirm on gsap.com that ScrollTrigger and `@gsap/react` are free in the public package, and that `https://github.com/kirodotdev/KiroCrew` resolves (task 3.3 puts it in `config/links.ts`, which does not exist yet); record both in `docs/kiro-usage.md`
    - _Requirements: 17.4, 9.12, 17.1_

  - [ ]* 2.6 Write tests for the hook helpers and style guard script
    - Use `node:test`: `eventPath` and `eventCommand` with several event shapes, empty STDIN, and the "frontend not scaffolded" exit-0 path
    - Style guard unit cases: each banned pattern is reported with file and line; a clean file passes
    - _Requirements: 12.7, 15.2_

- [x] 3. Phase 1: Scaffold and visible landing page skeleton with placeholder art
  - [x] 3.1 Scaffold the `frontend/` application
    - Vite, React 19, TypeScript strict, pnpm; no Tailwind, component kits, Rive or Lottie; install `motion`, `gsap`, `@gsap/react`, the three `@fontsource-variable/*` fonts, Vitest, Testing Library, jsdom, fast-check, ESLint
    - ESLint `no-restricted-imports` forbidding `gsap`, `gsap/*` and `animate` from `motion` outside `src/animation/**`
    - `index.html` with the inline script that sets `html[data-reduce-motion]` before first paint (stored choice, else the media query), font preload and a `<noscript>` block with the headline, subhead and sample-data note
    - `package.json` scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:run`, `guard:style`, and `verify` (typecheck, lint, guard:style, test:run, build)
    - `src/test/setup.ts`, `vitest.config.ts`, one smoke test so `pnpm verify` passes on an empty app
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 9.13, 10.2, 15.9, 12.9_

  - [x] 3.2 Create the design tokens, fonts and base styles
    - `styles/tokens.css` with exactly the twelve required colors, `--space-*` multiples of 4, font stacks, hard-offset ink shadow, one radius, easing and `--reduced-fade: 120ms`
    - `styles/fonts.css` (`font-display: swap`, `size-adjust` fallback faces), `base.css` (focus ring, `[data-reduce-motion]` rules, `.idle-loop` and `data-ambient` pause rules), `layout.css` (rail, content and aside grid, section theme classes, 120 px seam gradients with no text, `compact` at `max-width: 767.98px`)
    - Section theme CSS under `styles/sections/*.css` using only allowed text and background pairs
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7, 12.8, 12.9, 11.2, 11.6, 11.8, 11.9, 2.5_

  - [x] 3.3 Create content, configuration and mock data modules
    - `config/links.ts` (Placeholder_Links for demo and GitHub in one file, plus issue #7998, Playwright clock, Kiroween and KiroCrew links)
    - `content/copy.ts` exporting the fixed strings as constants (headline, subhead, CTA labels and note, "Demo mode, simulated status", replay label, "Recorded replay", "Browser clock controlled", "Browser time ≠ server time", "No anomaly observed in tested cases")
    - `content/crew.ts` (13 Mascots: name, tier, section assignment, one-line job), `flow.ts` (scope, plan, approve, run, evidence with mascots per step), `evidence.ts` (ladder statuses, one-line definitions, shape ids, Inconclusive separate), `nodes.ts` (Section_Node stamps)
    - `data/replay.stream.ts` (8 to 20 events modelled on FullCalendar #7998 as a time-zone date-boundary case, per decision D1) and `data/setup-checklist.ts` (simulated statuses, each labelled simulated)
    - _Requirements: 1.2, 3.1, 3.5, 3.6, 4.1, 4.5, 5.2, 5.6, 5.7, 6.1, 6.2, 6.3, 7.2, 7.3, 7.4, 7.9, 7.10, 8.1, 8.2, 8.3, 8.4, 8.5, 16.1, 16.2, 16.3, 16.4, 16.5, 17.1_

  - [x] 3.4 Create the mascot and art layer with placeholder art
    - `mascots/ids.ts`, `roster.ts`, `Mascot.tsx`, `placeholder/PlaceholderMascot.tsx` (flat inked SVG silhouettes per mascot in palette tokens, with the real name as accessible text)
    - `assets/manifest.ts` (types, empty manifest allowed), `assets/resolve.ts` (`resolveMascotArt` returns `rig`, `pose` or `placeholder`, total and never throws), `assets/AssetProvider.tsx`, `assets/Art.tsx` (reserves `width` and `height`, `alt` rules, `loading="lazy"` outside the Hero, falls back rig, pose, placeholder)
    - `components/PlaceholderBadge.tsx` for visibly marked placeholder links
    - _Requirements: 4.8, 14.2, 11.4, 11.5, 18.2, 18.3, 12.6_

  - [x] 3.5 Create the app shell, providers, navigation and footer
    - `main.tsx`, `App.tsx`, `a11y/ReduceMotionProvider.tsx` (stored choice, then media query; updates `html[data-reduce-motion]`; Motion `reducedMotion` always or never), `a11y/LiveAnnouncer.tsx`
    - `components/SiteNav` with node links and the Reduce_Motion_Toggle (announces the new state), `components/SiteFooter` as a page-level `<footer>` sibling after `<main>` crediting Kiro Crew, the Playwright Clock docs and Kiroween 2026
    - Skip link, one `h1`, `header`/`nav`/`main`/`section`/`footer` landmarks, seven section containers in order with temporary stub content
    - _Requirements: 1.4, 10.1, 10.2, 10.3, 11.1, 11.3, 17.1, 3.10, 12.6_

  - [x] 3.6 Build the Hero, Problem and Crew sections (static)
    - `components/Clock` (painted-face placeholder plus separate SVG hands at 23:59), `components/Cta` (primary "Enter the Clocktower" with the note, two secondary CTAs as Placeholder_Links with visible placeholder tags; label at least 18.66 px bold with a 2 px ink border per D7), `components/SetupChecklist` (flat notice board; label "Demo mode, simulated status" in the same region at every width)
    - Hero layout with Wraith Director and Watchtower Warden beside the Clock; Problem static scene showing 01:59 and 03:00 stamps with a static crack; Crew with 5 agents, 6 system components and 2 companions on shelves, each with name and one-line job
    - Register the three sections in `sections/index.tsx` and replace their stubs
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 5.2, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 11.9, 12.8, 16.4_

  - [x] 3.7 Build the Flow, Replay_Lab, Proof and Final_CTA sections (static)
    - Flow: five steps alternating sides with their mascots attached; Replay_Lab: case-file sheet showing event 0 from the mock stream, "Recorded replay" and sample-data labels, the #7998 link, JetBrains Mono for timestamps and evidence values; Proof: `components/EvidenceLadder` (five ordered rungs with text and distinct shapes, Inconclusive separate, one-line definitions), "Browser time ≠ server time" with the explanation; Final_CTA: CTA sheet repeating the Hero's CTAs, labels and note, plus the footer
    - Update `sections/index.tsx` and replace the remaining stubs; the page is now fully scrollable
    - _Requirements: 3.6, 3.8, 3.9, 3.10, 5.8, 7.1, 7.2, 7.4, 7.9, 7.10, 7.11, 8.1, 8.2, 8.3, 8.4, 8.6, 16.2, 16.4, 16.5_

  - [ ]* 3.8 Write property test for palette and spacing tokens
    - **Property 13: Palette and spacing tokens**
    - **Validates: Requirements 12.1, 12.2**

  - [x] 3.9 Write property test for text-pair contrast
    - Create `contrast-pairs.ts` holding the design's token contrast table with roles and sizes
    - **Property 14: Contrast of text pairs**
    - **Validates: Requirements 11.8, 11.9, 15.6**

  - [ ]* 3.10 Write property test for copy honesty
    - Cover copy constants and the static render of every section
    - **Property 12: Copy honesty**
    - **Validates: Requirements 6.3, 7.9, 7.10, 8.5, 16.1, 16.2, 16.3, 16.4**

  - [ ]* 3.11 Write property test for banned styles
    - Run `check-style-guard.mjs` over the source and over mutated copies containing one banned pattern each
    - **Property 15: Banned styles are detected and absent**
    - **Validates: Requirements 12.7, 11.9**

  - [ ]* 3.12 Write property test for status never color-only
    - **Property 26: Status is never color-only**
    - **Validates: Requirements 8.6, 11.10**

  - [ ]* 3.13 Write property test for image accessibility and reserved space
    - **Property 25: Images are accessible and reserve space**
    - **Validates: Requirements 11.4, 12.6, 18.2, 18.3**

  - [ ]* 3.14 Write property test for mascot art resolution
    - **Property 21: Mascot art resolution is total**
    - **Validates: Requirements 4.8, 14.2**

  - [ ]* 3.15 Write component tests for page structure
    - Seven sections in order, one `h1`, landmarks, `<footer>` is page-level, 13 mascots with name and job, headline and subhead text, checklist label inside the checklist region, placeholder links are visibly marked, Reduce Motion toggle toggles the attribute and announces, no network requests are made on render
    - _Requirements: 1.1, 1.3, 1.4, 3.1, 3.5, 5.7, 6.4, 10.1, 10.3, 11.3_

- [ ] 4. Checkpoint - Skeleton page review
  - Run `pnpm --dir frontend verify`. Ensure all tests pass, ask the user if questions arise.
  - Ask the user to run `pnpm --dir frontend dev` and scroll the page. Append a phase entry to `docs/kiro-usage.md` (use `/kiro-usage-log`).

- [x] 5. Phase 2: Finish R2 and restructure the page into the Case Board regions
  - [x] 5.1 Finish visual revision R2 type and the night-heavy layout
    - Check what R2 already shipped (the three fonts are installed and `tokens.css` names IM Fell English, Libre Franklin and JetBrains Mono) and finish the rest from the design's Visual revision R2 table: headings at weight 400 with `font-synthesis: none`, hierarchy by size and italics, no Fraunces or Instrument Sans left in CSS, `fonts.css`, `index.html` preloads or `package.json`
    - Region backgrounds per the design's page structure table (tower-950 and walnut-700 through region 6, moon-200 only in the Closing); cream only on paper objects
    - Add any new text pair (brick-700 error text on paper-100) to `contrast-pairs.ts` so the existing contrast test covers it
    - _Requirements: 12.3, 12.4, 12.5, 12.9, 12.12, 11.8_

  - [x] 5.2 Update the always-on steering for the Case Board
    - `product.md`: positioning line, one Case Board screen with seven regions, 14 mascots, local drafts, extended honesty rules (both public reports are third-party reports, Cal.com events are illustrative, drafts are not run, a suggested fix is never called merged and is called verified only after a passing fixed-version check), the D10 angles with Doctor Stitch and Cal.com #30021
    - `structure.md`: the new folders `cases/`, `data/cases/`, `replay/` and the renamed `sections/` folders; note that `frontend/src/cases/` is board UI, not the out-of-scope repo-root `cases/`
    - `.kiro/skills/run-landing-qa/SKILL.md`: keep the name for history, update the description and steps to the Case Board regions
    - _Requirements: 17.2, 17.4, 17.6, 17.7_

  - [x] 5.3 Update the content modules and add Doctor Stitch to the roster
    - `content/copy.ts`: add the positioning line and the fixed strings from the design's copy list; delete `PRIMARY_CTA` and `CTA_NOTE` and their uses and tests
    - `content/crew.ts`, `mascots/ids.ts`, `mascots/roster.ts`: add `doctor-stitch` (Tier 1, agent, "Patch-maker: stitches a suggested fix and the regression test that proves it."), 14 entries, region assignment per the design's per-region mascot table
    - `content/flow.ts`: six steps scope, plan, approve, run, evidence, fix with the mascots per step (D17); `content/nodes.ts`: the seven region ids and stamps; new `content/modes.ts` with the Case_Mode labels and descriptions; `config/links.ts`: add `issue30021`
    - _Requirements: 3.1, 3.5, 3.6, 3.8, 4.1, 4.5, 16.4, 16.5_

  - [x] 5.4 Add the Doctor Stitch placeholder art
    - Add a Doctor Stitch silhouette to the `PlaceholderMascot` shape table (patchwork body with seam strokes, needle arm raised, spool in the other hand) with the same misregistration as the others and the accessible name "Doctor Stitch"; add `doctor-stitch` to the art resolver so `resolveMascotArt` covers it
    - _Requirements: 4.1, 4.8, 14.2, 11.4_

  - [x] 5.5 Restructure the page into the seven regions
    - `components/AppHeader` (from `SiteNav`): wordmark, clock-stamp nav to the seven regions (a native `<details>` disclosure below 768 px), `GatewayBadge` "Demo mode, simulated status", and the Reduce_Motion_Toggle with its visible state text ("Motion: on", "Motion: reduced", "Motion: reduced (system setting)")
    - `sections/OpenCase/` (from Hero: Clock, Wraith Director as the one large figure, Watchtower Warden small above the checklist, headline, subhead, positioning line, a slot for the form, the checklist); `sections/LostHour/` (from Problem, 160vh, caption per D18); `sections/Library/` and `sections/CaseView/` shells that render the FullCalendar case statically from the existing stream with the existing Replay_Lab and Proof content; move `sections/ReplayLab/{Scrubber,EventCard,ClockInspector,format}` to `replay/`; `sections/Closing/` (from FinalCta: "Open a case" button, demo and GitHub Placeholder_Links with the footnote, the Raven stamp text); Crew with 14 mascots; Flow with six steps
    - Region themes and seams per the page structure table; one `h1`; `<footer>` stays a sibling after `<main>`; update `sections/index.tsx`, the `<noscript>` text and the existing component tests to the new regions so `pnpm --dir frontend verify` passes
    - _Requirements: 1.1, 1.4, 1.7, 2.2, 3.1, 3.2, 3.5, 3.6, 3.10, 5.6, 5.7, 5.8, 6.1, 6.4, 6.5, 10.1, 10.10, 11.3, 12.8, 17.1_

  - [x]* 5.6 Write component tests for the Case Board structure
    - Seven regions in order with their ids, one `h1`, landmarks, page-level `<footer>`; the header shows the badge text and the toggle state text; 14 mascots with name and job, Doctor Stitch included; six Flow steps in order with Doctor Stitch on fix; the Closing has both Placeholder_Links with the footnote; no "Enter the Clocktower" text remains
    - _Requirements: 1.4, 3.5, 3.6, 3.10, 5.6, 6.5, 10.10, 11.3_

- [ ] 6. Checkpoint - Case Board skeleton
  - Run `pnpm --dir frontend verify`. Ensure all tests pass, ask the user if questions arise. Ask the user to run `pnpm --dir frontend dev` and scroll the board. Append a phase entry to `docs/kiro-usage.md`.

- [x] 7. Phase 3: Open-a-case form and Draft_Cases
  - [x] 7.1 Create the case models
    - `cases/model.ts` with `CaseMode`, `Target`, `VersionEntry`, `SuggestedFix`, `SampleCase`, `DraftCase`, `Case` and `caseStatus` as in the design's Case models; extend `data/types.ts` (`ReplayEvent.versionId`, nullable `browserClock`, `ServerClockReading`, the actors `two-faced-jack` and `doctor-stitch`, the kinds `reveal`, `fix`, `compare`, and `check`)
    - _Requirements: 19.1, 20.2, 22.3, 24.1, 25.1_

  - [x] 7.2 Implement the form validator
    - `cases/form/validate.ts`: pure `validate(values)` with the rules of the design's form table (repository URL, ref or commit, loopback app URL, issue URL, area length, mode-dependent fields), trimming first, plain-sentence errors, never throws; hidden fields are neither validated nor returned
    - _Requirements: 19.2, 19.3, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 19.11, 19.16_

  - [x] 7.3 Implement draft storage and the case store
    - `cases/drafts/storage.ts` (`DRAFTS_KEY = "tw.cases.v1"`, `loadDrafts`, `saveDrafts`, `MAX_DRAFTS = 20`, re-validation on read, reads never write, try/catch around every storage access) and `cases/drafts/ids.ts`
    - `cases/store.tsx` (`CaseStoreProvider` with `createDraft`, `removeDraft`, `select`; default selection FullCalendar #7998; persist after each change; `saved: false` when storage fails) and `cases/catalog.ts` (samples first, then drafts newest first); mount the provider in `main.tsx`
    - _Requirements: 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 21.1, 21.5_

  - [x] 7.4 Build the Open_Case_Form
    - `cases/form/OpenCaseForm.tsx`, `TargetFields.tsx`, `ModeField.tsx`, `ErrorSummary.tsx`: native fieldsets and radio groups, visible labels and hints, validation on blur and on submit, an error summary with links that receives focus, `aria-invalid` and `aria-describedby`, values kept on error, user input rendered as text only; the "Not contacted in demo mode" line; the submit button "Open the case" with the draft note
    - Leave a hook point where text-input focus will set `suppressed.input` (wired in task 12.4)
    - Mount it on the paper form sheet in `sections/OpenCase/`, styled per R2 (inputs are interactive controls with the ink border and hard shadow)
    - _Requirements: 19.1, 19.4, 19.12, 19.13, 19.14, 19.15, 19.16, 19.17, 12.4, 12.10_

  - [x] 7.5 Wire the honest submit
    - A valid submit runs `createDraft`, announces "Draft case created, not run", resets the form, scrolls the new card into view and focuses it (`behavior: "auto"` in Reduce Motion), and keeps the URL path; at 20 drafts it shows the limit message and creates nothing; no network call of any kind
    - Leave hook points for the `bats.burst` and `case.draft-create` requests (wired in tasks 12.5 and 14.2)
    - _Requirements: 20.1, 20.2, 20.8, 20.10, 5.5, 1.3, 10.8_

  - [x] 7.6 Write property test for form validation
    - **Property 27: Open-a-case validation**
    - **Validates: Requirements 19.2, 19.3, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 19.11, 19.16, 15.10**

  - [x] 7.7 Write property test for the draft storage round-trip
    - Use a fake `Storage` whose `setItem` can be made to throw
    - **Property 28: Draft storage round-trip**
    - **Validates: Requirements 20.4, 20.5, 20.6, 20.7, 15.10**

  - [x]* 7.8 Write component tests for the form
    - Fields show and hide with target type and mode; a failed submit focuses the summary and keeps the values; each invalid field has `aria-invalid` and a described-by error; the form can be completed with the keyboard only; a valid submit announces, focuses the new card and makes no `fetch` call; the limit message appears at 20 drafts
    - _Requirements: 19.2, 19.3, 19.6, 19.13, 19.14, 19.15, 20.1, 20.8, 20.10, 1.3_

- [x] 8. Phase 4: Case library and the two sample cases
  - [x] 8.1 Author the sample case data
    - Move the FullCalendar stream to `data/cases/fullcalendar-7998.stream.ts` (keep `data/replay.stream.ts` as a re-export), add `versionId: "fc-6.1.10"` to every event and the Doctor Stitch event e14; write `fullcalendar-7998.case.ts` (Known issue, sample label, versions, time-control note, an illustrative suggested fix with a Playwright regression test, `upstream: null`)
    - Before writing the FullCalendar case, check FullCalendar's releases and changelog for a release that fixes #7998. If one exists, ask the user whether to add an illustrative fixed-version event on that release (D16); otherwise keep "Fixed-version check not run"
    - Write `calcom-30021.stream.ts` (the 17 events of the design's Cal.com table, server clock readings, `browserClock: null`, checks on `cal-affected` and `cal-patched`) and `calcom-30021.case.ts` (Blind hunt, hidden title, illustrative label and mode label, reveal outcome `match`, versions as illustrative pins, time-control note, an illustrative suggested fix and regression test written from the report's description, upstream "Fix described in the public report" with "192 tests green"); no invented commit hash; then `data/cases/index.ts`
    - _Requirements: 7.2, 7.3, 7.4, 16.5, 16.6, 16.9, 23.1, 24.1, 24.3, 24.6, 26.1, 26.2, 26.3, 26.4, 26.5, 26.7_

  - [x] 8.2 Extend the stream validator
    - `replay/validateStream.ts` with the existing rules plus the case-aware rules from the design (versions exist, clock-scope wording, fixed-version order, exactly one reveal after Reproduced for a Blind hunt); run it on both sample streams in tests and in dev
    - _Requirements: 7.3, 16.5, 22.6, 22.7, 23.1, 26.6_

  - [x] 8.3 Build the Case_Library, Case_Card and Version_History_Strip
    - `cases/library/CaseLibrary.tsx` (an `<ol>` along the thread, samples then drafts), `CaseCard.tsx` (title, mode tag with shape, target in mono, status label and shape or the draft label, sample label, "Open case" button with `aria-current`, "Remove draft", the "Not saved" notice, "Issue hidden until the reveal" for a Blind hunt), `VersionHistoryStrip.tsx` (from `case.versions`, result text and shape, "illustrative pin")
    - Selection: `select(id)` swaps the Case_View at once, focuses its heading, scrolls to it, announces "Case opened: <title>", and keeps the URL; leave hook points for `case.open` and `cases.enter` (wired in task 14.2)
    - Mount it in `sections/Library/`; paper folders styled per R2
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 25.1, 25.2, 25.3, 25.5, 20.9, 11.10, 12.10_

  - [x]* 8.4 Write property test for mock stream validity
    - Cover both sample streams and random single mutations
    - **Property 11: Mock stream validity**
    - **Validates: Requirements 7.3, 16.5, 22.6, 22.7, 23.1, 26.6**

  - [x]* 8.5 Write property test for case selection
    - **Property 29: Case selection**
    - **Validates: Requirements 21.4, 21.5, 21.6, 22.9, 20.8, 5.5**

  - [x]* 8.6 Write property test for drafts never looking run
    - **Property 33: Drafts never look run**
    - **Validates: Requirements 20.2, 20.3, 22.8, 25.3, 16.7**

- [x] 9. Phase 5: Case view with the Version_Timeline, the two-track replay, the reveal and the suggested fix
  - [x] 9.1 Implement the replay logic and the track model (includes old task 9.2)
    - `replay/replayMachine.ts` (`clampIndex`, step, first, last, key mapping for ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Home, End), `replay/view.ts` (event, timestamp, version, clock, ladder rung, `revealed` and `ariaValueText` as a function of the index and the case; pointer fraction to index), `replay/tracks.ts` (`buildTracks`)
    - _Requirements: 7.5, 7.6, 7.7, 7.8, 7.13, 22.2, 22.3, 22.4_

  - [x] 9.2 Build the two-track Replay_Lab (includes old task 9.3 without its effects)
    - `cases/view/TwoTrackReplay.tsx` and `VersionClockTrack.tsx`, using `Scrubber`, `EventCard` and `ClockInspector` from `replay/`: one scrubber over both tracks (pointer drag and click, keyboard, previous and next buttons), aligned pegs and clock chips, version runs, current markers by shape and text, a polite live region (150 ms debounce while dragging), an optional user-started Play button (no autoplay), the mode label and sample label of the case, the issue link (subject to the reveal), index reset on case change
    - Leave a hook point where scrubber focus will set `suppressed.scrubber` (wired in task 12.4)
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.9_

  - [x] 9.3 Build the Blind hunt reveal
    - `cases/view/RevealPanel.tsx`: a face-down card before the reveal index with no issue identity anywhere in the DOM (header, links, accessible names, `aria-valuetext`); at and after the reveal, the third-party report with its link and the recorded outcome stamp; a live announcement of the outcome; leave a hook point for `replay.reveal`
    - _Requirements: 23.2, 23.3, 23.4, 23.5, 23.6, 16.5, 26.7_

  - [x] 9.4 Move the proof content into the Case_View
    - `cases/view/CaseView.tsx` and `CaseHeader.tsx` (title or hidden title, mode, target, sample label, "Fixed-version check not run" when it applies); the Evidence_Ladder marks the current event's rung (shared with `LadderStrip`), Inconclusive separate, definitions present; "Browser time ≠ server time" with `TimeControlNote` per case ("Browser clock controlled" or "Server time zone set"); Mummy Wrapper's hash tag and Jack's panel stay; `DraftCaseView.tsx` for drafts; mount it all in `sections/CaseView/`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 22.1, 22.7, 22.8, 26.5, 26.6, 16.1, 16.3_

  - [x] 9.5 Build Doctor Stitch's suggested fix
    - `cases/fix/SuggestedFix.tsx` and `DiffView.tsx`: the "Suggested fix" heading, change and regression-test diffs in `<pre><code>` with "+" and "−" markers and hidden "added line" or "removed line" text, the "Illustrative diff" label, the upstream column or "No upstream fix found", the status from `fixLabel(case)` ("Verified on ..." only under the design's rule, else "Not verified"), the Doctor Stitch figure at the sheet edge, and a static SVG stitch line along the sheet margin that continues Spider Weaver's scrubber thread down to the Timeline_Thread; leave a hook point for `stitch.sew`
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 16.8, 12.5, 4.10_

  - [x] 9.6 Add the Version_Timeline data and build the Version_Timeline (new in R3, D21)
    - `cases/model.ts`: `MILESTONE_ORDER`, `MilestoneKind`, `VersionMilestone`, `MilestoneState`, and `timeline` on `SampleCase`; add the five milestones of each sample case from the design's two timeline tables (FullCalendar: 6.1.10 released 2023-11-29 linked to npm, #7998 reported 2025-09-12 linked to the issue, e11, e14, "Fixed-version check not run"; Cal.com: illustrative pin with no date, #30021 reported 2026-08-21, e11, e13, e15); recheck both dates against the issue and the npm registry before writing them, and leave a date out rather than guess
    - Extend `replay/validateStream.ts` with the timeline rules (order, known versions and events, dates only on history milestones and never on an illustrative pin, chronological dates)
    - `cases/view/timeline.ts` (pure `timelineView(case, index)` returning one `MilestoneState` per milestone, the issue-reported milestone `hidden` before the reveal of a Blind hunt) and `cases/view/VersionTimeline.tsx` (an `<ol>` of five milestone rings on a branch of the thread above the replay, state by text and shape, dates as source links in mono, "Sample replay, event eNN" on replay milestones, the draft row for a Draft_Case); leave a hook point for `timeline.milestone`
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9, 28.10, 16.11, 16.12, 22.1, 11.10_

  - [x] 9.7 Write property test for replay index clamping
    - **Property 8: Replay index clamping**
    - **Validates: Requirements 7.13**

  - [x] 9.8 Write property test for replay stepping and keyboard mapping
    - **Property 9: Replay stepping and keyboard mapping**
    - **Validates: Requirements 7.6, 7.7, 7.8, 15.4**

  - [x] 9.9 Write property test for reveal honesty
    - Include the Version_Timeline's issue-reported milestone in the DOM checked before the reveal
    - **Property 31: Reveal honesty**
    - **Validates: Requirements 21.7, 23.2, 23.3, 23.4, 28.8, 15.10**

  - [x]* 9.10 Write property test for two-track alignment
    - **Property 30: Two-track alignment**
    - **Validates: Requirements 22.2, 22.3, 22.4, 25.4**

  - [x]* 9.11 Write property test for suggested-fix labelling
    - **Property 32: Suggested-fix labelling**
    - **Validates: Requirements 24.2, 24.3, 24.4, 24.5, 24.6, 16.8**

  - [x]* 9.12 Write property test for the replay view
    - **Property 10: Replay view is a function of the index**
    - **Validates: Requirements 7.1, 7.5, 7.12**

  - [ ]* 9.13 Write property test for copy honesty across cases
    - Render both sample cases at every index and generated drafts, with Reduce Motion on and off; "Recorded investigation replay" never appears
    - **Property 12: Copy honesty**
    - **Validates: Requirements 6.3, 6.5, 7.9, 7.10, 8.5, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.8, 16.10**

  - [ ]* 9.14 Write component tests for the Case_View
    - Scrubber drag and click update event, version and clock on both tracks; arrow, Home and End keys match the buttons; the live region text equals the new event; the Cal.com case says "Server time zone set" and never "Browser clock controlled" for server events; the FullCalendar case shows "Fixed-version check not run" and no marked Fixed-version verified rung; ladder order, Inconclusive separate, definitions present; the Version_Timeline shows five milestones in order and marks e11's milestone reached only from e11
    - _Requirements: 7.5, 7.6, 7.7, 7.8, 7.12, 8.1, 8.2, 8.3, 22.4, 22.7, 26.5, 26.6, 28.1, 28.6, 15.4_

  - [x]* 9.15 Write property test for the Version_Timeline
    - **Property 34: Version timeline order and honesty**
    - **Validates: Requirements 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9, 16.12**

  - [x]* 9.16 Write property test for sample-case sources and labels
    - **Property 35: Every sample case cites its source and carries its label**
    - **Validates: Requirements 16.4, 16.5, 16.10, 16.11, 26.7, 7.4**

- [ ] 10. Checkpoint - Case flows without animation
  - Run `pnpm --dir frontend verify`. Ensure all tests pass, ask the user if questions arise. Ask the user to run `pnpm --dir frontend dev`, open a draft case, reload to see it persist, and select and scrub both sample cases (watch the Version_Timeline milestones and the Cal.com reveal). Append a phase entry to `docs/kiro-usage.md`.

- [x] 11. Phase 6: Timeline Thread, Section Nodes, Mini Ghost and ledge (was task 5)
  - [x] 11.1 Implement the pure thread geometry (was 5.1)
    - `thread/geometry.ts`: build the path from anchors with seeded wobble and two stacked strokes, a sample table (about 400 points with cumulative length), `drawnLength(leadY)`, and `atY(y)` (as named in the design's `ThreadModel`)
    - _Requirements: 2.1, 2.3_

  - [x] 11.2 Implement the Timeline_Thread, Section_Nodes and the scroll layer (was 5.2)
    - `thread/ThreadLayer.tsx` (single SVG line from the Open-a-case panel to the Closing, `stroke-dasharray`/`dashoffset` drawing, no layout shift), `thread/SectionNode.tsx` (dated stamp, `aria-current` on the active node, click and keyboard scroll to the region); the App_Header clock-stamp links use the same targets
    - `animation/scroll/loadScroll.ts` (dynamic import after first paint, a caught failure renders the thread fully drawn), `setupThread.ts` (`useGSAP` with dependencies `[reduceMotion, compact]` and `revertOnUpdate`, produces the `leadY` MotionValue), re-measure after `document.fonts.ready`, `ResizeObserver`, `ScrollTrigger.refresh`, and when the library grows or the selected case changes
    - Reduce Motion: thread fully drawn, no ScrollTrigger scrubbing
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 10.7, 9.12, 9.14_

  - [x] 11.3 Implement the Mini Ghost, ledge occlusion and mount the layers (was 5.3)
    - `thread/GhostCompanion.tsx` (spring follows `leadY`, x from the thread at its smoothed y, fixed at the Open-a-case node in Reduce Motion), `thread/LedgeLayer.tsx` (foreground ledge mask using a placeholder shape until the art exists)
    - A minimal `overlay/OverlayLayer.tsx` (fixed, full viewport, `pointer-events: none`, z-index 40) hosting the ghost; task 12.4 extends it with the bat pool. Ledge z-index 45, node anchors 46, header 50; `<main>` creates no stacking context
    - Mount `ThreadLayer`, `LedgeLayer` and `OverlayLayer` in `App.tsx`; tablet rule for 768 to 1099 px; fewer ghost effects below 768 px
    - _Requirements: 2.6, 4.9, 10.5, 11.7, 13.11, 9.14_

  - [x] 11.4 Write property test for thread geometry (was 5.4)
    - **Property 16: Thread geometry**
    - **Validates: Requirements 2.1, 2.3**

  - [x]* 11.5 Write property test for ghost placement (was 5.5)
    - **Property 17: Ghost placement**
    - **Validates: Requirements 2.6, 10.5**

  - [ ]* 11.6 Write unit tests for nodes and Reduce Motion thread (was 5.6)
    - Each node is a native anchor whose `href` targets its region id and its target heading has `tabindex="-1"`; exactly one node has `aria-current`; the z-index order is ledge 45 above overlay 40 and below header 50; with Reduce Motion on the thread is fully drawn and the ghost is at the Open-a-case anchor; a failed GSAP import leaves a working board
    - _Requirements: 2.2, 2.7, 10.5, 10.7_

- [x] 12. Phase 7: MotionDirector, effects, Overlay_Layer, clock entry and Bat Burst (was task 7)
  - [x] 12.1 Implement the MotionDirector core (was 7.1)
    - `animation/constants.ts`, `director/types.ts`, `clock.ts` (injectable clock), `queue.ts`, `director.ts` with the admission rules in the design order: Reduce Motion, duplicate, compact, P3 gates, P0, P1, P2, queue drain, env changes, failure containment, watchdog by `maxDurationMs`
    - `test/fakeClock.ts` and fake effect helpers for later tests
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 10.9_

  - [x] 12.2 Implement burst paths and sprite strips (was 7.2)
    - `animation/paths/burstPlan.ts` (seeded, 5 to 7 flights, 3 when compact, stagger at most 130 ms, durations 500 to 900 ms), `cubic.ts`
    - `sprites/SpriteStrip.tsx` (an `<img>` inside an `overflow: hidden` frame moved with `transform: translateX`), `sprites/timing.ts` (`spriteTiming(n, fps)`), `styles/sprites.css` using `steps(var(--frames))`; Reduce Motion shows frame 0
    - _Requirements: 4.4, 3.4, 3.7, 20.1, 9.14_

  - [x] 12.3 Create the effect registry and the shared effects (was 7.3)
    - `effects/registry.ts` with the `EffectId` union holding every id of the design's registry table, and `EffectDef` entries with `priority`, `kind`, `maxDurationMs`, `settle` and a required `fallback` (fade at most 150 ms)
    - Implement now: `ui.reduce-motion-ack`, `focus.yield`, `hero.clock-entry` (580 ms), `bats.burst`, `bat.to-point`, `bat.travel`, `scroll.to`, `section.reaction`, `mascot.hover`, `idle.beat`, `ghost.look`, `bat.flyby`. The region effects are implemented in task 14 and added to the registry there
    - _Requirements: 9.1, 9.2, 10.4, 10.7, 10.8, 10.9, 5.1, 20.1, 4.6, 4.7, 27.2_

  - [x] 12.4 Integrate the director with React and the Overlay_Layer (was 7.4)
    - `animation/react/DirectorProvider.tsx` (wires `setEnv` for reduce motion, hidden tab, compact, form input focus and scrubber focus from the hook points of tasks 7.4 and 9.2; sets `data-ambient`), `useEffectTrigger.ts`, `useOnceOnEnter.ts` (IntersectionObserver threshold 0.35 with a per-region latch)
    - Extend `overlay/OverlayLayer.tsx` from task 11.3, add `overlay/BatPool.tsx` (caps 14 regular and 6 compact; each bat renders the flap strip when the manifest has one, else the pose or the placeholder bat) and `mascots/actors.ts` (actor registry)
    - _Requirements: 9.1, 9.8, 9.9, 9.11, 9.12, 4.6, 2.4_

  - [x] 12.5 Wire the clock entry, the submit Bat Burst and the click interactions (was 7.5)
    - The Clock hands sweep in once on load; the form submit requests `bats.burst` from the submit button (hook point from task 7.5) without delaying the draft, focus or scroll
    - A background click flies the Mini Bat to the point; a node or clock-stamp click sends it to the node; the Open-a-case mascots play their enter reactions once via `useOnceOnEnter`; ambient beats registered for them
    - _Requirements: 5.1, 20.1, 27.1, 27.3, 4.6, 2.4, 3.2_

  - [x] 12.6 Write property test for director preemption (was 7.6)
    - **Property 1: Director preemption by priority**
    - **Validates: Requirements 9.5, 9.6, 15.3**

  - [x] 12.7 Write property test for concurrency caps (was 7.7)
    - **Property 2: Director concurrency caps**
    - **Validates: Requirements 9.3, 9.4, 11.7, 15.3**

  - [x]* 12.8 Write property test for the P2 queue timeout (was 7.8)
    - **Property 3: P2 queue timeout**
    - **Validates: Requirements 9.7, 15.3**

  - [x] 12.9 Write property test for P3 gating and cooldown (was 7.9)
    - **Property 4: P3 gating and cooldown**
    - **Validates: Requirements 9.8, 9.9, 9.10, 15.3**

  - [x]* 12.10 Write property test for duplicate requests (was 7.10)
    - **Property 5: Duplicate requests do not double-run**
    - **Validates: Requirements 3.7, 20.1, 9.3**

  - [x] 12.11 Write property test for Reduce Motion fallback coverage (was 7.11)
    - Iterate the whole registry so the effects added in task 14 are covered automatically
    - **Property 6: Every effect has a bounded Reduce Motion fallback**
    - **Validates: Requirements 9.2, 10.4, 10.6, 10.7, 10.9, 15.5**

  - [x]* 12.12 Write property test for once-only region reactions (was 7.12)
    - **Property 7: Section reactions play once**
    - **Validates: Requirements 2.4, 3.11**

  - [x]* 12.13 Write property test for burst plan invariants (was 7.13)
    - **Property 19: Burst plan invariants**
    - **Validates: Requirements 3.4, 3.7, 20.1**

  - [x]* 12.14 Write property test for sprite timing (was 7.14)
    - **Property 20: Sprite timing**
    - **Validates: Requirements 4.4**

  - [ ]* 12.15 Write unit tests for the clock entry and the submit flow (was 7.15)
    - Clock entry duration is 580 ms (within 500 to 650); a valid submit creates the draft and moves focus before the burst finishes, and requests the burst from the submit button; in Reduce Motion the scroll uses `behavior: "auto"`; the overlay has `pointer-events: none`; no `gsap` import outside `src/animation/`
    - _Requirements: 5.1, 20.1, 20.10, 27.3, 9.11, 10.8_

- [ ] 13. Checkpoint - Director, clock and Bat Burst
  - Run `pnpm --dir frontend verify`. Ensure all tests pass, ask the user if questions arise. Ask the user to run `pnpm --dir frontend dev` with the toggle showing "Motion: on" (if Windows "Animation effects" is off, the board starts reduced and the toggle says so), reload to see the clock sweep, and submit a case to see the Bat Burst. Append a phase entry to `docs/kiro-usage.md`.

- [ ] 14. Phase 8: Signature moments in every region (was task 9, adapted)
  - [x] 14.1 Build the Lost Hour scene (was 9.1)
    - `animation/scroll/dstFrame.ts` (pure: clock label from progress, 01:58, 01:59, then 03:00, never 02:xx) and `setupScenes.ts` (CSS `position: sticky` wrapper of 160vh plus ScrollTrigger scrub for progress only, no pin-spacer)
    - Effects `clock.crack` (P1) and `problem.scatter` (P2, Mini Bats scatter from the gap); Mini Ghost looks at the gap; Reduce Motion shows side-by-side stamps with the crack drawn; the caption labels it an illustration (D18)
    - _Requirements: 3.3, 3.4, 9.12, 10.7, 16.4, 27.1_

  - [x] 14.2 Animate the case library: cards entering, draft created, case opening
    - Effects `cases.enter` (cards deal in along the thread), `case.draft-create` (the new card drops in and Skeleton Scribe's hand underlines its DOM label) and `case.open` (the case-file sheet unfolds) with the design's keys, durations and fallbacks; connect the hook points of tasks 7.5 and 8.3; state, focus and announcements never wait for them
    - _Requirements: 27.1, 27.2, 27.3, 10.7, 21.4, 20.1_

  - [x] 14.3 Animate the replay: actors, Mini Bat, crack and ladder rung (was 9.3, effects only)
    - Effect `replay.event` (P1): the current actor plays its pose; Spider Weaver draws the scrubber thread; Bat Scout perches at exploration events; Pumpkin Mechanic pulls his lever at clock events; the Mini Bat travels peg to peg (`bat.travel`); the Clock crack appears once at the anomaly event; `ladder.rung` stamps the newly reached rung; events by Wraith Director and Watchtower Warden show a small pose thumbnail on the event card
    - _Requirements: 7.1, 4.5, 27.1, 27.2, 9.8_

  - [x] 14.4 Animate the fixed-version pass and the Blind hunt reveal
    - Effect `replay.fixed-pass` (Jack flips to his fixed face, the version band turns over to the patched version, the "passes" stamp lands) and `replay.reveal` (the report card turns face up with the content swapped at the midpoint, then the match stamp lands), requested once per arrival at their events; scrubbing back shows the earlier state without animation; connect the hook point of task 9.3
    - _Requirements: 22.6, 23.3, 23.6, 27.1, 27.2, 10.7_

  - [x] 14.5 Animate Doctor Stitch stitching the diff in
    - Effect `stitch.sew` (P2 scene): the needle arm runs down the diff, added lines appear behind it (at most 12 animated), the SVG stitch line draws along the margin from the end of Spider Weaver's scrubber thread down to the Timeline_Thread; requested once per case selection when the fix sheet is in view; the full diff is in the DOM from the start; connect the hook point of task 9.5
    - _Requirements: 24.1, 27.1, 27.2, 10.7, 13.9, 4.10_

  - [ ] 14.6 Build the case proof interactions (was 9.4)
    - Raven unrolls the ladder on first view with the rungs stamping in 100 ms apart; Mummy Wrapper wraps the artifact hash tag; Two-Faced Jack flips between the browser face and the server face, swapping the caption text in the DOM; "No anomaly observed in tested cases" wording where a negative result appears
    - _Requirements: 3.9, 4.5, 8.1, 8.4, 8.6, 16.1_

  - [x] 14.7 Build the Investigation_Flow interaction (was 9.5)
    - Active step from the center-line crossing; effect `flow.step` plays each step's mascots' act pose and marks the step active with text and shape; the approve step also plays the Bat Burst; the fix step shows Doctor Stitch and Skeleton Scribe
    - _Requirements: 3.6, 3.7, 3.8, 11.10, 27.1_

  - [x] 14.8 Build the Crew roll-call and Tier 2 reactions (was 9.6)
    - Effect `crew.rollcall` (80 ms stagger over 14 mascots, at most 1.5 s, no stagger when compact); the six Tier 2 mascots are buttons whose hover, focus and Enter or Space play their own reaction (deny, hiss, bounce, wobble, flip, write); Tier 1 roster figures, Doctor Stitch included, react to hover only and are not tab stops
    - _Requirements: 3.5, 4.3, 4.7, 11.1, 2.4, 27.1_

  - [x] 14.9 Build the Closing Raven stamp and prompt (was 9.7)
    - Effect `raven.stamp` (P1) lands "Filed 06:58" on the Closing sheet with the stamp text in the DOM; Skeleton Scribe's hand underlines the "Open a case" prompt; the button scrolls to the Open-a-case panel and focuses the first field; Reduce Motion shows the stamp with a 120 ms fade and jumps without smooth scroll
    - _Requirements: 3.10, 3.11, 5.8, 10.7, 10.8, 27.1_

  - [x] 14.10 Animate the Version_Timeline milestones (new in R3)
    - Effect `timeline.milestone` (P1 micro, 500 ms, fallback: milestone marked reached with a 120 ms fade) added to the registry: when the current event becomes a replay milestone's event, the ring fills, the "reached" stamp lands and the thread segment up to it inks in; keyed by case id and milestone kind, once per arrival; scrubbing back shows the earlier state without animation; connect the hook point of task 9.6; the state text never waits for the effect
    - _Requirements: 28.6, 27.1, 27.2, 27.3, 10.7, 9.2_

  - [x]* 14.11 Write property test for the Lost Hour (was 9.12)
    - **Property 18: Lost Hour never shows 02:xx**
    - **Validates: Requirements 3.3**

  - [ ]* 14.12 Write component tests for the region effects (was 9.15, extended)
    - A valid submit requests `bats.burst` and `case.draft-create`; selecting a card requests `case.open` after the content has changed; arriving at the fixed-pass, reveal and milestone events requests their effects once per arrival; with Reduce Motion on each of these ends in its final state; Tier 2 buttons are the only extra tab stops in the Crew; the Flow has six steps and the approve burst request; the Closing button focuses the first form field; the Raven stamp text is DOM text
    - _Requirements: 3.6, 3.7, 3.11, 5.8, 11.1, 20.1, 21.4, 22.6, 23.3, 28.6, 27.2, 27.3_

- [ ] 15. Checkpoint - Animated board review
  - Run `pnpm --dir frontend verify`. Ensure all tests pass, ask the user if questions arise. Ask the user to run `pnpm --dir frontend dev` with motion on and review every signature moment with placeholder art: clock wake-up, submit Bat Burst and draft card, cards entering, case opening, Mini Ghost on the thread, the lost hour, replay bat and crack, ladder rung, fixed-version pass, Blind hunt reveal, Version_Timeline milestone stamps, Doctor Stitch stitching along the joined thread, roll-call and hovers, approve burst, Raven stamp. Append a phase entry to `docs/kiro-usage.md`.

- [ ] 16. Phase 9: Art pipeline tools and Asset_QA_Page (was task 11)
  - [ ] 16.1 Create the art catalogue and Python test setup (was 11.1)
    - Update `tools/art/style_bible.txt` to v2 (hand-inked, cel-painted, Crooked Cartoon Mischief, no baked text, no collage, no neon glow; the background sentence moves to the route sentences of `codex_gen.py`); create `tools/art/assets.spec.json` (every mascot including Doctor Stitch, part, pose, scenery item, wordmark and ledge mask with single-subject line, route, canvas, display width, pivot, `group`, `allowMulti`, fallback pose)
    - `tools/art/requirements.txt` or `pyproject.toml` (Pillow, numpy, pytest, Hypothesis); pytest tests live in `tests/art/`; folders `frontend/assets/{masters,cutouts,frames,scenery,effects,manifests,qa}`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 16.2 Implement the Cutout_Script (was 11.2)
    - `tools/art/cutout.py` with Pillow and numpy. Alpha route (default): snap alpha >= 240 to 255, zero alpha <= 8 and drop tiny stray components, trim with a 2 px margin (union bbox for groups), place on the 1024 x 1024 master canvas with a shared scale per group and record origin and scale, LANCZOS resize on premultiplied alpha, PNG and WebP export at most 300 KB
    - Key route (backup): the existing key estimate, YCbCr soft matte, border-connected removal, edge-only despill, then the same trim, place, resize and export
    - QA reasons (`corners-opaque`, `no-transparency`, `empty`, `fringe` on the key route only, `alpha-flat`, `multi-component`, `too-large`, `background-not-flat`), atomic manifest write with path, pixel size, pivot, route, status and reasons
    - _Requirements: 13.5, 13.6, 13.4, 18.1_

  - [ ] 16.3 Implement the QA checker and the flap strip builder (was 11.3)
    - `tools/art/qa_check.py` re-checks files on disk, writes light, dark and checker contact sheets to `frontend/assets/qa/`, prints one summary line per asset
    - `tools/art/make_flap_strip.py` composes the six-frame Mini Bat strip from body and wing parts (used in task 19.1); `pnpm art:cutout` and `art:qa` scripts call these tools
    - _Requirements: 13.5, 13.7, 4.4_

  - [ ] 16.4 Implement the Codex generator wrapper and fallback ladder (was 11.4)
    - `tools/art/codex_gen.py --id <mascot>/<part>`: compose the prompt from the Style_Bible, the route sentence (alpha by default, key only on the one retry after an opaque result, never both) and the catalogue line (attach the approved pose with `-i` for later parts); run `codex.cmd exec --json`, read `thread_id`, copy the PNG from `~/.codex/generated_images/<thread_id>/` to `masters/<mascot>/<part>-vNN.png` (never overwrite), append to `masters/_runs.jsonl`, run cutout and QA, retry at most 2 times with the failure reason added, then record `fail` with the fallback pose and continue
    - Fallback levels from `docs/tool-check.md` (level 0 recorded): placeholder art stays in use, `source: "manual"` masters go through the same cutout path
    - _Requirements: 13.1, 13.4, 13.12, 14.2, 14.5_

  - [ ] 16.5 Build the Asset_QA_Page (was 11.5)
    - `qa/AssetQaPage.tsx` loaded only behind `import.meta.env.DEV` and the `?qa` query via dynamic import (absent from the production bundle, one route remains); lists every manifest and catalogue entry on light, dark and checker backgrounds with size, bytes, pivot, route, status and reasons; plays the flap strip at 12 fps when it exists; assembles rigs at wing angles 0, ±25, ±60; manual checklist
    - _Requirements: 13.7, 1.1, 4.4_

  - [ ] 16.6 Write property test for cutout alpha quality (was 11.6)
    - pytest and Hypothesis with synthetic subjects on a transparent canvas (soft interior alpha 251 to 253, faint far haze, 2:1 canvas) and on a flat key
    - **Property 22: Cutout produces clean alpha**
    - **Validates: Requirements 13.5**

  - [ ]* 16.7 Write property test for defect rejection (was 11.7)
    - **Property 23: Cutout rejects defective results**
    - **Validates: Requirements 13.6**

  - [ ]* 16.8 Write property test for manifest validity (was 11.8)
    - Run against fixture manifests now; rerun against the real manifest in task 19.6
    - **Property 24: Manifest validity**
    - **Validates: Requirements 13.4, 13.5, 18.1**

  - [ ]* 16.9 Write unit tests for prompt composition, strip builder and QA page (was 11.9)
    - pytest for prompt composition (one route sentence only) and the retry limit; flap strip frame count and size; Vitest for the QA page listing and its absence from the production entry
    - _Requirements: 13.1, 13.12, 4.4, 13.7_

- [ ] 17. Pilot_Pack generation: full poses of Mini Bat, Wraith Director and Doctor Stitch (was task 12)
  - [ ] 17.1 Generate the Pilot_Pack (was 12.1)
    - The three poses were already generated on 2026-11-10 and passed QA (`docs/tool-check.md`, "Pilot pack generation": masters `mini-bat/pose-rest-v01`, `wraith-director/pose-v01`, `doctor-stitch/pose-v01`). Do not regenerate them. What remains: copy the three results into `docs/asset-log.md`, record in `prompt-template.md` that the canvas size varies with the subject, and decide the dark-background rim noted in the style review
    - Original scope, for history: `/generate-mascot-asset` or `codex_gen.py` for three full poses only, one subject per request, transparent route; keep every master; check square canvas and `-i` scale; tune the alpha-route constants on these three
    - Generate nothing else (no rig parts, no wings, no other mascots); if Codex becomes unavailable keep placeholders and say so in `docs/asset-log.md`
    - _Requirements: 13.8, 13.1, 13.4, 13.12, 14.2_

  - [ ] 17.2 Wire the Pilot_Pack poses into the board (was 12.2, poses only)
    - `Art` resolves the three poses from the manifest (level 1, pose-only whole-body transforms): Wraith Director in the Open-a-case panel, Doctor Stitch on the fix sheet, in the Crew and on the Flow fix step, the Mini Bat pose in the bat pool until the flap strip exists; fix the relative scale so the Wraith reads as the tallest figure (style review); the QA page shows all three
    - _Requirements: 4.8, 13.8, 9.14, 18.3_

- [ ] 18. Checkpoint - Pilot_Pack approval (stop here) (was task 13)
  - Run `pnpm --dir frontend verify` and `python -m pytest tests/art -q`. Ensure all tests pass, ask the user if questions arise. Report how many images have been generated so far (2 in the tool check plus 3 pilot poses) and the remaining quota estimate (about 43 more base generations for rig parts, the other eleven mascots and scenery, budget about 70 with retries). Show the user the Pilot_Pack in `?qa`, the Open-a-case panel and the Case view. Do not generate rig parts or other mascots until the user approves the style. If the user requests changes, adjust the Style_Bible and regenerate only the Pilot_Pack (max 2 retries per asset). Append a phase entry to `docs/kiro-usage.md`.
  - _Requirements: 13.8_

- [ ] 19. Phase 10: Rig parts, remaining cast, scenery and art wiring (after approval) (was task 14)
  - [ ] 19.1 Generate rig parts for the Pilot_Pack mascots and build their rigs (from old 12.1 and 12.2)
    - Mini Bat body and wings, then the six-frame flap strip with `make_flap_strip.py`; Wraith Director parts; Doctor Stitch body (with the spool hand), needle arm and eyes; each part attached to its approved pose with `-i`
    - `mascots/rig/Rig.tsx` (at most 6 parts, 5 poses, transforms only) and rig specs `rig/specs/miniBat.ts`, `wraithDirector.ts`, `doctorStitch.ts` (poses rest, read, stitch, bow, wiggle); the flap strip is used by the burst
    - _Requirements: 4.2, 4.4, 13.13, 13.1, 13.4, 9.14_

  - [ ] 19.2 Generate and rig the remaining Tier 1 mascots (was 14.1)
    - Watchtower Warden, Bat Scout, Pumpkin Mechanic, Raven Archivist, Mini Ghost: generate parts with `codex_gen.py` one subject per request, add rig specs under `mascots/rig/specs/`, record fallbacks for any asset still failing after 2 regenerations
    - _Requirements: 4.2, 13.1, 13.4, 13.12_

  - [ ] 19.3 Generate the Tier 2 poses (was 14.2)
    - Gargoyle Gatekeeper, Cauldron Cat, Spider Weaver, Mummy Wrapper, Two-Faced Jack (two face poses, affected and fixed), Skeleton Scribe (hand only): one hero pose each; hover reactions are transforms of that pose; `mascots/tier2/PoseMascot.tsx` and `mascots/tier2/config.ts`; Ghost squash and stretch stay CSS transforms
    - _Requirements: 4.3, 13.1, 13.4, 13.12_

  - [ ] 19.4 Generate scenery and brand art (was 14.3)
    - Painted Clock face (no baked text, hands stay SVG), hand-lettered TimeWraith wordmark, clocktower and parchment scenery, foreground ledge mask; process through the cutout path or as opaque scenery as specified in the catalogue
    - _Requirements: 13.9, 13.10, 13.11, 12.6, 11.5_

  - [ ] 19.5 Wire the real art into the board (was 14.4)
    - Replace placeholders through `Art` and the manifest in all regions; painted Clock face with SVG hands; wordmark with accessible name "TimeWraith" in the App_Header and the Open-a-case panel; real ledge mask in `LedgeLayer`; Open-a-case art `fetchpriority="low"`, art below it lazy; `width` and `height` on every image; README placeholder list updated for any mascot still on a fallback
    - _Requirements: 4.2, 4.3, 4.8, 4.9, 12.6, 13.10, 13.11, 18.2, 18.3, 18.5_

  - [ ] 19.6 Run asset QA over all assets and recheck manifest validity (was 14.5)
    - Run `qa_check.py` for every asset and update the contact sheets; rerun the Property 24 test against the real manifest
    - **Property 24: Manifest validity**
    - **Validates: Requirements 13.4, 13.5, 18.1**

  - [ ]* 19.7 Re-run image and art-resolution properties on the real manifest (was 14.6)
    - Re-run Property 25 and Property 21 tests with the real manifest loaded; confirm Property 6 still covers the full registry
    - **Property 25: Images are accessible and reserve space**
    - **Validates: Requirements 11.4, 12.6, 18.2, 18.3**

  - [ ]* 19.8 Write component tests for real-art wiring (was 14.7)
    - A `fail` manifest entry renders the pose or placeholder, never omits the mascot; the wordmark has the accessible name "TimeWraith"; Clock hands remain SVG over the painted face; no text baked into an image is relied on for meaning
    - _Requirements: 4.8, 12.6, 13.9, 13.10, 11.5_

- [ ] 20. Checkpoint - Full cast (was task 15)
  - Run `pnpm --dir frontend verify` and the pytest suite. Ensure all tests pass, ask the user if questions arise. Append a phase entry to `docs/kiro-usage.md`.

- [ ] 21. Phase 11: Performance, end-to-end checks, Lighthouse and screenshots (was task 16)
  - [ ] 21.1 Performance polish and tooling configuration (was 16.1)
    - Install `@playwright/test`, `@axe-core/playwright` and `@lhci/cli` as dev dependencies, and the Playwright Chromium browser
    - `vite.config.ts` chunking so the initial JS stays within about 200 KB gzip (GSAP dynamic import after first paint, QA page excluded); `playwright.config.ts`; `lighthouserc.json` from the design (accessibility at least 0.95 and performance at least 0.80 as errors, CLS at most 0.1, FCP and LCP warnings, desktop preset, 3 runs, filesystem upload to `docs/reports/lighthouse`); scripts `lh`, `shots`, `e2e`, `perf:fps` (local frame-rate sampler that warns below 50 fps)
    - _Requirements: 15.7, 15.8, 18.1, 18.3, 18.4, 18.5_

  - [ ] 21.2 Write Playwright end-to-end tests (was 16.2, extended)
    - One route and no requests to a backend or to any URL entered in the form; node and clock-stamp navigation; full keyboard pass with visible focus, including completing the form; submit creates a draft card that survives a reload; selecting both sample cases and scrubbing; the Blind hunt reveal hides the issue until its event, in the replay and in the Version_Timeline; checklist and badge label placement at every width; no horizontal scroll at 360, 768, 1024, 1440 and 1920 px; layout-shift observer across a full scroll at most 0.02 target and 0.1 limit; `@axe-core/playwright` has no serious violations
    - Animation check: with Reduce Motion off, the clock hand, a burst bat and the case sheet change their computed transform or opacity between two samples about 120 ms apart; with Reduce Motion on they show the final state at once
    - _Requirements: 1.1, 1.3, 2.7, 6.4, 6.5, 11.1, 11.2, 11.6, 18.3, 20.4, 20.5, 21.4, 23.2, 28.8, 27.4_

  - [ ] 21.3 Run Lighthouse and fix findings (was 16.3)
    - Run `pnpm --dir frontend build` then `lhci autorun` (set `CHROME_PATH` to the Chrome found in task 1.2 or the Playwright Chromium if needed); fix accessibility, performance and CLS issues until accessibility is at least 95 and performance is at least 80 in the desktop profile; keep reports in `docs/reports/lighthouse`; run `pnpm --dir frontend perf:fps` and record the result
    - _Requirements: 15.7, 15.8, 18.3, 18.4, 18.5_

  - [ ] 21.4 Capture screenshots at 360, 768 and 1440 px (was 16.4)
    - Playwright in Reduce Motion mode saves full-page and per-region screenshots to `docs/screenshots/` at 360, 768 and 1440 px width (reuse the existing shots tool); run the `run-landing-qa` skill and write `docs/reports/summary.md` with scores and thresholds; fix visible layout defects found
    - _Requirements: 15.7, 11.6, 11.7_

- [ ] 22. Release documents (was task 17)
  - [ ] 22.1 Write the README with the Kiro-usage write-up (was 17.1)
    - Use the `write-kiro-usage-readme` skill: project summary with the positioning line, the hackathon categories (state Costume Contest as the lead for the UI and pitch the other two as supporting angles: Frankenstein, a Crew of agents with Doctor Stitch the patch-maker stitched to Playwright clock control, a sandbox runner and a version comparator; Resurrection, old date-boundary bugs from public issue trackers such as FullCalendar #7998 and Cal.com #30021 revived as reproducible evidence on pinned versions), setup commands, asset pipeline commands, test commands (`pnpm --dir frontend verify`, `test:run`, `e2e`, `lh`, `shots`, pytest), the repository layout matching the design, which assets are placeholders if any, mock-data and honesty notes (both reports are third-party references, not new findings; the Cal.com replay and its Blind benchmark are illustrative, not a real Crew run; suggested fixes are not verified; drafts are not run), the agent mapping of the pitch (Explorer = Bat Scout, Time Experimenter = Pumpkin Mechanic, Verification = Raven Archivist, plus Doctor Stitch, Wraith Director and Watchtower Warden), v1 scope (date and time bugs only; a general bug hunter in the style of CodeRabbit named only as a later direction), and a Kiro-usage section citing real specs, steering, hooks, skills and dated evidence from `docs/kiro-usage.md`
    - Devpost may require choosing one primary category, so re-read the 2026 rules first to confirm whether multiple categories are allowed. If they are not, keep Costume Contest as the single entered category and keep the other two as supporting angles in the text only
    - Also write the Devpost write-up notes (`docs/devpost-notes.md`) recording all three angles, with Costume Contest as the lead for the UI
    - _Requirements: 17.4, 17.5, 17.7, 17.8, 17.6, 16.5, 16.6, 16.11, 1.7_

  - [ ] 22.2 Add the open-source LICENSE chosen by the user (was 17.2)
    - Ask the user which OSI-approved open-source license to use; do not assume MIT. The hackathon needs an OSI-approved open-source license that is visible in the repository About section, so this choice cannot be skipped before submission
    - Add the chosen `LICENSE` file at the repository root, mention it in the README, and tell the user to confirm that GitHub shows the license in the About section after the first push
    - _Requirements: 17.3_

  - [ ] 22.3 Swap the placeholder links once the repository and video exist (was 17.3)
    - Suggested values (design decision D11, to be confirmed by the user): GitHub is a public repository named `timewraith` (`https://github.com/<user>/timewraith`); the demo is an unlisted YouTube video of about 3 minutes, optionally with a live deploy of the static build on Cloudflare Pages or Vercel
    - Ask the user for the final GitHub and demo URLs; update `config/links.ts` with them and set `placeholder: false` for both; update the README links and rerun `pnpm --dir frontend verify`. Keep the Placeholder_Links until the user supplies final values
    - _Requirements: 5.7_

- [ ] 23. Final checkpoint (was task 18)
  - Run `pnpm --dir frontend verify`, the pytest suite, the Playwright tests (including the animation check) and confirm the Lighthouse thresholds, screenshots, README (with the lead category and the two supporting angles), the user-chosen LICENSE, the final links in `config/links.ts` (or the Placeholder_Links, if the user has not supplied them) and the `.kiro` directory are present. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Required tests: 3.9 (done), 7.6 and 7.7 (form validation, draft storage), 9.7, 9.8 and 9.9 (replay clamp, replay stepping, reveal honesty; renumbered from 9.6 to 9.8 when R3 inserted the Version_Timeline task 9.6), 11.4 (thread geometry), 12.6, 12.7, 12.9 and 12.11 (director priority, caps, cooldown, Reduce Motion coverage), 16.6 (cutout alpha), 19.6 (manifest validity) and 21.2 (end-to-end, including the animation check). That is 14 including the finished 3.9, close to the user's "about a dozen key tests". Phases 2 and 8 have no required test of their own: phase 2 updates the existing component tests inside task 5.5 so `verify` passes, and phase 8 is covered by Property 6 (12.11, which iterates the whole registry) and the animation check in 21.2.
- Build first, then test: each phase's build sub-tasks come before its test sub-tasks, so the board can be seen first and tested afterwards. Region effects are wired in phase 8 through hook points left in phases 3 to 5, so the case features work without animation first and gain their effects without rework.
- OpenCode: `docs/tool-check.md` (task 1.2) allows delegating four tasks under their old ids. Under the new ids they are 12.2 (was 7.2, sprite components), 16.2 (was 11.2, Cutout_Script), 16.5 (was 11.5, Asset_QA_Page) and 19.1 (the rig components, which were in old 12.2). The primary agent reviews each delegated result before the task is marked done.
- Property tests are tagged `Feature: timewraith, Property N: <title>` and run at least 100 times; each property from the design has its own sub-task (Properties 6, 12, 21, 24 and 25 are re-run in later phases as the registry, copy and manifest grow). Properties 13, 14, 15, 21, 25 and 26 are covered by the phase 1 tasks 3.8 to 3.14.
- Placeholder art keeps the board buildable at every step; the build never depends on a particular image existing.
- Task 18 is a hard stop: rig parts and the remaining eleven mascots are generated only after the user approves the three Pilot_Pack poses (already generated on 2026-11-10, D22).
- Each checkpoint appends a short entry to `docs/kiro-usage.md` so the README write-up is backed by real history.
- Lighthouse, Playwright screenshots, the README and the LICENSE are release deliverables and are not optional. The user chooses the license at task 22.2.
- Hackathon categories: Costume Contest leads, with Frankenstein and Resurrection as supporting angles. Task 22.1 re-reads the 2026 rules because Devpost may require one primary category.
- Id map for the Case Board re-plan (tasks 1 to 4 unchanged): old 5 → 11 (5.1 to 5.6 → 11.1 to 11.6); old 6 (checkpoint) → merged into 13; old 7 → 12 (7.1 to 7.15 → 12.1 to 12.15); old 8 → 13; old 9 → 9 and 14 (9.1 → 14.1; 9.2 → 9.1; 9.3 → 9.2 for the UI and 14.3 for the effects; 9.4 → 9.4 for the content and 14.6 for the effects; 9.5 → 14.7; 9.6 → 14.8; 9.7 → 14.9; 9.8 → 9.6; 9.9 → 9.7; 9.10 → 9.11; 9.11 → 8.4; 9.12 → 14.10; 9.13 → 9.12; 9.14 → 9.13; 9.15 → 14.11); old 10 → 15; old 11 → 16 (11.1 to 11.9 → 16.1 to 16.9); old 12 → 17 (12.1 → 17.1 for poses and 19.1 for parts; 12.2 → 17.2 for poses and 19.1 for rigs); old 13 → 18; old 14 → 19 (14.1 to 14.7 → 19.2 to 19.8); old 15 → 20; old 16 → 21; old 17 → 22; old 18 → 23. New: 5, 6, 7, 8, 9.3, 9.5, 9.8 to 9.10, 10, 14.2, 14.4, 14.5.
- R3 follow-up (v1 direction, design D21 to D23; no completed task changed): new 9.6 (Version_Timeline data and component), 9.15* (Property 34) and 9.16* (Property 35), 14.10 (`timeline.milestone` effect). Renumbered: 9.6 to 9.13 → 9.7 to 9.14, 14.10 → 14.11, 14.11 → 14.12. Changed: 9.5 and 14.5 (Doctor Stitch's stitch line joins Spider Weaver's thread and the Timeline_Thread), 17.1 and 17.2 (the three Pilot_Pack poses already exist; what remains is logging, the dark-background rim and relative scale), 21.2 and 22.1.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5", "3.1"] },
    { "id": 3, "tasks": ["2.6", "3.2", "3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5"] },
    { "id": 5, "tasks": ["3.6"] },
    { "id": 6, "tasks": ["3.7"] },
    { "id": 7, "tasks": ["3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15"] },
    { "id": 8, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 9, "tasks": ["5.4"] },
    { "id": 10, "tasks": ["5.5"] },
    { "id": 11, "tasks": ["5.6"] },
    { "id": 12, "tasks": ["7.1"] },
    { "id": 13, "tasks": ["7.2", "7.3"] },
    { "id": 14, "tasks": ["7.4"] },
    { "id": 15, "tasks": ["7.5"] },
    { "id": 16, "tasks": ["7.6", "7.7", "7.8"] },
    { "id": 17, "tasks": ["8.1"] },
    { "id": 18, "tasks": ["8.2", "8.3"] },
    { "id": 19, "tasks": ["8.4", "8.5", "8.6"] },
    { "id": 20, "tasks": ["9.1"] },
    { "id": 21, "tasks": ["9.2"] },
    { "id": 22, "tasks": ["9.3", "9.4"] },
    { "id": 23, "tasks": ["9.5", "9.6"] },
    { "id": 24, "tasks": ["9.7", "9.8", "9.9", "9.10", "9.11", "9.12", "9.13", "9.14", "9.15", "9.16"] },
    { "id": 25, "tasks": ["11.1"] },
    { "id": 26, "tasks": ["11.2"] },
    { "id": 27, "tasks": ["11.3"] },
    { "id": 28, "tasks": ["11.4", "11.5", "11.6"] },
    { "id": 29, "tasks": ["12.1", "12.2"] },
    { "id": 30, "tasks": ["12.3"] },
    { "id": 31, "tasks": ["12.4"] },
    { "id": 32, "tasks": ["12.5"] },
    { "id": 33, "tasks": ["12.6", "12.7", "12.8", "12.9", "12.10", "12.11", "12.12", "12.13", "12.14", "12.15"] },
    { "id": 34, "tasks": ["14.1", "14.2"] },
    { "id": 35, "tasks": ["14.3"] },
    { "id": 36, "tasks": ["14.4", "14.5"] },
    { "id": 37, "tasks": ["14.6", "14.7"] },
    { "id": 38, "tasks": ["14.8", "14.9", "14.10"] },
    { "id": 39, "tasks": ["14.11", "14.12"] },
    { "id": 40, "tasks": ["16.1"] },
    { "id": 41, "tasks": ["16.2"] },
    { "id": 42, "tasks": ["16.3", "16.5"] },
    { "id": 43, "tasks": ["16.4"] },
    { "id": 44, "tasks": ["16.6", "16.7", "16.8", "16.9"] },
    { "id": 45, "tasks": ["17.1"] },
    { "id": 46, "tasks": ["17.2"] },
    { "id": 47, "tasks": ["19.1"] },
    { "id": 48, "tasks": ["19.2"] },
    { "id": 49, "tasks": ["19.3"] },
    { "id": 50, "tasks": ["19.4"] },
    { "id": 51, "tasks": ["19.5"] },
    { "id": 52, "tasks": ["19.6", "19.7", "19.8"] },
    { "id": 53, "tasks": ["21.1"] },
    { "id": 54, "tasks": ["21.2"] },
    { "id": 55, "tasks": ["21.3"] },
    { "id": 56, "tasks": ["21.4"] },
    { "id": 57, "tasks": ["22.1", "22.2"] },
    { "id": 58, "tasks": ["22.3"] }
  ]
}
```
