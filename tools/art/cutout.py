"""Cutout_Script for the transparent-alpha route (docs/tool-check.md, Task 1.1 verdict).

The Codex masters already have a real alpha channel, so this script only cleans and trims:

1. snap alpha >= 240 to 255 (the subject interior comes back at 251 to 253);
2. zero alpha <= 8 (the faint 1 to 2 haze);
3. drop isolated specks far from the main subject (block-grid connected components, numpy only);
4. trim to the alpha bounding box with a small margin;
5. resize with premultiplied alpha (LANCZOS) to the delivered size, 2x the display box;
6. export PNG and WebP (WebP quality lowered until the file is <= 300 KB);
7. run QA and merge the entry into frontend/assets/manifests/manifest.json (atomic write).

Usage (from the repo root):
    python tools/art/cutout.py frontend/assets/masters/mini-bat/pose-rest-v01.png --id mini-bat/pose-rest

Only Pillow and numpy are needed.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import tempfile
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
ASSETS_ROOT = REPO / "frontend" / "assets"

SNAP_HI = 240
ZERO_LO = 8
BLOCK = 4  # px per cell of the speck-removal grid
SPECK_DIST = 24  # px: small components farther than this from the main subject are dropped
SPECK_KEEP_FRACTION = 0.01  # components with at least 1% of the main subject's alpha mass are kept anyway
WEBP_MAX_BYTES = 300 * 1024
MIN_ALPHA_LEVELS = 3
MIN_TRANSPARENT_FRACTION = 0.02
MAGENTA_FRINGE_MAX = 0.01  # fraction of edge pixels that may look magenta

# Display boxes in CSS px come from frontend/src/mascots/roster.ts (MASCOT_ART[...].size).
# doctor-stitch is not in MascotId yet; his box is provisional (same as wraith-director).
KNOWN_ASSETS: dict[str, dict] = {
    "mini-bat/pose-rest": {
        "display": (100, 80),
        "pivot": (0.5, 0.5),
        "alt": "Mini Bat, a tiny round bat with crooked half-open wings and one fang, at rest",
    },
    "wraith-director/pose": {
        "display": (160, 200),
        "pivot": (0.5, 1.0),
        "alt": "Wraith Director, a tall hooded wraith in a tattered pale cloak raising a small lantern",
    },
    "doctor-stitch/pose": {
        "display": (160, 200),
        "pivot": (0.5, 1.0),
        "alt": "Doctor Stitch, a patchwork ghoul doctor holding a curved sewing needle and a spool of thread",
    },
}


# ---------------------------------------------------------------- alpha cleanup


def snap_alpha(alpha: np.ndarray, hi: int = SNAP_HI, lo: int = ZERO_LO) -> np.ndarray:
    """Snap near-opaque alpha to 255 and faint alpha to 0. Returns a new uint8 array."""
    a = alpha.astype(np.uint8, copy=True)
    a[a >= hi] = 255
    a[a <= lo] = 0
    return a


def _label_grid(occ: np.ndarray) -> tuple[np.ndarray, int]:
    """8-connected component labels of a boolean grid (BFS; the grid is small)."""
    h, w = occ.shape
    labels = np.zeros((h, w), dtype=np.int32)
    n = 0
    ys, xs = np.nonzero(occ)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if labels[y0, x0]:
            continue
        n += 1
        labels[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= h:
                    continue
                for dx in (-1, 0, 1):
                    nx = x + dx
                    if 0 <= nx < w and occ[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = n
                        q.append((ny, nx))
    return labels, n


def _dilate(mask: np.ndarray, r: int) -> np.ndarray:
    """Square dilation by r cells using shifted ORs (numpy only)."""
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        m[1:, :] |= out[:-1, :]
        m[:-1, :] |= out[1:, :]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


def remove_specks(alpha: np.ndarray, block: int = BLOCK, dist: int = SPECK_DIST,
                  keep_fraction: float = SPECK_KEEP_FRACTION) -> tuple[np.ndarray, int]:
    """Zero isolated low-mass components that sit farther than `dist` px from the main subject.

    Works on a coarse grid (`block` px cells) so plain BFS is fast. Returns (alpha, removed pixel count).
    """
    a = alpha.copy()
    h, w = a.shape
    gh, gw = -(-h // block), -(-w // block)
    pad = np.zeros((gh * block, gw * block), dtype=np.float64)
    pad[:h, :w] = a
    cells = pad.reshape(gh, block, gw, block).sum(axis=(1, 3))
    occ = cells > 0
    if not occ.any():
        return a, 0
    labels, n = _label_grid(occ)
    if n <= 1:
        return a, 0
    mass = np.bincount(labels.ravel(), weights=cells.ravel(), minlength=n + 1)
    mass[0] = 0
    main = int(np.argmax(mass))
    near = _dilate(labels == main, max(1, -(-dist // block)))
    drop_cells = np.zeros_like(occ)
    for lab in range(1, n + 1):
        if lab == main or mass[lab] >= keep_fraction * mass[main]:
            continue
        comp = labels == lab
        if not (comp & near).any():
            drop_cells |= comp
    if not drop_cells.any():
        return a, 0
    drop = np.repeat(np.repeat(drop_cells, block, axis=0), block, axis=1)[:h, :w]
    removed = int(np.count_nonzero(a[drop]))
    a[drop] = 0
    return a, removed


def alpha_bbox(alpha: np.ndarray) -> tuple[int, int, int, int] | None:
    """(left, top, right, bottom) of alpha > 0, right/bottom exclusive. None when empty."""
    ys = np.nonzero(alpha.any(axis=1))[0]
    xs = np.nonzero(alpha.any(axis=0))[0]
    if ys.size == 0:
        return None
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


def trim(rgba: np.ndarray, margin_frac: float = 0.03, min_margin: int = 4) -> np.ndarray:
    """Crop to the alpha bounding box plus a transparent margin (padded if it runs past the canvas)."""
    box = alpha_bbox(rgba[..., 3])
    if box is None:
        raise ValueError("image has no visible pixels")
    l, t, r, b = box
    m = max(min_margin, int(round(margin_frac * max(r - l, b - t))))
    out = np.zeros((b - t + 2 * m, r - l + 2 * m, 4), dtype=np.uint8)
    out[m:m + (b - t), m:m + (r - l)] = rgba[t:b, l:r]
    return out


# ---------------------------------------------------------------- resize


def fit_size(w: int, h: int, box_w: int, box_h: int) -> tuple[int, int]:
    """Largest size with the aspect of (w, h) that fits inside (box_w, box_h)."""
    s = min(box_w / w, box_h / h)
    return max(1, int(round(w * s))), max(1, int(round(h * s)))


def resize_premultiplied(rgba: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """LANCZOS resize with premultiplied alpha, so black RGB under alpha 0 cannot fringe."""
    f = rgba.astype(np.float32)
    a = f[..., 3:4] / 255.0
    pre = np.concatenate([f[..., :3] * a, f[..., 3:4]], axis=-1)
    chans = [np.asarray(Image.fromarray(np.ascontiguousarray(pre[..., i], dtype=np.float32)).resize(size, Image.Resampling.LANCZOS))
             for i in range(4)]
    out = np.stack(chans, axis=-1)
    alpha = np.clip(out[..., 3], 0, 255)
    safe = np.where(alpha > 0, alpha / 255.0, 1.0)[..., None]
    rgb = np.clip(out[..., :3] / safe, 0, 255)
    rgb[alpha <= 0] = 0
    res = np.concatenate([rgb, alpha[..., None]], axis=-1)
    return np.rint(res).astype(np.uint8)


# ---------------------------------------------------------------- export + QA


def encode_png(rgba: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(rgba).save(buf, "PNG", optimize=True)
    return buf.getvalue()


def encode_webp(rgba: np.ndarray, max_bytes: int = WEBP_MAX_BYTES) -> tuple[bytes, int]:
    """Highest WebP quality (90 down to 40) whose file fits max_bytes. Returns (data, quality)."""
    img = Image.fromarray(rgba)
    data = b""
    q = 90
    for q in range(90, 35, -5):
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=q, alpha_quality=100, method=6)
        data = buf.getvalue()
        if len(data) <= max_bytes:
            break
    return data, q


def qa_check(rgba: np.ndarray, webp_bytes: int) -> list[str]:
    """QA reasons (empty list = pass)."""
    reasons: list[str] = []
    a = rgba[..., 3]
    h, w = a.shape
    corners = [a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]]
    if any(int(c) != 0 for c in corners):
        reasons.append("corner pixels are not transparent")
    transparent = float(np.mean(a == 0))
    if transparent < MIN_TRANSPARENT_FRACTION:
        reasons.append(f"too little transparency ({transparent:.1%})")
    if np.count_nonzero(a == 255) == 0:
        reasons.append("no opaque subject pixels")
    levels = int(np.unique(a).size)
    if levels < MIN_ALPHA_LEVELS:
        reasons.append(f"only {levels} alpha levels")
    edge = (a > 0) & (a < 255)
    n_edge = int(np.count_nonzero(edge))
    if n_edge:
        r, g, b = (rgba[..., i].astype(np.int16) for i in range(3))
        magenta = edge & (r > 170) & (b > 170) & (g < 100)
        frac = np.count_nonzero(magenta) / n_edge
        if frac > MAGENTA_FRINGE_MAX:
            reasons.append(f"magenta fringe on {frac:.1%} of edge pixels")
    if webp_bytes > WEBP_MAX_BYTES:
        reasons.append(f"webp is {webp_bytes} bytes (> {WEBP_MAX_BYTES})")
    return reasons


# ---------------------------------------------------------------- manifest


def empty_manifest() -> dict:
    return {"schemaVersion": 1, "keyColor": "#FF00FF", "assets": {}}


def read_manifest(path: Path) -> dict:
    if not path.exists():
        return empty_manifest()
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("assets"), dict):
        return empty_manifest()
    data.setdefault("schemaVersion", 1)
    data.setdefault("keyColor", "#FF00FF")
    return data


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def merge_entry(manifest_path: Path, entry: dict) -> dict:
    data = read_manifest(manifest_path)
    assets = dict(data["assets"])
    assets[entry["id"]] = entry
    data["assets"] = dict(sorted(assets.items()))
    atomic_write_text(manifest_path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return data


def _rel(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


# ---------------------------------------------------------------- pipeline


def process(master: Path, asset_id: str, *, display_box: tuple[int, int], pivot: tuple[float, float] = (0.5, 1.0),
            alt: str | None = None, fallback: str | None = None, attempts: int = 1, source: str = "codex",
            extra_reasons: list[str] | None = None, assets_root: Path = ASSETS_ROOT,
            manifest_path: Path | None = None) -> dict:
    """Run the whole cutout for one master and merge its manifest entry. Returns the entry."""
    if "/" not in asset_id:
        raise ValueError("asset id must look like <mascot>/<asset>")
    mascot, name = asset_id.split("/", 1)
    manifest_path = manifest_path or assets_root / "manifests" / "manifest.json"

    rgba = np.asarray(Image.open(master).convert("RGBA")).copy()
    alpha = snap_alpha(rgba[..., 3])
    alpha, _removed = remove_specks(alpha)
    rgba[..., 3] = alpha
    rgba[alpha == 0, :3] = 0
    trimmed = trim(rgba)

    size = fit_size(trimmed.shape[1], trimmed.shape[0], 2 * display_box[0], 2 * display_box[1])
    out = resize_premultiplied(trimmed, size)

    png = encode_png(out)
    webp, _q = encode_webp(out)
    out_dir = assets_root / "cutouts" / mascot
    png_path = out_dir / f"{name}.png"
    webp_path = out_dir / f"{name}.webp"
    atomic_write_bytes(png_path, png)
    atomic_write_bytes(webp_path, webp)

    reasons = qa_check(out, len(webp)) + list(extra_reasons or [])
    ok = not reasons
    entry = {
        "id": asset_id,
        "mascot": mascot,
        "kind": "pose",
        "status": "pass" if ok else "fail",
        "source": source,
        "master": _rel(master, assets_root),
        "files": {"png": _rel(png_path, assets_root), "webp": _rel(webp_path, assets_root)},
        "size": {"w": size[0], "h": size[1]},
        "display": {"w": int(round(size[0] / 2)), "h": int(round(size[1] / 2))},
        "pivot": {"x": float(pivot[0]), "y": float(pivot[1])},
        "bytes": {"png": len(png), "webp": len(webp)},
        "qa": {"ok": ok, "reasons": reasons, "attempts": int(attempts)},
        "alt": alt,
        "fallback": fallback,
    }
    merge_entry(manifest_path, entry)
    return entry


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("master", type=Path)
    p.add_argument("--id", required=True, help="asset id, e.g. mini-bat/pose-rest")
    p.add_argument("--display", help="display box WxH in CSS px (default from KNOWN_ASSETS)")
    p.add_argument("--pivot", help="x,y normalised (default from KNOWN_ASSETS)")
    p.add_argument("--alt")
    p.add_argument("--fallback")
    p.add_argument("--attempts", type=int, default=1)
    p.add_argument("--source", default="codex", choices=["codex", "api", "manual", "derived"])
    p.add_argument("--fail-reason", action="append", default=[],
                   help="force status fail with this reason (e.g. a style review failure)")
    args = p.parse_args(argv)

    known = KNOWN_ASSETS.get(args.id, {})
    if args.display:
        w, h = (int(v) for v in args.display.lower().split("x"))
        display = (w, h)
    elif "display" in known:
        display = known["display"]
    else:
        p.error("--display is required for an unknown asset id")
    pivot = tuple(float(v) for v in args.pivot.split(",")) if args.pivot else known.get("pivot", (0.5, 1.0))
    alt = args.alt if args.alt is not None else known.get("alt")

    entry = process(args.master, args.id, display_box=display, pivot=pivot, alt=alt, fallback=args.fallback,
                    attempts=args.attempts, source=args.source, extra_reasons=args.fail_reason)
    print(json.dumps(entry, indent=2))
    return 0 if entry["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
