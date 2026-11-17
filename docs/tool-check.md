# Tool check

## Verdict (Task 1.1)

- **Fallback level: 0. Codex works.** `codex.cmd exec` ran non-interactively twice, the built-in `image_gen` tool was invoked both times, and each run wrote a PNG that was copied into the workspace. No quota or authentication error occurred.
- **Recommended generation route: transparent alpha.** Run A returned a real RGBA PNG with true transparent pixels and clean edges (no halo, no magenta fringe, no matte). The design's assumption (openai/codex #18905) that Codex cannot make alpha is **not true on codex-cli 0.163.0**: the `image_gen` tool has a `transparent_background` option and Codex sets it from the prompt wording.
- **Cutout_Script is still needed, but only as a trimmer and cleaner**, not as a background remover. Four things to handle:
  1. The subject is not fully opaque. About 99% of subject pixels have alpha 251 to 253 and only 0.06% of the canvas is 255. Snap alpha >= 240 to 255.
  2. A faint haze of alpha 1 to 2 sits up to hundreds of pixels from the subject (about 0.1% of the canvas). Zero alpha <= 8 away from the subject.
  3. Output is **1774 x 887** (2:1), not the 1024 x 1024 the design assumed. Codex chose the size; the tool call has no size argument. Trim to the alpha bounding box and place on the 1024 x 1024 master canvas.
  4. RGB under alpha 0 is black, so resize with premultiplied alpha to avoid dark fringes.
- **Magenta chroma key is a working backup** (Run B), but needs a tolerance: the "flat #FF00FF" background came back as about (248, 8, 248) with noise (179 distinct border colors, std 2 to 4 per channel). No pixel was exactly #FF00FF. Use it only if a later transparent request returns an opaque background.
- Cost: one image is about 1% of the 5-hour window or less and did not move the weekly figure (details below). Wall time per image: 18 to 28 s for the tool call, 36 to 48 s for the whole `codex exec`.
- Not tested here (one image per request): whether a prompt can force a square canvas, and whether `-i` reference images keep scale. Task 12 should check both on the first Pilot_Pack asset.

## Environment

