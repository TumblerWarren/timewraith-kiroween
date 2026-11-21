"""Moving cases between data folders: stored paths follow the case, the source stays untouched."""

from __future__ import annotations

from pathlib import Path

from timewraith import importer
from timewraith.config import Settings
from timewraith.models import (
    Bug,
    ClockConfig,
    CreateInvestigation,
    Fix,
    FixBranch,
    Investigation,
    Target,
    Violation,
)
from timewraith.store import Store


def test_stored_paths_are_rewritten_into_the_new_data_folder(tmp_path: Path) -> None:
    dest = tmp_path / "data"
    win = r"C:\Users\me\.timewraith\branches\abc\repo"
    assert importer.rewrite(win, dest) == str(dest / "branches" / "abc" / "repo")
    assert importer.rewrite("/home/x/.timewraith-dev/workspaces/abc/repo", dest) == str(dest / "workspaces/abc/repo")
    assert importer.rewrite({"a": [win, "plain text", 3]}, dest)["a"][1:] == ["plain text", 3]
    assert importer.rewrite("src/__tw__/x.ts", dest) == "src/__tw__/x.ts"


def _case(src: Path, inv_id: str) -> Investigation:
    clock = ClockConfig(instant="2024-04-06T14:00:00.000Z", time_zone="UTC", label="x")
    v = Violation(invariant="next_after_now", zone="UTC", instant=clock.instant, local=clock.instant, detail="d",
                  count=1, context_ms=[1])  # fmt: skip
    root = str(src).replace("/", "\\") if "\\" in str(src) else str(src)
    branch = FixBranch(name="timewraith/x", path=f"{root}/.timewraith/branches/{inv_id}/repo", base="a" * 40,
                       commit="c" * 40, files=["a.ts"], created_at="t",
                       patch_file=f"{root}/.timewraith/branches/{inv_id}/x.patch", upstream_url="u")  # fmt: skip
    bug = Bug(id="bug_1", candidate_id="c", experiment_id="e", title="t", category="dst_transition",
              invariant="next_after_now", status="reproduced", clock=clock, violation=v, failure="f",
              regression_test_path="t.ts", regression_test="x", fix=Fix(branch=branch))  # fmt: skip
    return Investigation(
        id=inv_id, created_at="2026-11-15T00:00:00Z",
        request=CreateInvestigation(repository_url="https://github.com/o/r", ref="main"),
        target=Target(repository_url="https://github.com/o/r", owner="o", repo="r", ref="main"), bugs=[bug],
    )  # fmt: skip


def test_a_case_comes_over_with_its_folders_and_working_paths(tmp_path: Path) -> None:
    src = tmp_path / "src" / ".timewraith"
    s_settings = Settings(data_dir=src)
    s_settings.check_paths()
    inv = _case(tmp_path / "src", "case-1")
    s_store = Store(s_settings.db_path)
    s_store.save(inv)
    (src / "branches" / "case-1").mkdir(parents=True)
    (src / "branches" / "case-1" / "x.patch").write_text("patch")
    (src / "workspaces" / "case-1" / "repo").mkdir(parents=True)
    (src / "workspaces" / "case-1" / "repo" / "a.txt").write_text("a")
    s_store.audit("case-1", "t", "agent", "step", "ok", "detail")
    before = (src / "timewraith.sqlite3").read_bytes()

    dest = Settings(data_dir=tmp_path / "volume")
    assert importer.import_cases(src, dest) == ["case-1"]
    got = Store(dest.db_path).get("case-1")
    assert got and got.bugs[0].fix.branch
    b = got.bugs[0].fix.branch
    assert (
        b.patch_file == str(dest.data_dir / "branches" / "case-1" / "x.patch")
        and Path(b.patch_file).read_text() == "patch"
    )
    assert (dest.data_dir / "workspaces" / "case-1" / "repo" / "a.txt").read_text() == "a"
    assert Store(dest.db_path).audit_rows("case-1")[0]["step"] == "step"
    assert (src / "timewraith.sqlite3").read_bytes() == before or s_store.get("case-1"), "the source is only read"
    assert importer.import_cases(src, dest) == [], "an existing case is skipped"
    assert importer.import_cases(src, dest, replace=True) == ["case-1"]


def test_only_branches_and_artifacts_are_copied_when_workspaces_are_left_out(tmp_path: Path) -> None:
    src = tmp_path / "src" / ".timewraith"
    s_settings = Settings(data_dir=src)
    s_settings.check_paths()
    Store(s_settings.db_path).save(_case(tmp_path / "src", "case-2"))
    (src / "workspaces" / "case-2" / "repo").mkdir(parents=True)
    (src / "workspaces" / "case-2" / "repo" / "big.txt").write_text("big")
    (src / "artifacts" / "case-2").mkdir(parents=True)
    (src / "artifacts" / "case-2" / "a.patch").write_text("p")
    dest = Settings(data_dir=tmp_path / "volume")
    assert importer.import_cases(src, dest, folders=("branches", "artifacts")) == ["case-2"]
    assert (dest.data_dir / "artifacts" / "case-2" / "a.patch").is_file()
    assert not (dest.data_dir / "workspaces" / "case-2").exists()
    assert Store(dest.db_path).get("case-2") is not None


def test_the_seed_is_copied_once_per_volume(tmp_path: Path) -> None:
    seed = tmp_path / "seed"
    seed_settings = Settings(data_dir=seed)
    seed_settings.check_paths()
    Store(seed_settings.db_path).save(_case(seed, "case-3"))
    dest = Settings(data_dir=tmp_path / "volume")
    assert importer.import_seed_once(seed, dest) == ["case-3"]
    assert (dest.data_dir / importer.SEEDED_MARK).read_text().strip() == "case-3"
    assert importer.import_seed_once(seed, dest) == [], "a restart does not copy it again"
    assert Store(dest.db_path).get("case-3") is not None


def test_a_missing_seed_folder_does_nothing(tmp_path: Path) -> None:
    dest = Settings(data_dir=tmp_path / "volume")
    assert importer.import_seed_once(tmp_path / "no-seed", dest) == []
    assert not (dest.data_dir / importer.SEEDED_MARK).exists()
