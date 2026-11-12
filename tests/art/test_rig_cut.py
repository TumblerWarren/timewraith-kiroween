"""Tests for tools/art/rig_cut.py on synthetic RGBA images: a disc body with two rectangular arms."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools" / "art"))
import rig_cut  # noqa: E402

H, W = 300, 400
REGIONS = [("arm-l", (0.0, 0.0, 0.5, 1.0)), ("arm-r", (0.5, 0.0, 1.0, 1.0))]


def _body() -> np.ndarray:
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.zeros((H, W, 4), dtype=np.uint8)
    disc = np.hypot(yy - 150, xx - 200) < 70
    img[disc] = (240, 230, 210, 255)
    return img


def _pose() -> np.ndarray:
    img = _body()
    img[140:160, 60:140] = (200, 90, 60, 255)  # left arm, touches the disc
    img[140:160, 260:340] = (60, 90, 200, 255)  # right arm
    return img


def test_cut_names_parts_by_region_and_stacks_back_to_the_pose() -> None:
    res = rig_cut.cut(_pose(), _body(), REGIONS)
    assert res.problems == []
    assert {p.name for p in res.pieces} == {"arm-l", "arm-r"}
    assert set(res.layers) == {"arm-l", "arm-r", "body"}
    assert res.mean_diff < 1.0
    assert res.bad_share < rig_cut.MAX_BAD_SHARE


def test_part_layers_hold_only_their_own_pixels() -> None:
    res = rig_cut.cut(_pose(), _body(), REGIONS)
    left = res.layers["arm-l"]
    assert left[150, 70, 3] == 255 and left[150, 330, 3] == 0
    right = res.layers["arm-r"]
    assert right[150, 330, 3] == 255 and right[150, 70, 3] == 0
    # The pivot sits at the contact with the body, on the arm's side of it.
    left_pivot = next(p for p in res.pieces if p.name == "arm-l").pivot
    assert 0.3 < left_pivot[0] < 0.5


def test_a_piece_in_no_region_is_reported() -> None:
    res = rig_cut.cut(_pose(), _body(), [("arm-l", (0.0, 0.0, 0.5, 1.0))])
    assert any("matches no region" in p for p in res.problems)


def test_a_region_without_a_piece_is_reported() -> None:
    res = rig_cut.cut(_body(), _body(), REGIONS)
    assert any("received no piece" in p for p in res.problems)


def test_a_plate_of_another_canvas_is_refused() -> None:
    try:
        rig_cut.cut(_pose(), _body()[:200], REGIONS)
    except ValueError as exc:
        assert "canvas" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def _disc(radius: int) -> np.ndarray:
    yy, xx = np.mgrid[0:H, 0:W]
    plate = np.zeros((H, W, 4), dtype=np.uint8)
    plate[np.hypot(yy - 150, xx - 200) < radius] = (240, 230, 210, 255)
    return plate


def test_a_plate_drawn_too_large_does_not_register() -> None:
    res = rig_cut.cut(_pose(), _disc(120), REGIONS)
    assert any("does not register" in p for p in res.problems)


def test_a_plate_drawn_too_small_fails_the_stack_check() -> None:
    res = rig_cut.cut(_pose(), _disc(30), REGIONS)
    assert res.problems

def test_register_finds_a_small_shift() -> None:
    a = _body()[..., 3]
    shifted = rig_cut.shift_image(_body(), 2, -1)[..., 3]
    dx, dy, ov = rig_cut.register(a, shifted)
    assert (dx, dy) == (-2, 1) and ov > 0.99
