"""Sandbox folder mounts: bind mounts on a PC, volume subfolders when the backend itself runs in Docker."""

from __future__ import annotations

from pathlib import Path

from timewraith.config import Settings
from timewraith.sandbox import _mount


def test_pc_mounts_the_folder_itself(tmp_path: Path) -> None:
    s = Settings(data_dir=tmp_path)
    ws = tmp_path / "workspaces" / "c1" / "repo"
    assert _mount(s, ws, "/work", False) == f"type=bind,source={ws},target=/work"
    assert _mount(s, ws, "/work", True).endswith(",readonly")


def test_in_docker_mounts_one_folder_of_the_data_volume(tmp_path: Path) -> None:
    s = Settings(data_dir=tmp_path, data_volume="timewraith-data")
    ws = tmp_path / "workspaces" / "c1" / "repo"
    assert _mount(s, ws, "/work", True) == (
        "type=volume,source=timewraith-data,target=/work,volume-subpath=workspaces/c1/repo,readonly"
    )
    probe = _mount(s, ws / ".tw" / "probe", "/work/.tw/probe", False)
    assert (
        probe == "type=volume,source=timewraith-data,target=/work/.tw/probe,volume-subpath=workspaces/c1/repo/.tw/probe"
    )
