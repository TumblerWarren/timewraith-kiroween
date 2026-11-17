# Kiro usage log

Dated evidence of how Kiro specs, steering, hooks and skills were used to build TimeWraith. The README write-up (task 17.1, skill `write-kiro-usage-readme`) cites this file, so every entry points to a real file, hook id or task id. Append new entries at the end; never rewrite earlier ones.

## Entry template
```
### YYYY-MM-DD - <short title>
- Kiro feature: <spec | steering | hook | skill | PostTaskExec | ...>
- What it caught or did: <one or two sentences, concrete>
- File reference: <path, hook id or task id>
```

## Entries

### 2026-11-10 - Workspace setup, and the tool check that overturned a design assumption
- Kiro feature: spec (tasks 1.1 and 2.1 to 2.4), steering, hook helper scripts, skills
- What it caught or did: Task 1.1 ran the Codex image tool before any art was generated. The design assumed Codex cannot produce transparent PNGs (openai/codex #18905) and planned a magenta chroma-key pipeline. The run showed the opposite on codex-cli 0.163.0: asking for a transparent background makes Codex call `image_gen` with `transparent_background: true` and return a clean RGBA PNG. It also found that outputs are 1774 x 887 rather than square, so the cutout script became a trimmer and cleaner (snap alpha >= 240 to 255, zero alpha <= 8 away from the subject, place on a 1024 x 1024 canvas), and magenta key became the backup. The `generate-mascot-asset` skill, its prompt template and the `asset-pipeline` steering file now record that route.
  The same setup created nine steering files (four always-on, three `fileMatch`, one `auto`, one `manual`), the hook helper scripts and the style guard, and four workspace skills: `generate-mascot-asset`, `add-motion-effect`, `run-landing-qa` and `write-kiro-usage-readme`. The hook definitions in `.kiro/hooks/` are written by task 2.3, and whether Kiro discovers `.kiro/skills/` is checked in task 2.5.
- File reference: `docs/tool-check.md`, `.kiro/steering/`, `scripts/hooks/`, `scripts/check-style-guard.mjs`, `.kiro/skills/*/SKILL.md`, `.kiro/skills/generate-mascot-asset/references/prompt-template.md`

### 2026-11-10 - Hook event schema pinned from real events (task 2.5)
- Kiro feature: hook (`debug-hook-event` with `scripts/hooks/dump-event.mjs`), steering
- What it caught or did: The Kiro docs do not list the STDIN JSON for hooks, so the helper scripts were written to accept many field names. I enabled `.kiro/hooks/debug-hook-event.json` once and captured real events. The hook took effect in the running session; no restart was needed, and it also fired for a file saved by the parallel task 3.1 session. For `PreToolUse` and `PostToolUse` I temporarily added two more dump entries (matcher `shell`) to the same hook file, then restored the file with only the `PostFileSave` entry and `enabled: false`. The captured events:

  `PostFileSave` (all fields; `file_path` is an absolute Windows path):
  ```json
  {"session_id":"sess_8d3d986d-6d82-48c4-9762-b20aa0ad02bc","hook_event_name":"PostFileSave","cwd":"f:\\Projects\\kiroween-26","file_path":"f:\\Projects\\kiroween-26\\docs\\_hook-probe.txt"}
  ```
  `PreToolUse` with matcher `shell` (the shell tool is named `execute_pwsh`; `description`, `cwd` and `timeout` can be `null`):
  ```json
  {"session_id":"sess_8d3d986d-6d82-48c4-9762-b20aa0ad02bc","hook_event_name":"PreToolUse","cwd":"f:\\Projects\\kiroween-26","tool_name":"execute_pwsh","tool_input":{"command":"Write-Output \"hook-probe shell call\"","description":"Run one harmless shell call for hook capture","cwd":null,"run_in_background":false,"timeout":null}}
  ```
  `PostToolUse` with matcher `shell` (same fields plus `tool_response`, a single string that starts with `Output:` and ends with `Exit Code: N`):
  ```json
  {"session_id":"sess_8d3d986d-6d82-48c4-9762-b20aa0ad02bc","hook_event_name":"PostToolUse","cwd":"f:\\Projects\\kiroween-26","tool_name":"execute_pwsh","tool_input":{"command":"Write-Output \"hook-probe shell call\"","description":"Run one harmless shell call for hook capture","cwd":null,"run_in_background":false,"timeout":null},"tool_response":"Output:\nhook-probe shell call\n\nExit Code: 0"}
  ```
  Result: the names the helpers already tried first (`file_path`, `tool_input.command`) are the real ones, so `eventPath` and `eventCommand` in `scripts/hooks/read-event.mjs` needed no logic change. I recorded the pinned schema in its header comment and kept the other names as a fallback. The dump also showed that the environment has `KIRO_SESSION_ID` and `VSCODE_IPC_HOOK`, that `argv` passes through, and that hooks run with `cwd` set to the project root. `.kiro/hook-events/` was deleted after quoting it here, and the debug hook is disabled again.
- File reference: `.kiro/hooks/debug-hook-event.json`, `scripts/hooks/dump-event.mjs`, `scripts/hooks/read-event.mjs`

### 2026-11-10 - Skill discovery and open research items checked (task 2.5)
- Kiro feature: skills, steering, spec research findings
- What it caught or did:
  - **`.kiro/skills/` discovery: confirmed.** The agent session lists `add-motion-effect`, `generate-mascot-asset`, `run-landing-qa` and `write-kiro-usage-readme` as available skills with their `description` text, and activating `generate-mascot-asset` returned the `SKILL.md` body and resolved its `references/` folder. The `manual` steering fallbacks planned for the "unconfirmed" case were therefore not added. Not tested: typing `/generate-mascot-asset` in the chat UI by hand.
  - **GSAP licensing: confirmed free.** [gsap.com/pricing](https://gsap.com/pricing/) states that GSAP is 100% free for all users thanks to Webflow, and the [GSAP repository](https://github.com/greensock/gsap) says the same for the former Club plugins, with commercial use allowed. The installed `gsap@3.15.1` from the public npm registry carries the "Standard 'no charge' license" (https://gsap.com/standard-license) and ships `ScrollTrigger.js`; `@gsap/react@2.1.2` installed from the public registry and points to the same license. No private registry or token is needed (requirement 9.12).
  - **KiroCrew link: resolves.** `https://github.com/kirodotdev/KiroCrew` loads (HTTP fetch on 2026-11-10) and describes Kiro Crew as an open source, persistent development workspace that runs locally or remotely and continues work beyond one session. Task 3.3 can use it in `config/links.ts` as written; no replacement link was needed.
- File reference: `.kiro/skills/*/SKILL.md`, `frontend/package.json` dependencies (`gsap`, `@gsap/react`), task 3.3 (`config/links.ts`)

### 2026-11-10 - Visual revision R2: night-heavy page and new type

> Superseded. The tower, walnut, moon and paper palette was replaced by the Violet Midnight theme. `paper.css` and `sections/*.css` named below no longer exist, and `layout.css` has been restyled. The current tokens are in `frontend/src/styles/tokens.css` and are described in [design-system.md](design-system.md). The entry records what was done on that date.
- Kiro feature: steering (`tech`, `design-tokens-copy`), property test (Property 14, `contrast.test.ts`), style guard, skill-style screenshot pass (`scripts/shots.mjs`)
- What it caught or did: R2 replaced Fraunces and Instrument Sans with IM Fell English (headings, weight 400 only, `font-synthesis: none`) and Libre Franklin (UI and body, 17 px, line-height 1.6), and moved cream from whole sections onto paper objects: hero, problem, flow and replay are tower-950, crew and proof walnut-700, final and footer moon-200. The contrast property test parses every theme in `layout.css`, so moving Flow from moon-200 to tower-950 and Proof to walnut-700 was checked against the allowed pairs on each run; it stayed green. Two boundary rows were added for colours that now sit on walnut-700: gold-500 (3.43, trim only) and mist-300 (4.71, computed for the zero-blur figure rim). Neither may be used as text. The screenshot pass at 1440 and 390 px found ink outlines that disappeared on walnut-700 in Crew and Proof, so those figures got the same mist-300 rim as Flow, and the Flow signboards got a 6 px gold trim because the deckled edge clipped most of the 3 px trim. It also found two `font-style: italic` rules in the UI face, which only has the roman file loaded, and removed them. No horizontal overflow at either width.
- File reference: `frontend/src/styles/{tokens,fonts,layout,paper}.css`, `frontend/src/styles/sections/{crew,flow,proof,replay}.css`, `frontend/src/styles/__tests__/contrast-pairs.ts`, `frontend/vite.config.ts`, `.kiro/steering/tech.md`, `.kiro/steering/design-tokens-copy.md`, `docs/reports/shots/r2/`
### 2026-11-11 - Version_Timeline (R3, D21), reveal-honesty test and the `timeline.milestone` effect (tasks 9.6, 9.9, 9.15, 9.16, 14.10)
- Kiro feature: spec (requirements 28, design D21, Properties 31, 34, 35), property tests (fast-check), steering (`motion-rules`, `design-tokens-copy`), `tasks.md` audit
- What it caught or did: Two earlier sessions were interrupted, so `tasks.md` ticked nothing that already existed. I audited tasks 9 and 14 against the code and tests first and ticked only what was present and tested (replay logic, two-track lab, reveal panel, case view, suggested fix, region effects). The Version_Timeline was missing, so I built it from the design: `MILESTONE_ORDER` and `VersionMilestone` on `SampleCase`, the pure `timelineView(case, index)`, the `validateStream` timeline rules, `VersionTimeline.tsx` above the replay, and the effect `timeline.milestone` (P1, 500 ms, 120 ms fade under Reduce Motion). Dates were rechecked before writing them: GitHub's issue API gave 2025-09-12 for FullCalendar #7998 and 2026-08-21 for Cal.com #30021 (both still open), and the npm registry gave 2023-11-29 for `@fullcalendar/core` 6.1.10.
  The reveal-honesty test (Property 31) scans text and every attribute of the Cal.com Case view at each index before e12, scrubbing included. It caught a real leak: the Case_Card used the case id (`case-card-calcom-30021`) as a DOM id and in `aria-labelledby`. The card now uses `useId`. The case id is still in `data-case` and `data-case-id` hooks, so the test excludes those two attributes; that remains a known gap. `motion-check` gained check 14 (scrub Cal.com to e11 and see the milestone become reached, 3 of 3 parts animated), now 16/16.
- File reference: `frontend/src/cases/view/{timeline.ts,VersionTimeline.tsx,__tests__/timeline.test.tsx}`, `frontend/src/animation/effects/timeline-milestone.ts`, `frontend/src/replay/validateStream.ts`, `frontend/scripts/{motion-check,timeline-shots}.mjs`, `docs/reports/shots/case-timeline/`
