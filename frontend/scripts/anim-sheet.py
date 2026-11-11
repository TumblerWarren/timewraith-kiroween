"""Stitches numbered PNG frames into one labelled contact sheet (used by anim-review.mjs).

usage: python anim-sheet.py <out.png> <cols> <max_frames> <cell_w> <frame1.png> <frame2.png> ...
Frame file names may end in `-<ms>ms.png`; that label is drawn on the cell.
"""
import re
import sys

from PIL import Image, ImageDraw


def main() -> None:
    out, cols, max_frames, cell_w, *files = sys.argv[1:]
    cols, max_frames, cell_w = int(cols), int(max_frames), int(cell_w)
    if len(files) > max_frames:
        step = (len(files) - 1) / (max_frames - 1)
        files = [files[round(i * step)] for i in range(max_frames)]
    imgs = [Image.open(f).convert("RGB") for f in files]
    if not imgs:
        return
    scale = cell_w / imgs[0].width
    cell_h = round(imgs[0].height * scale)
    rows = (len(imgs) + cols - 1) // cols
    pad = 4
    sheet = Image.new("RGB", (cols * (cell_w + pad) + pad, rows * (cell_h + pad) + pad), (40, 40, 40))
    draw = ImageDraw.Draw(sheet)
    for i, (f, im) in enumerate(zip(files, imgs)):
        im = im.resize((cell_w, cell_h), Image.LANCZOS)
        x = pad + (i % cols) * (cell_w + pad)
        y = pad + (i // cols) * (cell_h + pad)
        sheet.paste(im, (x, y))
        m = re.search(r"-(\d+)(ms|pct)\.(png|jpg)$", f)
        label = f"{m.group(1)} {m.group(2).replace('pct', '%')}" if m else str(i)
        draw.rectangle([x, y, x + 62, y + 14], fill=(0, 0, 0))
        draw.text((x + 3, y + 1), label, fill=(255, 255, 0))
    sheet.save(out)


main()
