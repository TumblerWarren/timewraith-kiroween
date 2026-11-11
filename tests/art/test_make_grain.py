"""Tests for tools/art/make_grain.py (visual revision R1: paper grain)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools" / "art"))

import make_grain  # noqa: E402

# Palette colors from frontend/src/styles/tokens.css.
PAPER_100 = (0xF8, 0xF0, 0xDE)
PARCHMENT_200 = (0xEC, 0xE1, 0xCA)
MOON_200 = (0xE8, 0xD9, 0xBC)
TOWER_950 = (0x24, 0x25, 0x1F)
INK_900 = (0x29, 0x27, 0x20)
WALNUT_700 = (0x4D, 0x43, 0x36)
SAGE_700 = (0x52, 0x6B, 0x50)
BRICK_700 = (0x91, 0x3E, 0x33)
PAPER_TEXT = PAPER_100


def _lum(rgb) -> float:
    def ch(v: float) -> float:
        s = v / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def _ratio(a, b) -> float:
    la, lb = _lum(a), _lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def _composited_mean(bg) -> tuple[float, float, float]:
    """Mean color of the grain composited at full strength (source-over) on a flat background."""
    px = make_grain.rgba(make_grain.make_grain())
    a = px[..., 3:4]
    out = np.asarray(bg, dtype=float) / 255.0 * (1 - a) + px[..., :3] * a
    m = out.reshape(-1, 3).mean(axis=0) * 255.0
    return (float(m[0]), float(m[1]), float(m[2]))


def test_written_file_is_small_tileable_palette_png(tmp_path: Path) -> None:
    out = make_grain.save(tmp_path / "grain.png")
    assert out.stat().st_size < 25 * 1024
    img = Image.open(out)
    assert img.size == (256, 256)
    assert img.mode == "P"
    rgba = np.asarray(img.convert("RGBA"))
    alpha = rgba[..., 3]
    assert (alpha == 0).mean() > 0.7  # mostly transparent ground
    assert len(np.unique(alpha)) >= 3  # more than one speck strength


def test_is_deterministic_and_seeded() -> None:
    a = make_grain.make_grain()
    assert np.array_equal(a, make_grain.make_grain())
    assert not np.array_equal(a, make_grain.make_grain(seed=make_grain.SEED + 1))


def test_tiles_without_a_seam() -> None:
    """Speck density across the wrap-around edge matches the density inside the tile."""
    alpha = make_grain.rgba(make_grain.make_grain())[..., 3]
    inner = alpha[:, 120:136].mean()
    seam = np.concatenate([alpha[:, -8:], alpha[:, :8]], axis=1).mean()
    assert abs(seam - inner) < 0.6 * inner


def test_committed_texture_matches_generator() -> None:
    committed = np.asarray(Image.open(make_grain.DEFAULT_OUT).convert("RGBA"))
    fresh = make_grain.to_image(make_grain.make_grain()).convert("RGBA")
    fresh.info.pop("transparency", None)
    assert committed.shape == (256, 256, 4)
    assert np.array_equal(committed[..., 3] > 0, np.asarray(fresh)[..., 3] > 0)


def test_grain_keeps_every_text_pair_above_its_threshold() -> None:
    """At full strength (CSS opacity only weakens it) the grain must not push an allowed pair below 4.5:1."""
    light_pairs = [
        (INK_900, PAPER_100),
        (WALNUT_700, PAPER_100),
        (SAGE_700, PAPER_100),
        (BRICK_700, PAPER_100),
        (INK_900, PARCHMENT_200),
        (WALNUT_700, PARCHMENT_200),
        # sage-700 on parchment-200 (4.53) has no margin; grained parchment drops it below 4.5, so the page
        # uses sage-700 status text on paper-100 only (design: Visual revision R1).
        (BRICK_700, PARCHMENT_200),
        (INK_900, MOON_200),
    ]
    for fg, bg in light_pairs:
        assert _ratio(fg, _composited_mean(bg)) >= 4.5, (fg, bg)
    assert _ratio(PAPER_TEXT, _composited_mean(TOWER_950)) >= 4.5
    assert _ratio(PAPER_TEXT, _composited_mean(WALNUT_700)) >= 4.5
