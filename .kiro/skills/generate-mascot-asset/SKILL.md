---
name: generate-mascot-asset
description: Generate one TimeWraith mascot part, pose or scenery image with codex.cmd (image_gen, transparent PNG preferred, magenta #FF00FF chroma key as backup) using the Style_Bible, trim and place it on the 1024x1024 canvas with the cutout script, run asset QA, and record the result in docs/asset-log.md. Use when creating, regenerating or fixing a mascot, Pilot_Pack, sprite, part, pose or scenery asset.
metadata:
  project: timewraith
---
# Generate a mascot asset

1. Read `docs/tool-check.md` (top verdict, Run A and Run B) and `tools/art/style_bible.txt`, then the entry for the asset id in `tools/art/assets.spec.json`.
2. Confirm the Pilot_Pack is approved (see `docs/asset-log.md`). If this asset is in the Pilot_Pack, generate it and then stop and ask the user to review.
3. Run `python tools/art/codex_gen.py --id <mascot>/<part>` (it calls `codex.cmd exec`, copies the result to `frontend/assets/masters/`, runs `cutout.py` and `qa_check.py`).
4. If QA fails, read the reasons in the output. `codex_gen.py` retries up to 2 times with the reason added to the prompt. After that, keep the `fail` status, make sure `fallback` points to the pose, and continue with the next asset.
5. Open `http://localhost:5173/?qa` (ask the user to run `pnpm --dir frontend dev`) or the contact sheet in `frontend/assets/qa/` to check ink weight and style against the Pilot_Pack.
6. Append one line to `docs/asset-log.md`: id, version, attempts, status.

See `references/prompt-template.md` for the prompt skeleton and `references/part-specs.md` for per-part wording.

## Background mode (decided by task 1.1, `docs/tool-check.md`)
- **Preferred: transparent alpha.** Ask for a real transparent background in the prompt. Codex then calls `image_gen` with `transparent_background: true` and returns an RGBA PNG with clean edges. Do not ask for a colored backdrop in the same request.
- **Backup: flat `#FF00FF` chroma key.** Use it only if a transparent request comes back with an opaque background. The key is not exact (about `(248, 8, 248)` with noise), so the cutout needs a color-distance tolerance and edge de-spill. Never mix both modes in one request.

## Facts to keep in mind
- Output is **1774 x 887** (2:1), not square. Codex picks the size; the tool call has no size argument.
- Codex **paraphrases** the prompt before calling `image_gen`. The palette and Style_Bible text must be written into the prompt itself; Codex adds none on its own.
- The file lands in `~/.codex/generated_images/<thread_id>/exec-<uuid>.png`. Run `codex.cmd exec` with `--json`; the `thread_id` comes from the `thread.started` event. The JSON stream has no image event, so success means the file appeared.
- Use `codex.cmd`, never the `.ps1` shim. Copy the file into `frontend/assets/masters/` and never overwrite a master; write `-vNN`.
- One image per request. Quota is limited (about 1% of the 5-hour window per image or less).

## Cutout step (transparent route)
The cutout only trims and cleans; it does not remove a background.
1. Snap alpha >= 240 to 255. The subject interior comes back at alpha 251 to 253.
2. Zero alpha <= 8 away from the subject (faint alpha 1 to 2 haze sits far from it).
3. Trim to the alpha bounding box.
4. Resize with premultiplied alpha (RGB under alpha 0 is black and would dark-fringe).
5. Place the result on the 1024 x 1024 canvas with a safe margin; the subject comes close to the canvas edge in the raw output.
