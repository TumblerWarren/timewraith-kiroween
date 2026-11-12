"""Cut a mascot into animatable layers from an approved pose and a 'parts removed' plate.

Why subtraction: a part drawn from scratch never matches the approved character. Instead Codex redraws the
approved pose with some parts removed and the body completed underneath (the PLATE, same canvas). Every pixel of
the pose that the plate does not have belongs to a removed part, so the part keeps the approved pixels exactly.

Steps (numpy and Pillow only):
1. register the plate to the pose (best integer shift within +-SHIFT px) and refuse a plate that does not overlap;
2. part mask = pose pixels the plate lacks, grown into the body by OVERLAP px so a rotating part never shows a gap;
3. split the mask into connected pieces and name them with REGION rules (normalised canvas boxes by centroid);
4. each piece becomes a full-canvas layer (same size as the body layer, so the frontend stacks them 1:1);
5. the pivot of a piece is where it touches the body (centroid of the contact zone);
6. QA: the layers stacked at rest must match the pose (mean colour difference, share of mismatching pixels);
7. export PNG/WebP at 2x the display box and merge `part` entries into the manifest.

Usage (repo root):
    python tools/art/rig_cut.py --mascot mini-bat --pose frontend/assets/masters/mini-bat/pose-rest-v01.png \
        --plate frontend/assets/masters/mini-bat/body-v01.png --display 104x87 \
        --part wing-l=0,0,0.5,1 --part wing-r=0.5,0,1,1 --body-name body
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cutout  # noqa: E402

OPAQUE = 128  # alpha above this counts as drawn
SHIFT = 10  # px: largest registration shift searched
MIN_OVERLAP = 0.90  # share of the plate that must sit on the pose after registration
OVERLAP = 12  # px: how far a part reaches under the body
MIN_PIECE = 0.002  # a piece smaller than this share of the pose is noise (specks of the subtraction)
COLOUR_DIFF = 48  # max channel difference that counts as "this pixel was redrawn"
COLOUR_ERODE = 3  # px: colour differences thinner than this are registration noise
EDGE = 2  # px: grow the subtraction so the part keeps its own outline antialiasing

# mean colour difference (0..255) and share of mismatching pixels allowed between the stacked layers and the pose
MAX_MEAN_DIFF = 6.0
MAX_BAD_SHARE = 0.03


@dataclass
class Piece:
    name: str
    mask: np.ndarray
    pivot: tuple[float, float]  # normalised on the canvas
    area: int = 0
    bbox: tuple[int, int, int, int] = (0, 0, 0, 0)  # left, top, right, bottom


@dataclass
class CutResult:
    canvas: tuple[int, int]
    shift: tuple[int, int]
    overlap: float
    body: np.ndarray
    pieces: list[Piece]
    layers: dict[str, np.ndarray] = field(default_factory=dict)
    body_name: str = "body"
    behind: set[str] = field(default_factory=set)
    mean_diff: float = 0.0
    bad_share: float = 0.0
    problems: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- geometry helpers


def shift_image(a: np.ndarray, dx: int, dy: int) -> np.ndarray:
    """Shift an (H, W[, C]) array by (dx, dy), filling with zeros (no wrap-around)."""
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    ys, yd = (slice(max(0, -dy), min(h, h - dy)), slice(max(0, dy), min(h, h + dy)))
    xs, xd = (slice(max(0, -dx), min(w, w - dx)), slice(max(0, dx), min(w, w + dx)))
    out[yd, xd] = a[ys, xs]
    return out


def register(pose_alpha: np.ndarray, plate_alpha: np.ndarray, radius: int = SHIFT) -> tuple[int, int, float]:
    """Best (dx, dy) that moves the plate onto the pose, and the share of plate pixels then on pose pixels."""
    pa, qa = pose_alpha > OPAQUE, plate_alpha > OPAQUE
    if not qa.any():
        return 0, 0, 0.0
    step = 4
    small_p, small_q = pa[::step, ::step], qa[::step, ::step]
    best = (-1.0, 0, 0)
    r = max(1, radius // step + 1)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            s = shift_image(small_q, dx, dy)
            score = (small_p & s).sum() / max(1, s.sum())
            if score > best[0]:
                best = (score, dx, dy)
    cx, cy = best[1] * step, best[2] * step
    top = (-1.0, cx, cy)
    for dy in range(cy - step, cy + step + 1):
        for dx in range(cx - step, cx + step + 1):
            if abs(dx) > radius or abs(dy) > radius:
                continue
            s = shift_image(qa, dx, dy)
            score = (pa & s).sum() / max(1, s.sum())
            if score > top[0]:
                top = (score, dx, dy)
    return top[1], top[2], float(top[0])


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    """Square dilation by r pixels (shifted ORs)."""
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        m[1:, :] |= out[:-1, :]
        m[:-1, :] |= out[1:, :]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


def components(mask: np.ndarray, block: int = 4) -> tuple[np.ndarray, int]:
    """8-connected labels, computed on a coarse grid for speed, then expanded to pixels."""
    h, w = mask.shape
    gh, gw = -(-h // block), -(-w // block)
    pad = np.zeros((gh * block, gw * block), dtype=bool)
    pad[:h, :w] = mask
    occ = pad.reshape(gh, block, gw, block).any(axis=(1, 3))
    labels, n = cutout._label_grid(occ)
    full = np.repeat(np.repeat(labels, block, axis=0), block, axis=1)[:h, :w]
    full[~mask] = 0
    return full, n


# ---------------------------------------------------------------- the cut


def parse_region(text: str) -> tuple[str, tuple[float, float, float, float]]:
    name, box = text.split("=", 1)
    x0, y0, x1, y1 = (float(v) for v in box.split(","))
    return name, (x0, y0, x1, y1)


def cut(pose: np.ndarray, plate: np.ndarray, regions: list[tuple[str, tuple[float, float, float, float]]], *,
        body_name: str = "body", overlap: int = OVERLAP, behind: frozenset[str] = frozenset(),
        pivots: dict[str, tuple[float, float]] | None = None) -> CutResult:
    """Cut `pose` into a body layer and named part layers using `plate`. Both are RGBA arrays on one canvas."""
    if pose.shape != plate.shape and max(abs(a - b) for a, b in zip(pose.shape[:2], plate.shape[:2])) <= 3:
        # Codex sometimes returns a canvas 1 or 2 px off; pad or trim the bottom and right edges.
        fixed = np.zeros_like(pose)
        hh, ww = min(pose.shape[0], plate.shape[0]), min(pose.shape[1], plate.shape[1])
        fixed[:hh, :ww] = plate[:hh, :ww]
        plate = fixed
    if pose.shape != plate.shape:
        raise ValueError(f"plate canvas {plate.shape[1]}x{plate.shape[0]} differs from pose {pose.shape[1]}x{pose.shape[0]}")
    h, w = pose.shape[:2]
    dx, dy, ov = register(pose[..., 3], plate[..., 3])
    res = CutResult(canvas=(w, h), shift=(dx, dy), overlap=ov, body=plate, pieces=[])
    if ov < MIN_OVERLAP:
        res.problems.append(f"plate does not register with the pose (overlap {ov:.0%}, need {MIN_OVERLAP:.0%}): "
                            "wrong scale, position or a different drawing")
        return res
    body = np.zeros_like(plate)
    body[:] = shift_image(plate, dx, dy)
    res.body = body

    pa = pose[..., 3] > OPAQUE
    ba = body[..., 3] > OPAQUE
    # What the pose has and the body lacks. The body is grown by 1 px so registration noise on outlines is ignored.
    alpha_diff = pa & ~dilate(ba, 1)
    # Parts drawn INSIDE the body (eyes, mouth) leave no alpha difference: find them by colour where both are drawn,
    # eroded first so a 1 to 3 px outline shift is not mistaken for a part.
    both = pa & ba
    strong = both & (np.abs(pose[..., :3].astype(int) - body[..., :3].astype(int)).max(axis=2) > COLOUR_DIFF)
    interior_diff = dilate(~dilate(~strong, COLOUR_ERODE), COLOUR_ERODE + 1) & both
    diff = alpha_diff | interior_diff
    labels, n = components(diff)
    min_px = max(1, int(MIN_PIECE * pa.sum()))
    ys, xs = np.mgrid[0:h, 0:w]
    claimed: dict[str, np.ndarray] = {}
    for lab in range(1, n + 1):
        comp = labels == lab
        if comp.sum() < min_px:
            continue
        cy, cx = float(ys[comp].mean()) / h, float(xs[comp].mean()) / w
        name = next((nm for nm, (x0, y0, x1, y1) in regions if x0 <= cx <= x1 and y0 <= cy <= y1), None)
        if name is None:
            res.problems.append(f"piece at ({cx:.2f}, {cy:.2f}) of {int(comp.sum())} px matches no region")
            continue
        claimed[name] = claimed.get(name, np.zeros_like(diff)) | comp
    claimed = {k: v for k, v in claimed.items() if not k.startswith("_")}
    for name, _ in regions:
        if name not in claimed and not name.startswith("_"):
            res.problems.append(f"region {name} received no piece")

    for name, comp in claimed.items():
        grown = dilate(comp, EDGE)
        # Reach under the body, so a rotating part never shows a gap at its root.
        # A part inside the body (no alpha difference of its own) has nothing to tuck under.
        inside = not (comp & alpha_diff).any()
        under = grown & pa if inside else dilate(grown, overlap) & pa
        mask = grown & pa | (under & ba)
        layer = np.zeros_like(pose)
        layer[mask] = pose[mask]
        contact = dilate(grown, 3) & ba
        if contact.any():
            cyx = (float(ys[contact].mean()) / h, float(xs[contact].mean()) / w)
        else:
            cyx = (float(ys[comp].mean()) / h, float(xs[comp].mean()) / w)
        pb = np.nonzero(mask.any(axis=0))[0], np.nonzero(mask.any(axis=1))[0]
        if pivots and name in pivots:
            # u, v are fractions of the part's own box (0,0 top-left): easier to read than canvas coordinates.
            u, v = pivots[name]
            x0, x1, y0, y1 = int(pb[0][0]), int(pb[0][-1]) + 1, int(pb[1][0]), int(pb[1][-1]) + 1
            cyx = (( y0 + v * (y1 - y0)) / h, (x0 + u * (x1 - x0)) / w)
        res.pieces.append(Piece(name=name, mask=mask, pivot=(cyx[1], cyx[0]), area=int(comp.sum()),
                                bbox=(int(pb[0][0]), int(pb[1][0]), int(pb[0][-1]) + 1, int(pb[1][-1]) + 1)))
        res.layers[name] = layer
    # The visible body keeps the approved pose pixels exactly; the plate fills only what a part used to cover.
    covered = np.zeros_like(pa)
    for pc in res.pieces:
        covered |= dilate(pc.mask, 1)
    keep = ba & pa & ~covered
    body[keep] = pose[keep]
    # Away from every part the body IS the approved pose, outline and all; the redrawn plate only fills what a part
    # used to cover.
    zone = np.zeros_like(pa)
    for pc in res.pieces:
        zone |= dilate(pc.mask, overlap + 2)
    far = ~zone
    body[far] = pose[far]
    res.body = body
    res.layers[body_name] = body
    res.body_name, res.behind = body_name, set(behind)
    stack(res, pose)
    return res


def over(dst: np.ndarray, src: np.ndarray) -> np.ndarray:
    """Alpha-composite src over dst (both uint8 RGBA, straight alpha)."""
    d, s = dst.astype(np.float32) / 255.0, src.astype(np.float32) / 255.0
    a = s[..., 3:4] + d[..., 3:4] * (1 - s[..., 3:4])
    rgb = (s[..., :3] * s[..., 3:4] + d[..., :3] * d[..., 3:4] * (1 - s[..., 3:4])) / np.maximum(a, 1e-6)
    return np.rint(np.concatenate([rgb, a], axis=-1) * 255).astype(np.uint8)


def stack(res: CutResult, pose: np.ndarray, order: list[str] | None = None) -> None:
    """Composite the layers at rest, parts behind or in front as `order` says (default: parts under the body
    first, i.e. body last), and compare with the pose."""
    parts = [n for n in res.layers if n != res.body_name]
    names = order or [n for n in parts if n in res.behind] + [res.body_name] + [n for n in parts if n not in res.behind]
    out = np.zeros_like(pose)
    for n in names:
        out = over(out, res.layers[n])
    both = (out[..., 3] > OPAQUE) | (pose[..., 3] > OPAQUE)
    if not both.any():
        return
    diff = np.abs(out[..., :3].astype(int) - pose[..., :3].astype(int)).mean(axis=-1)
    alpha_off = np.abs(out[..., 3].astype(int) - pose[..., 3].astype(int)) > 96
    res.mean_diff = float(diff[both].mean())
    res.bad_share = float((alpha_off | (diff > 48))[both].mean())
    if res.mean_diff > MAX_MEAN_DIFF:
        res.problems.append(f"layers stacked at rest differ from the pose (mean {res.mean_diff:.1f} > {MAX_MEAN_DIFF})")
    if res.bad_share > MAX_BAD_SHARE:
        res.problems.append(f"{res.bad_share:.1%} of pixels differ strongly from the pose (> {MAX_BAD_SHARE:.0%})")


# ---------------------------------------------------------------- export


def export(res: CutResult, mascot: str, display: tuple[int, int], *, crop: tuple[int, int, int, int],
           assets_root: Path = cutout.ASSETS_ROOT, source: str = "codex", z: dict[str, int] | None = None,
           masters: dict[str, str] | None = None, motion: dict[str, str] | None = None) -> dict[str, dict]:
    """Write every layer on the same cropped canvas at 2x display, and merge manifest `part` entries."""
    l, t, r, b = crop
    cw, ch = r - l, b - t
    size = cutout.fit_size(cw, ch, 2 * display[0], 2 * display[1])
    out_dir = assets_root / "cutouts" / mascot
    manifest = assets_root / "manifests" / "manifest.json"
    entries: dict[str, dict] = {}
    pieces = {p.name: p for p in res.pieces}
    for name, layer in res.layers.items():
        crop_img = np.ascontiguousarray(layer[t:b, l:r])
        crop_img[crop_img[..., 3] == 0, :3] = 0
        small = cutout.resize_premultiplied(crop_img, size)
        png, webp = cutout.encode_png(small), cutout.encode_webp(small)[0]
        cutout.atomic_write_bytes(out_dir / f"{name}.png", png)
        cutout.atomic_write_bytes(out_dir / f"{name}.webp", webp)
        piece = pieces.get(name)
        pivot = ((piece.pivot[0] * res.canvas[0] - l) / cw, (piece.pivot[1] * res.canvas[1] - t) / ch) if piece else (0.5, 1.0)
        asset_id = f"{mascot}/{name}"
        reasons = res.problems
        entry = {
            "id": asset_id,
            "mascot": mascot,
            "kind": "part",
            "status": "pass" if not reasons else "fail",
            "source": source,
            "master": (masters or {}).get(name),
            "files": {"png": f"cutouts/{mascot}/{name}.png", "webp": f"cutouts/{mascot}/{name}.webp"},
            "size": {"w": size[0], "h": size[1]},
            "display": {"w": int(round(size[0] / 2)), "h": int(round(size[1] / 2))},
            "canvas": {"w": size[0], "h": size[1]},
            "origin": {"x": 0.0, "y": 0.0},
            "pivot": {"x": round(min(1.0, max(0.0, pivot[0])), 4), "y": round(min(1.0, max(0.0, pivot[1])), 4)},
            "group": mascot,
            "bytes": {"png": len(png), "webp": len(webp)},
            "qa": {"ok": not reasons, "reasons": list(reasons), "attempts": 1,
                   "rest_mean_diff": round(res.mean_diff, 2), "rest_bad_share": round(res.bad_share, 4)},
            "alt": None,
            "fallback": f"{mascot}/pose",
        }
        if z and name in z:
            entry["z"] = z[name]
        if motion and name in motion:
            entry["motion"] = motion[name]
        cutout.merge_entry(manifest, entry)
        entries[name] = entry
    return entries


def union_crop(pose: np.ndarray, res: CutResult, margin: int = 8) -> tuple[int, int, int, int]:
    a = np.zeros(pose.shape[:2], dtype=bool)
    a |= pose[..., 3] > 0
    for layer in res.layers.values():
        a |= layer[..., 3] > 0
    ys, xs = np.nonzero(a)
    h, w = a.shape
    return (max(0, int(xs.min()) - margin), max(0, int(ys.min()) - margin),
            min(w, int(xs.max()) + 1 + margin), min(h, int(ys.max()) + 1 + margin))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--mascot", required=True)
    p.add_argument("--pose", type=Path, required=True)
    p.add_argument("--plate", type=Path, required=True)
    p.add_argument("--display", required=True, help="display box WxH in CSS px (the roster size)")
    p.add_argument("--part", action="append", required=True, help="name=x0,y0,x1,y1 (normalised canvas box)")
    p.add_argument("--body-name", default="body")
    p.add_argument("--overlap", type=int, default=OVERLAP)
    p.add_argument("--pivot", action="append", default=[], help="name=u,v: pivot as a fraction of the part box")
    p.add_argument("--behind", default="", help="comma list of parts drawn behind the body (default: in front)")
    p.add_argument("--dry-run", action="store_true", help="measure and preview only; write nothing to the manifest")
    p.add_argument("--preview", type=Path, help="write a contact sheet PNG of the layers")
    args = p.parse_args(argv)

    pose = np.asarray(Image.open(args.pose).convert("RGBA")).copy()
    plate = np.asarray(Image.open(args.plate).convert("RGBA")).copy()
    for img in (pose, plate):
        img[..., 3] = cutout.snap_alpha(img[..., 3])
    regions = [parse_region(t) for t in args.part]
    behind = frozenset(v for v in args.behind.split(",") if v)
    pivots: dict[str, tuple[float, float]] = {}
    for s in args.pivot:
        n, uv = s.split("=", 1)
        u, v = (float(x) for x in uv.split(","))
        pivots[n] = (u, v)
    res = cut(pose, plate, regions, body_name=args.body_name, overlap=args.overlap, behind=behind, pivots=pivots)
    report = {
        "canvas": res.canvas, "shift": res.shift, "overlap": round(res.overlap, 4),
        "pieces": {pc.name: {"px": pc.area, "pivot": [round(v, 3) for v in pc.pivot], "bbox": pc.bbox} for pc in res.pieces},
        "rest_mean_diff": round(res.mean_diff, 2), "rest_bad_share": round(res.bad_share, 4), "problems": res.problems,
    }
    print(json.dumps(report, indent=2))
    if args.preview and res.layers:
        names = list(res.layers)
        tiles = []
        for n in names:
            bg = np.full(res.layers[n].shape[:3], 255, dtype=np.uint8)
            tiles.append(over(np.dstack([bg[..., :3], np.full(bg.shape[:2], 255, dtype=np.uint8)]), res.layers[n])[..., :3])
        sheet = np.concatenate(tiles, axis=1)
        Image.fromarray(sheet).resize((sheet.shape[1] // 3, sheet.shape[0] // 3)).save(args.preview)
    if res.problems or args.dry_run:
        return 1 if res.problems else 0
    w, h = (int(v) for v in args.display.lower().split("x"))
    export(res, args.mascot, (w, h), crop=union_crop(pose, res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