| Item | Value |
|---|---|
| `codex.cmd --version` | `codex-cli 0.163.0` |
| Plan seen in rollout metadata | `plus` (no extra credits) |
| Codex model in `config.toml` | `gpt-6.1-sol`, sandbox setting `elevated` |
| Python / Pillow / numpy | Python 3.14, Pillow 12.3.0, numpy available; SciPy not installed |
| Stderr noise | `rmcp::transport::worker ... AuthRequired ... mcp.supabase.com` (an MCP server in the user's Codex config needs re-login). Harmless. The earlier `os error 183` PATH-alias warning did not appear in these runs. |
| Output folders | `docs/`, `frontend/assets/masters/_toolcheck/` |

## History: first attempt (failed, sandbox)

An earlier attempt from the sandboxed agent shell exited with code 1 after 0.45 s: `Error loading config.toml: Failed to read config file C:\Users\sdsan\.codex\config.toml: Access is denied. (os error 5)`. The agent sandbox blocked `~/.codex`. After the user stopped the sandbox, config loading worked and both runs below succeeded. The stale log `run-a.log` was deleted after this note.

## How the runs were made

Both runs used the same shape, from the repo root, in the foreground, with JSON events and stderr redirected to files:

```powershell
cmd /c "codex.cmd exec --skip-git-repo-check -s workspace-write -C f:\Projects\kiroween-26 --json `"<prompt>`" > run-X.jsonl 2> run-X.stderr.log"
```

Logs: `frontend/assets/masters/_toolcheck/run-a.jsonl`, `run-a.stderr.log`, `run-b.jsonl`, `run-b.stderr.log`.

Timing and quota numbers come from Codex's own session files (`~/.codex/sessions/.../rollout-*.jsonl`), which are more precise than wall-clock polling.

Observed behavior that matters for `codex_gen.py`:

- The JSON stream prints `thread.started` with a `thread_id`. The image lands in `~/.codex/generated_images/<thread_id>/exec-<uuid>.png`. So the script can find its file from the thread id instead of diffing the whole folder (which already holds about 360 older files).
- The JSON stream has **no event for the image itself**; only the rollout file shows the `image_gen__imagegen` call. Final agent message text is unreliable (empty in Run B). Judge success by the file appearing.
- Codex first reads `~/.codex/skills/.system/imagegen/SKILL.md`, then rewrites the prompt into its own wording before calling the tool. The exact text sent to the tool is recorded below. Our palette and style text must therefore be in the prompt, since Codex paraphrases and adds nothing on its own.
- The sandbox flag `-s workspace-write` did not block anything: Codex wrote under `~/.codex` itself and our shell copied the file into the workspace.

## Run A: transparent request

| Field | Result |
|---|---|
| Prompt | "Generate one image of a single hand-inked cartoon bat with its wings open, vintage 1930s Halloween cartoon style, with a real transparent background (PNG with alpha channel), no text, no other objects." |
| How transparency was requested | The prompt asked for it in words; Codex then called the tool with the boolean argument **`transparent_background: true`**: `tools.image_gen__imagegen({transparent_background:true, prompt:"Use case: illustration-story. Generate exactly one image: a single hand-inked cartoon bat ... Isolated cutout on a genuinely transparent background, PNG with an actual alpha channel. All space outside the bat must be transparent; do not draw a checkerboard, paper, backdrop, shadow, or ground. No text, no other objects, ..."})` |
| `image_gen` invoked non-interactively | Yes |
| Output folder | `C:\Users\sdsan\.codex\generated_images\01a1c50f-f148-78e0-b3eb-e507f97c1133\exec-1bdce3e3-f509-46e7-b297-0da1387ffcac.png` (1,311,544 bytes) |
| Copied into workspace | Yes: `frontend/assets/masters/_toolcheck/bat-transparent.png` |
| Latency | `image_gen` call 27.9 s; whole `codex exec` 48.4 s (task_started 10:45:21.2Z to task_complete 10:46:09.6Z) |
| PNG mode / pixel size | RGBA, 1774 x 887 |
| Alpha min / max | 0 / 255, 256 distinct levels |
| Transparent fraction (alpha == 0) | 58.06% of the canvas |
| Fully opaque fraction (alpha == 255) | 0.06%; alpha 251 to 253 covers about 40% of the canvas (the whole subject interior, 98.8% to 99.2% opaque) |
| Partial alpha fraction (1 to 254) | 41.88% (almost all of it the 251 to 253 interior) |
| Corner pixels | All four (0, 0, 0, 0) |
| Edge quality | Clean. 28,453 edge pixels (alpha 1 to 239, 1.8% of the canvas) have median luminance 32 and 95th percentile 85, so edges are ink-dark. Of the 15,884 edge pixels within 2 px of ink, only 128 (0.8%) are bright (> 170): no light halo or fringe. Only 6 magenta-ish pixels. Over white, black and magenta test backgrounds (`bat-transparent-composites.png`) the outline stays crisp. No semi-transparent matte around the subject. |
| Defects to clean | Interior alpha of 251 to 253 instead of 255; alpha 1 to 2 haze (1,848 pixels more than 6 px from the subject, max alpha 2); the wingtips come within 8 px of the left and right canvas edges (alpha > 8 bounding box 8,8 to 1763,863), so framing margin is thin |
| Quota cost | Primary (5-hour) window 21% before and 21% after; weekly 62% before and after. Under 1% of the 5-hour window, not visible on the weekly figure |

## Run B: magenta chroma key request

| Field | Result |
|---|---|
| Prompt | "Generate one image of a single hand-inked cartoon bat with its wings open, vintage 1930s Halloween cartoon style, on a flat solid #FF00FF background, no text, no other objects." |
| How the key was requested | Prompt text only. Codex called `image_gen__imagegen({prompt:"... Flat solid background of exact hex #FF00FF, uniform edge to edge, with no texture, gradient, lighting variation, or shadow on the background. Only the single bat. ...", transparent_background:false})` |
| `image_gen` invoked non-interactively | Yes |
| Output folder | `C:\Users\sdsan\.codex\generated_images\01a1c511-9058-7de3-afc2-eb5b03f92a4c\exec-7dc4ee73-3d40-44a8-af90-5aacbfa040c9.png` (1,776,809 bytes) |
| Copied into workspace | Yes: `frontend/assets/masters/_toolcheck/bat-magenta.png` |
| Latency | `image_gen` call 18.2 s; whole `codex exec` 36.5 s (10:47:08.3Z to 10:47:44.7Z) |
| PNG mode / pixel size | RGB (no alpha), 1774 x 887 |
| Background | Not exact #FF00FF. Corners (242,12,242), (246,19,242), (236,33,235), (242,32,241). Border mean (248.5, 8.1, 248.7), std (2.0, 3.7, 1.9), 179 distinct border colors. 58.2% of pixels are within 40 per channel of #FF00FF; 0 are exact |
| Quota cost | Primary window 21% to 22%; weekly 62% unchanged |
| Notes | Subject is a good, flat black and cream bat with no magenta inside it. The key route needs a color-distance threshold plus de-spill on the antialiased edge; it will not give the clean alpha that Run A did |

## Quota summary

Readings are integers, so they only bound the cost. Across both images and their text turns the 5-hour window went from 21% to 22% and the weekly window stayed at 62%. Treat one image as at most about 1% of the 5-hour window. The 42-asset base set plus retries (about 70 images) therefore needs several 5-hour windows; the Pilot_Pack gate (two images) is cheap.

## Output files

Under `frontend/assets/masters/_toolcheck/`:

- `bat-transparent.png`, `bat-magenta.png` (the two results)
- `bat-transparent-composites.png` (Run A over white, black and magenta, half size)
- `run-a.jsonl`, `run-a.stderr.log`, `run-b.jsonl`, `run-b.stderr.log` (raw logs)

## Task 1.2: OpenCode and local toolchain

### OpenCode

- **OpenCode available: yes.** `opencode.cmd --version` printed `opencode v2.2.6` and exited with code 0. No `EEXIST` error on the log folder. The earlier failure came from the agent sandbox, which the user has since stopped. The `.ps1` shim was not called.
- Only `--version` was tested. No prompt was sent to a model, so authentication and a real `opencode.cmd run` are unconfirmed. The primary agent should treat the first delegated task as the real test and fall back to doing the work itself if it fails.

### Toolchain versions

| Tool | Result |
|---|---|
| `node` | v24.12.0 |
| `pnpm` | 9.13.0 |
| `python` | 3.14.5 (matches the required 3.14) |
| Pillow | 12.3.0 |
| numpy | 2.5.1 |
| SciPy | not installed (optional speed-up for the Cutout_Script; the numpy scanline fill is the default path) |
| `codex.cmd` | codex-cli 0.163.0 (unchanged from Task 1.1) |
| `opencode.cmd` | v2.2.6 |

### Browser for Lighthouse

- **Google Chrome 157.0.8103.39** at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Microsoft Edge 157.0.4341.42 at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (backup).
- Not found: Chrome under `Program Files (x86)` or `%LOCALAPPDATA%`, Chromium, and Edge under `Program Files`. `CHROME_PATH` is not set. `@lhci/cli` should find the Program Files Chrome by itself; if it does not, set `CHROME_PATH` to the path above.

### Decision (Requirements 14.3, 14.4, 14.5)

- OpenCode works, so these four tasks **may be delegated through `opencode.cmd`**:
  - 7.2 burst paths and sprite strips (the sprite components)
  - 11.2 Cutout_Script
  - 11.5 Asset_QA_Page
  - 12.2 Pilot_Pack wiring (the rig components: `Rig.tsx` and the rig specs)
- The primary agent reviews each delegated result (reads the diff, runs `pnpm --dir frontend verify` or the pytest suite for `tools/art/`) before the task is marked done. If a delegated run fails or produces unusable output, the primary agent does that task directly.
- All other tasks stay with the primary agent. Image generation stays on `codex.cmd` (fallback level 0, transparent alpha route, see the Task 1.1 verdict).

## Pilot pack generation

Run on 2026-11-10 (14:44 to 14:50 UTC) with `tools/art/codex_gen.py`, one subject per `codex.cmd exec` request. Prompt = subject block + `tools/art/style_bible_alpha.txt` (v1 bible with the background sentences changed to a real transparent background) + the hand-inked / cel-painted / no-gradient line + the transparent background block. The prompt is passed on stdin (`codex.cmd exec ... --json -`), so no shell quoting. Logs: `frontend/assets/masters/_runs/*.jsonl|*.stderr.log`, one record per run in `frontend/assets/masters/_runs.jsonl`. Cutouts by `tools/art/cutout.py`, contact sheet by `tools/art/contact_sheet.py` at `frontend/assets/qa/pilot-pack.png`.

Note: the user asked for three assets including Doctor Stitch, which goes beyond the steering's two-asset Pilot_Pack. The rest of the cast is still waiting on approval.

| Asset id | Whole `codex exec` | Retries | Master (px, bytes) | Delivered size (display) | PNG / WebP bytes | QA |
|---|---|---|---|---|---|---|
| `mini-bat/pose-rest` | 60.4 s | 0 | `masters/mini-bat/pose-rest-v01.png`, 1414 x 1112, 865,006 | 190 x 160 (95 x 80) | 37,892 / 9,062 | pass |
| `wraith-director/pose` | 91.8 s | 0 | `masters/wraith-director/pose-v01.png`, 1024 x 1536, 1,536,199 | 244 x 400 (122 x 200) | 107,892 / 27,958 | pass |
| `doctor-stitch/pose` | 70.9 s | 0 | `masters/doctor-stitch/pose-v01.png`, 1175 x 1339, 1,228,863 | 320 x 378 (160 x 189) | 152,452 / 34,616 | pass |

Total generation wall time: 223.1 s for three images. Quota (rollout `rate_limits`): 5-hour window 40% at the first run's start, 45% after the third; weekly 71% to 72%. That is about 1.5% of the 5-hour window per image, a bit more than Task 1.1 measured. The window was already at 40% from other use.

### New facts
- **Output size is not fixed at 1774 x 887.** All three came back RGBA with a different aspect each: 1414 x 1112, 1024 x 1536 and 1175 x 1339. Codex or the tool picks the canvas to fit the subject (portrait for the standing figures). The cutout must not assume a size, and `cutout.py` does not.
- All three calls were `image_gen__imagegen({transparent_background:true, ...})` (checked in the rollout files). Corners are (0,0,0,0) on every master.
- Alpha matches Task 1.1: subject interior at 251 to 253 (25% to 34% of the canvas), alpha 255 at most 0.14%, and 15k to 28k haze pixels at alpha 1 to 8. The snap and zero steps cleared all the haze. The speck pass found no isolated blobs (0 pixels removed). Subject bounding boxes sit 33 to 120 px from the canvas edges, so the "generous margin" wording worked; nothing was cropped.
- `cutout.py` fits each cutout inside 2x the roster display box with the aspect kept (contain fit), so the delivered box never goes past the roster size. Mini Bat fills the height (190 x 160 of 200 x 160) and Wraith Director fills the height (244 x 400 of 320 x 400). Doctor Stitch is not in `MascotId` yet, so his box is a provisional 160 x 200 in `KNOWN_ASSETS` and `roster.ts` was not changed.
- `codex_gen.py` first logged no `image_gen` arguments because the call is embedded as code text in the rollout. The parser now matches the raw line and records `transparent_background`. The three existing `_runs.jsonl` records lack that field; the value was `true` for all three.

### Style review (contact sheet on tower-950, paper-100, checkerboard)

> Superseded palette. tower-950 and paper-100 belonged to the earlier design. The current interface is dark Violet Midnight ([design-system.md](design-system.md)). The findings below are the record of that review and are kept as written.
- **One cast: mostly yes.** All three use the same warm-charcoal ink, irregular but similar-weight outlines, flat cel fills with one shadow tone, rubber-hose limbs, four-finger white gloves (Wraith, Stitch) and pie-cut eyes (Bat, Stitch). The palette holds to ivory/parchment, burnt pumpkin, sage, mist grey-blue, brick and gold. No text, no glow, no 3D, no ground shadow, one subject each.
- **Dark background problem (most important).** On tower-950 the ink outline almost disappears. Mini Bat's body is near-black fur, so his silhouette dissolves on the night sections; only the face, ears and wings read. Wraith Director's hood, legs and arms also merge. Paper-100 and checkerboard look clean, with no halo or magenta fringe. Before the night sections use these, consider a thin paper-coloured outer rim (a cutout-side stroke) or putting the mascots on paper objects, rather than regenerating.
- **Detail density varies.** Doctor Stitch is the busiest (stitches, stains, patches, head mirror) and will read as noisy at 160 px display. Mini Bat is the simplest. At display size the bat's line weight looks heaviest relative to its body, because it is drawn larger in its canvas.
- **Small palette drifts.** Stitch's neckerchief is a brighter orange than burnt pumpkin (#B7683C). His head mirror has a soft grey sheen, the closest thing to a gradient in the set. The fills carry a faint paper grain from the generator. That is acceptable, but it is not perfectly flat cel.
- **Relative scale.** Inside their boxes, Doctor Stitch (160 x 189) shows about as tall as the Wraith Director (122 x 200), so the Wraith does not read as the tallest figure. That needs fixing in layout or with a box size decision when Stitch joins the roster.
- **Brief vs result.** Mini Bat's wings are open more than "half open", and his ears are uneven rather than his wings. The Wraith's eyes are flat gold dots in a dark hood, as asked. None of these broke style enough to justify a retry, so no retries were spent.
