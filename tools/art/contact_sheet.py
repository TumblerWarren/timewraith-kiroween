"""Contact sheet of cutouts on dark (tower-950), light (paper-100) and checkerboard backgrounds.

Usage:
    python tools/art/contact_sheet.py --out frontend/assets/qa/pilot-pack.png mini-bat/pose-rest wraith-director/pose ...

Reads the PNG cutouts listed in frontend/assets/manifests/manifest.json. The sheet is a QA artifact
and is not shipped.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
ASSETS = REPO / "frontend" / "assets"
TOWER_950 = (0x24, 0x25, 0x1F)
PAPER_100 = (0xF8, 0xF0, 0xDE)
LABEL_BG = (0x4D, 0x43, 0x36)
CELL = 440
LABEL_H = 36
PAD = 20


def checker(w: int, h: int, step: int = 16) -> Image.Image:
    img = Image.new("RGB", (w, h), (200, 200, 200))
    d = ImageDraw.Draw(img)
    for y in range(0, h, step):
        for x in range(0, w, step):
            if (x // step + y // step) % 2:
                d.rectangle([x, y, x + step - 1, y + step - 1], fill=(255, 255, 255))
    return img


def build(ids: list[str], out: Path) -> Path:
    manifest = json.loads((ASSETS / "manifests" / "manifest.json").read_text(encoding="utf-8"))
    font = ImageFont.load_default(size=18)
    sheet = Image.new("RGB", (3 * CELL, len(ids) * (CELL + LABEL_H)), LABEL_BG)
    draw = ImageDraw.Draw(sheet)
    for row, aid in enumerate(ids):
        entry = manifest["assets"][aid]
        cut = Image.open(ASSETS / entry["files"]["png"]).convert("RGBA")
        scale = min((CELL - 2 * PAD) / cut.width, (CELL - 2 * PAD) / cut.height)
        shown = cut.resize((round(cut.width * scale), round(cut.height * scale)), Image.Resampling.LANCZOS)
        y0 = row * (CELL + LABEL_H)
        label = (f"{aid}  status={entry['status']}  {entry['size']['w']}x{entry['size']['h']}px  "
                 f"webp {entry['bytes']['webp']} B  (shown x{scale:.2f})")
        draw.text((10, y0 + 8), label, fill=PAPER_100, font=font)
        for col, bg in enumerate([Image.new("RGB", (CELL, CELL), TOWER_950), Image.new("RGB", (CELL, CELL), PAPER_100),
                                  checker(CELL, CELL)]):
            bg.paste(shown, ((CELL - shown.width) // 2, (CELL - shown.height) // 2), shown)
            sheet.paste(bg, (col * CELL, y0 + LABEL_H))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("ids", nargs="+")
    p.add_argument("--out", type=Path, default=ASSETS / "qa" / "pilot-pack.png")
    args = p.parse_args()
    print(build(args.ids, args.out))


if __name__ == "__main__":
    main()
