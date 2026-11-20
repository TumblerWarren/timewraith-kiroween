"""Bring cases from another TimeWraith data folder into this one (for example from the folder of a source run on your PC
into the Docker volume).

    docker run --rm -v timewraith-data:/data -v "$HOME/.timewraith:/import:ro" <image> \\
        python -m timewraith.importer /import

Copies each case's record, replay events and audit rows, and its workspace, branch and artifact folders. The paths
stored in a case point into the folder it came from (`C:\\Users\\you\\.timewraith\\branches\\...`), so they are
rewritten to this data folder. The source is only read. A case that already exists here is skipped unless
`--replace` is given.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any

from .config import Settings
from .models import Investigation
from .store import Store

FOLDERS = ("workspaces", "branches", "artifacts")
_STORED = re.compile(
    r"^(?:[A-Za-z]:)?[\\/](?:.*?[\\/])?\.timewraith[^\\/]*[\\/](workspaces|branches|artifacts)[\\/](.*)$"
)


def rewrite(value: Any, data_dir: Path) -> Any:
    """Every string that is a path inside some TimeWraith data folder now points into `data_dir`."""
    if isinstance(value, str):
        m = _STORED.match(value)
        if not m:
            return value
        rest = m.group(2).replace("\\", "/")
        return str(data_dir / m.group(1) / rest) if rest else str(data_dir / m.group(1))
    if isinstance(value, list):
        return [rewrite(v, data_dir) for v in value]
    if isinstance(value, dict):
        return {k: rewrite(v, data_dir) for k, v in value.items()}
    return value


def _open_copy(src_db: Path, scratch: Path) -> sqlite3.Connection:
    """A private copy of the source database (with its write-ahead log), so the source is never touched."""
    for suffix in ("", "-wal", "-shm"):
        part = Path(f"{src_db}{suffix}")
        if part.is_file():
            shutil.copy2(part, scratch / f"src.sqlite3{suffix}")
    return sqlite3.connect(scratch / "src.sqlite3")


def import_cases(
    source: Path,
    settings: Settings,
    only: list[str] | None = None,
    replace: bool = False,
    folders: tuple[str, ...] = FOLDERS,
) -> list[str]:
    """Import the cases of `source` (a data folder) into `settings.data_dir`. Returns the ids that were imported.
    `folders` limits which case folders are copied; a folder the source does not have is skipped."""
    src_db = source / "timewraith.sqlite3"
    if not src_db.is_file():
        raise FileNotFoundError(f"{src_db} does not exist: pass a TimeWraith data folder")
    settings.check_paths()
    store = Store(settings.db_path)
    done: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        conn = _open_copy(src_db, Path(tmp))
        rows = conn.execute("SELECT id, doc FROM investigations ORDER BY created_at").fetchall()
        for inv_id, doc in rows:
            if only and inv_id not in only:
                continue
            if store.get(inv_id) and not replace:
                print(f"skip {inv_id}: already here (use --replace to overwrite)")
                continue
            inv = Investigation.model_validate(rewrite(json.loads(doc), settings.data_dir))
            store.save(inv)
            _copy_rows(conn, settings, inv_id)
            for folder in folders:
                src_folder, dst_folder = source / folder / inv_id, settings.data_dir / folder / inv_id
                if src_folder.is_dir():
                    shutil.rmtree(dst_folder, ignore_errors=True)
                    shutil.copytree(src_folder, dst_folder, symlinks=True)
            done.append(inv_id)
            print(f"imported {inv_id}")
        conn.close()
    return done


SEEDED_MARK = ".seeded"


def import_seed_once(seed: Path, settings: Settings) -> list[str]:
    """Copy the example cases shipped in the image (`seed/`) into the data folder, once per data volume. A marker file
    records that it happened, so a case that is deleted stays deleted and a restart does not copy it back. Returns the
    ids copied; nothing happens when the seed folder is missing."""
    marker = settings.data_dir / SEEDED_MARK
    if not (seed / "timewraith.sqlite3").is_file() or marker.exists():
        return []
    settings.check_paths()
    done = import_cases(seed, settings)
    marker.write_text("\n".join(done) + "\n", encoding="utf-8")
    return done


def _copy_rows(conn: sqlite3.Connection, settings: Settings, inv_id: str) -> None:
    dst = sqlite3.connect(settings.db_path, timeout=10)
    try:
        dst.execute("DELETE FROM events WHERE investigation_id = ?", (inv_id,))
        dst.execute("DELETE FROM audit WHERE investigation_id = ?", (inv_id,))
        for seq, doc in conn.execute("SELECT seq, doc FROM events WHERE investigation_id = ?", (inv_id,)):
            dst.execute("INSERT INTO events (investigation_id, seq, doc) VALUES (?, ?, ?)", (inv_id, seq, doc))
        for row in conn.execute(
            "SELECT at, agent, step, outcome, detail FROM audit WHERE investigation_id = ? ORDER BY id", (inv_id,)
        ):
            dst.execute(
                "INSERT INTO audit (investigation_id, at, agent, step, outcome, detail) VALUES (?, ?, ?, ?, ?, ?)",
                (inv_id, *row),
            )
        dst.commit()
    finally:
        dst.close()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Import cases from another TimeWraith data folder")
    p.add_argument("source", type=Path, help="the data folder to read (it is not changed)")
    p.add_argument("--case", action="append", help="import only this case id (repeatable)")
    p.add_argument("--replace", action="store_true", help="overwrite a case that already exists here")
    p.add_argument(
        "--no-workspaces",
        action="store_true",
        help="leave out the cloned repositories (workspaces); the case still shows, but cannot be re-run from it",
    )
    args = p.parse_args(argv)
    try:
        folders = ("branches", "artifacts") if args.no_workspaces else FOLDERS
        done = import_cases(args.source, Settings(), args.case, args.replace, folders)
    except (OSError, ValueError) as e:
        print(f"import failed: {e}", file=sys.stderr)
        return 1
    print(f"{len(done)} case(s) imported")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
