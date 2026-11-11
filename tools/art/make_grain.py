"""Paper grain texture for the landing page (visual revision R1).

    python tools/art/make_grain.py            -> frontend/src/assets/textures/grain.png
    python tools/art/make_grain.py --out x.png

The texture is a 256 x 256 tile of sparse ink and paper specks on a fully transparent ground, so it can be
layered over any palette color:

* dark specks (gray 40) darken a surface, light specks (gray 236) lift it a little;
* the speck density follows a soft, periodic mottle, so the paper looks uneven rather than evenly noisy;
* the mottle is filtered on a torus (FFT), and the specks are per-pixel, so the tile repeats without seams.

The PNG is a small palette image (one fully transparent entry plus a few gray/alpha entries), which keeps the
file well under 25 KB. Same seed, same bytes. Needs only Pillow and numpy.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 256
SEED = 1031  # 31 Oct, 23:59 is taken by the hero clock; the seed only has to be fixed.

DARK = 40
LIGHT = 236
# (gray, alpha) palette entries after the transparent entry 0.
LEVELS: tuple[tuple[int, int], ...] = (
    (DARK, 18),
    (DARK, 36),
    (DARK, 64),
    (LIGHT, 30),
    (LIGHT, 56),
)

# Fraction of pixels that carry a speck, at the mean of the mottle.
DARK_DENSITY = 0.08
LIGHT_DENSITY = 0.05

REPO = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO / "frontend" / "src" / "assets" / "textures" / "grain.png"


def periodic_mottle(rng: np.random.Generator, size: int, sigma: float) -> np.ndarray:
    """Gaussian-filtered white noise on a torus, scaled to [0, 1]. Tiles without seams."""
    noise = rng.standard_normal((size, size))
    freq = np.fft.fftfreq(size)
    fx, fy = np.meshgrid(freq, freq)
    kernel = np.exp(-2.0 * (np.pi * sigma) ** 2 * (fx**2 + fy**2))
    field = np.real(np.fft.ifft2(np.fft.fft2(noise) * kernel))
    field -= field.min()
    peak = field.max()
    return field / peak if peak > 0 else field


def make_grain(size: int = SIZE, seed: int = SEED) -> np.ndarray:
    """Palette indices (uint8, size x size): 0 transparent, 1..len(LEVELS) the LEVELS entries."""
    rng = np.random.default_rng(seed)
    mottle = 0.35 + 1.3 * periodic_mottle(rng, size, sigma=9.0)  # density multiplier, mean about 1
    u = rng.random((size, size))
    strength = rng.random((size, size))

    idx = np.zeros((size, size), dtype=np.uint8)
    dark = u < DARK_DENSITY * mottle
    light = (~dark) & (u > 1.0 - LIGHT_DENSITY * (2.0 - mottle))
    # Dark specks: mostly faint, a few strong.
    idx[dark & (strength < 0.55)] = 1
    idx[dark & (strength >= 0.55) & (strength < 0.88)] = 2
    idx[dark & (strength >= 0.88)] = 3
    idx[light & (strength < 0.6)] = 4
    idx[light & (strength >= 0.6)] = 5
    return idx


def to_image(idx: np.ndarray) -> Image.Image:
    img = Image.fromarray(idx, mode="P")
    palette = [0, 0, 0]
    alphas = [0]
    for gray, alpha in LEVELS:
        palette += [gray, gray, gray]
        alphas.append(alpha)
    img.putpalette(palette + [0, 0, 0] * (256 - len(alphas)))
    img.info["transparency"] = bytes(alphas)
    return img


def rgba(idx: np.ndarray) -> np.ndarray:
    """Float RGBA in [0, 1] (gray, gray, gray, alpha), for tests and stats."""
    gray = np.zeros(idx.shape)
    alpha = np.zeros(idx.shape)
    for i, (g, a) in enumerate(LEVELS, start=1):
        gray[idx == i] = g / 255.0
        alpha[idx == i] = a / 255.0
    return np.stack([gray, gray, gray, alpha], axis=-1)


def save(out: Path = DEFAULT_OUT, size: int = SIZE, seed: int = SEED) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    to_image(make_grain(size, seed)).save(out, format="PNG", optimize=True, transparency=bytes([0] + [a for _, a in LEVELS]))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()
    path = save(args.out, SIZE, args.seed)
    print(f"grain: wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
