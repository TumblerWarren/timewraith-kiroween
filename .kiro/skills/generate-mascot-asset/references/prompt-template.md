# Prompt template for `codex.cmd exec`

Codex rewrites the prompt before it calls `image_gen`, so every style rule must be in the text below. Do not rely on Codex to add the palette or the line weight. Build the final prompt from three blocks: **subject**, **style**, **background**.

Read `docs/tool-check.md` before the first request. Task 1.1 found that Codex can return a real transparent PNG, so the transparent background block is the default.

## 1. Subject block
```
Generate exactly one image: <one-sentence subject, from references/part-specs.md and assets.spec.json>.
Pose and framing: <pose>. Fully inside the frame with a clear margin on every side; do not let any part touch the image edge.
Only this subject. No text, no letters, no logo, no watermark, no other objects.
```

## 2. Style block
Paste the v1 Style_Bible text from `tools/art/style_bible.txt` here, unabridged, then add:
```
Hand-inked, cel-painted, vintage 1930s Halloween cartoon look. Consistent ink line weight with the rest of the cast. Flat cel colors from the TimeWraith palette. No gradients, no glow, no soft shadow, no photographic texture.
```

## 3. Background block

### Preferred: transparent alpha
```
Isolated cutout on a genuinely transparent background, PNG with a real alpha channel. All space outside the subject must be transparent. Do not draw a checkerboard, paper, backdrop, shadow or ground.
```
Asking for a transparent background in words makes Codex set `transparent_background: true` on the `image_gen` call (Run A in `docs/tool-check.md`).

### Backup: magenta chroma key
Use only if a transparent request returned an opaque background.
```
Flat solid background of exact hex #FF00FF, uniform edge to edge, with no texture, gradient, lighting variation or shadow on the background. No magenta anywhere on the subject.
```
Expect a noisy key (about `(248, 8, 248)`), not an exact #FF00FF.

Never put both background blocks in one request.

## Command shape
Run from the repo root, in the foreground, with JSON events and stderr redirected:
```powershell
cmd /c "codex.cmd exec --skip-git-repo-check -s workspace-write -C f:\Projects\kiroween-26 --json `"<prompt>`" > run.jsonl 2> run.stderr.log"
```
- Read `thread_id` from the `thread.started` event in `run.jsonl`.
- The image is `~/.codex/generated_images/<thread_id>/exec-<uuid>.png`. Copy it to `frontend/assets/masters/<mascot>/<part>-vNN.png`; never leave it only there and never overwrite an existing master.
- Do not call `codex.ps1`.

## Output facts
- Size is **1774 x 887** (2:1). The tool call has no size argument. Do not ask for 1024 x 1024; the cutout step builds the square master.
- Transparent output has alpha 251 to 253 inside the subject and a faint alpha 1 to 2 haze, so the cutout must snap alpha >= 240 to 255, zero alpha <= 8 away from the subject, trim to the alpha bounding box and place the result on a 1024 x 1024 canvas.
- Whether a prompt can force a square canvas, and whether `-i` reference images keep scale, are untested. Check both on the first Pilot_Pack asset (task 12) and record the answer here.

## Retry line
On a QA failure, append one sentence with the failure reason to the subject block (for example "The previous attempt had the wing cropped at the edge; keep a wide margin."). Retry at most 2 times.
