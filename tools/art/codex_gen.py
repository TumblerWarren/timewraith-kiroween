"""Generate one mascot master with `codex.cmd exec` (transparent-alpha route, docs/tool-check.md).

One subject per request. The prompt is the subject block, the full alpha Style_Bible
(tools/art/style_bible_alpha.txt) and a single-subject line. The prompt goes to Codex on stdin, so no
shell quoting is involved. The run is in the foreground with `--json`; stdout and stderr go to
`frontend/assets/masters/_runs/`. The image is found through the thread id
(`~/.codex/generated_images/<thread_id>/exec-*.png`), copied to
`frontend/assets/masters/<mascot>/<asset>-vNN.png` (never overwriting) and the run is appended to
`frontend/assets/masters/_runs.jsonl`.

Usage:
    python tools/art/codex_gen.py --id mini-bat/pose-rest --subject "a tiny round-bodied bat ..." [--retry-reason "..."]

Prints the master path (or nothing on failure) as the last line of a JSON record.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MASTERS = REPO / "frontend" / "assets" / "masters"
RUNS_DIR = MASTERS / "_runs"
RUNS_LOG = MASTERS / "_runs.jsonl"
STYLE = Path(__file__).with_name("style_bible_alpha.txt")
CODEX_HOME = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))

EXTRA_STYLE = (
    "Hand-inked, cel-painted, vintage 1930s Halloween cartoon look. Consistent ink line weight with the rest "
    "of the cast. Flat cel colors from the TimeWraith palette. No gradients, no glow, no soft shadow, "
    "no photographic texture, no 3D."
)
BACKGROUND = (
    "Isolated cutout on a genuinely transparent background, PNG with a real alpha channel. All space outside "
    "the subject must be transparent. Do not draw a checkerboard, paper, backdrop, shadow or ground."
)


def build_prompt(subject: str, retry_reason: str | None = None) -> str:
    parts = [
        f"Generate exactly one image: {subject}.",
        "Pose and framing: the subject centered with a generous margin on every side; no part touches the "
        "image edge.",
        "Only this one subject. A single character, not a group, not a lineup, not a character sheet. "
        "No text, no letters, no logo, no watermark, no other objects.",
    ]
    if retry_reason:
        parts.append(f"The previous attempt was rejected: {retry_reason}. Fix that in this attempt.")
    parts.append(STYLE.read_text(encoding="utf-8").strip())
    parts.append(EXTRA_STYLE)
    parts.append(BACKGROUND)
    return "\n\n".join(parts)


def next_master_path(mascot: str, name: str) -> Path:
    folder = MASTERS / mascot
    folder.mkdir(parents=True, exist_ok=True)
    n = 1
    while (folder / f"{name}-v{n:02d}.png").exists():
        n += 1
    return folder / f"{name}-v{n:02d}.png"


def thread_id_from(jsonl: Path) -> str | None:
    for line in jsonl.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "thread.started":
            return ev.get("thread_id")
    return None


def rollout_facts(thread_id: str) -> dict:
    """Quota readings and the image_gen call from Codex's own session file (best effort)."""
    facts: dict = {}
    files = list((CODEX_HOME / "sessions").rglob(f"rollout-*{thread_id}.jsonl"))
    if not files:
        return facts
    limits = []
    for line in files[0].read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        p = ev.get("payload") or {}
        rl = p.get("rate_limits") if isinstance(p, dict) else None
        if isinstance(rl, dict) and rl.get("primary"):
            limits.append((rl["primary"].get("used_percent"), (rl.get("secondary") or {}).get("used_percent")))
        # The image_gen call is embedded as code text in a response item, so match the raw line.
        m = re.search(r"image_gen__imagegen\(\{transparent_background:(true|false)", line)
        if m:
            facts["transparent_background"] = m.group(1) == "true"
    if limits:
        facts["quota_primary_first"], facts["quota_weekly_first"] = limits[0]
        facts["quota_primary_last"], facts["quota_weekly_last"] = limits[-1]
    facts["rollout"] = str(files[0])
    return facts


def run(asset_id: str, subject: str, retry_reason: str | None, attempt: int, timeout: int) -> dict:
    mascot, name = asset_id.split("/", 1)
    prompt = build_prompt(subject, retry_reason)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = RUNS_DIR / f"{mascot}--{name}--a{attempt}--{stamp}"
    out_path, err_path = base.with_suffix(".jsonl"), base.with_suffix(".stderr.log")
    cmd = ["cmd", "/c", "codex.cmd", "exec", "--skip-git-repo-check", "-s", "workspace-write",
           "-C", str(REPO), "--json", "-"]
    t0 = time.monotonic()
    with open(out_path, "wb") as out, open(err_path, "wb") as err:
        try:
            proc = subprocess.run(cmd, input=prompt.encode("utf-8"), stdout=out, stderr=err, timeout=timeout,
                                  cwd=REPO)
            code: int | None = proc.returncode
        except subprocess.TimeoutExpired:
            code = None
    latency = round(time.monotonic() - t0, 1)

    tid = thread_id_from(out_path)
    record: dict = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "id": asset_id, "attempt": attempt, "retry_reason": retry_reason, "prompt": prompt,
        "thread_id": tid, "exit_code": code, "latency_s": latency,
        "stdout_log": out_path.relative_to(REPO).as_posix(), "stderr_log": err_path.relative_to(REPO).as_posix(),
        "source_file": None, "master": None, "width": None, "height": None, "bytes": None,
    }
    if tid:
        pngs = sorted((CODEX_HOME / "generated_images" / tid).glob("exec-*.png"), key=lambda p: p.stat().st_mtime)
        if pngs:
            src = pngs[-1]
            dst = next_master_path(mascot, name)
            shutil.copy2(src, dst)
            from PIL import Image
            with Image.open(dst) as im:
                record.update(width=im.width, height=im.height, mode=im.mode)
            record.update(source_file=str(src), master=dst.relative_to(REPO).as_posix(), bytes=dst.stat().st_size,
                          images_in_thread=len(pngs))
        record.update(rollout_facts(tid))
    with open(RUNS_LOG, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Generate one master with codex.cmd exec")
    p.add_argument("--id", required=True)
    p.add_argument("--subject", required=True)
    p.add_argument("--retry-reason")
    p.add_argument("--attempt", type=int, default=1)
    p.add_argument("--timeout", type=int, default=600)
    args = p.parse_args(argv)
    if not re.fullmatch(r"[a-z0-9-]+/[a-z0-9-]+", args.id):
        p.error("bad asset id")
    rec = run(args.id, args.subject, args.retry_reason, args.attempt, args.timeout)
    summary = {k: rec.get(k) for k in ("id", "attempt", "thread_id", "exit_code", "latency_s", "master", "width",
                                       "height", "mode", "bytes", "quota_primary_first", "quota_primary_last",
                                       "quota_weekly_first", "quota_weekly_last")}
    print(json.dumps(summary))
    return 0 if rec.get("master") else 1


if __name__ == "__main__":
    sys.exit(main())
