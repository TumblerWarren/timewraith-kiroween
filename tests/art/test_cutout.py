"""Tests for tools/art/cutout.py on synthetic RGBA images."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools" / "art"))

import cutout  # noqa: E402


def _subject(h: int = 200, w: int = 400) -> np.ndarray:
    """A cream disc with a dark ink ring, interior alpha 252 like the Codex output, plus 1 to 2 haze."""
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(yy - h / 2, xx - w / 2)
    img = np.zeros((h, w, 4), dtype=np.uint8)
    disc = r < 60
    img[disc] = (240, 230, 210, 252)
    img[(r >= 54) & disc, :3] = (41, 39, 32)
    rim = (r >= 60) & (r < 62)
    img[rim] = (41, 39, 32, 120)
    rng = np.random.default_rng(1)
    haze = rng.random((h, w)) < 0.01
    img[haze & ~disc & ~rim, 3] = rng.integers(1, 3, size=int(np.count_nonzero(haze & ~disc & ~rim)))
    return img


def test_snap_alpha_bounds() -> None:
    a = np.array([0, 1, 2, 8, 9, 120, 239, 240, 252, 255], dtype=np.uint8)
    out = cutout.snap_alpha(a)
    assert out.tolist() == [0, 0, 0, 0, 9, 120, 239, 255, 255, 255]
    assert a[8] == 252  # input untouched


def test_remove_specks_drops_far_blob_keeps_subject() -> None:
    a = np.zeros((200, 400), dtype=np.uint8)
    a[50:150, 50:150] = 255  # main subject
    a[10:13, 380:383] = 200  # far speck
    a[100:103, 155:158] = 200  # small detail right next to the subject
    out, removed = cutout.remove_specks(a)
    assert removed == 9
    assert out[10:13, 380:383].max() == 0
    assert out[100:103, 155:158].min() == 200
    assert np.array_equal(out[50:150, 50:150], a[50:150, 50:150])


def test_trim_adds_margin_and_transparent_corners() -> None:
    img = np.zeros((100, 300, 4), dtype=np.uint8)
    img[20:60, 100:180] = (10, 20, 30, 255)
    out = cutout.trim(img, margin_frac=0.0, min_margin=5)
    assert out.shape[:2] == (40 + 10, 80 + 10)
    assert out[0, 0, 3] == 0 and out[-1, -1, 3] == 0
    assert out[5, 5, 3] == 255


def test_resize_premultiplied_no_dark_fringe() -> None:
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    img[16:48, 16:48] = (250, 250, 250, 255)  # white square; RGB under alpha 0 is black
    out = cutout.resize_premultiplied(img, (21, 21))
    edge = (out[..., 3] > 10) & (out[..., 3] < 245)
    assert edge.any()
    assert out[edge][:, :3].min() > 200  # a straight resize would pull these towards black


def test_process_writes_files_and_manifest_entry(tmp_path: Path) -> None:
    root = tmp_path / "assets"
    master = root / "masters" / "mini-bat" / "pose-rest-v01.png"
    master.parent.mkdir(parents=True)
    Image.fromarray(_subject()).save(master)
    manifest = root / "manifests" / "manifest.json"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(json.dumps({"schemaVersion": 1, "keyColor": "#FF00FF",
                                    "assets": {"other/pose": {"id": "other/pose", "kind": "pose", "status": "placeholder"}}}))

    entry = cutout.process(master, "mini-bat/pose-rest", display_box=(100, 80), pivot=(0.5, 0.5),
                           alt="Mini Bat", attempts=2, assets_root=root)

    assert entry["status"] == "pass", entry["qa"]
    assert set(entry) == {"id", "mascot", "kind", "status", "source", "master", "files", "size", "display",
                          "pivot", "bytes", "qa", "alt", "fallback"}
    assert entry["master"] == "masters/mini-bat/pose-rest-v01.png"
    assert entry["files"] == {"png": "cutouts/mini-bat/pose-rest.png", "webp": "cutouts/mini-bat/pose-rest.webp"}
    assert entry["size"]["w"] <= 200 and entry["size"]["h"] <= 160
    assert max(entry["size"]["w"] - 200, entry["size"]["h"] - 160) == 0  # fills the 2x box on one axis
    assert entry["qa"] == {"ok": True, "reasons": [], "attempts": 2}
    png = Image.open(root / entry["files"]["png"])
    assert png.mode == "RGBA" and png.size == (entry["size"]["w"], entry["size"]["h"])
    assert (root / entry["files"]["webp"]).stat().st_size == entry["bytes"]["webp"] <= 300 * 1024

    data = json.loads(manifest.read_text())
    assert data["schemaVersion"] == 1
    assert set(data["assets"]) == {"other/pose", "mini-bat/pose-rest"}  # merged, not replaced
    assert data["assets"]["mini-bat/pose-rest"]["id"] == "mini-bat/pose-rest"
    assert not list(manifest.parent.glob("*.tmp"))


def test_qa_flags_opaque_corners_and_forced_fail(tmp_path: Path) -> None:
    opaque = np.full((50, 50, 4), 255, dtype=np.uint8)
    reasons = cutout.qa_check(opaque, 1000)
    assert "corner pixels are not transparent" in reasons
    assert any("alpha levels" in r for r in reasons)

    root = tmp_path / "assets"
    master = root / "masters" / "x" / "pose-v01.png"
    master.parent.mkdir(parents=True)
    Image.fromarray(_subject()).save(master)
    entry = cutout.process(master, "x/pose", display_box=(50, 50), extra_reasons=["style: text in image"],
                           assets_root=root)
    assert entry["status"] == "fail"
    assert entry["qa"]["reasons"] == ["style: text in image"]
