"""SQLite storage: one JSON document per Investigation plus an append-only event table."""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from .models import Investigation, ReplayEvent

_SCHEMA = """
CREATE TABLE IF NOT EXISTS investigations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  investigation_id TEXT NOT NULL, seq INTEGER NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (investigation_id, seq)
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, investigation_id TEXT NOT NULL, at TEXT NOT NULL,
  agent TEXT NOT NULL, step TEXT NOT NULL, outcome TEXT NOT NULL, detail TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.executescript(_SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def save(self, inv: Investigation) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT INTO investigations (id, created_at, doc) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET doc = excluded.doc",
                (inv.id, inv.created_at, inv.model_dump_json()),
            )

    def get(self, inv_id: str) -> Investigation | None:
        with self._conn() as c:
            row = c.execute("SELECT doc FROM investigations WHERE id = ?", (inv_id,)).fetchone()
        return Investigation.model_validate_json(row[0]) if row else None

    def recent(self, limit: int = 50) -> list[Investigation]:
        with self._conn() as c:
            rows = c.execute("SELECT doc FROM investigations ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [Investigation.model_validate_json(r[0]) for r in rows]

    def add_event(self, inv_id: str, event: ReplayEvent) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT INTO events (investigation_id, seq, doc) VALUES (?, ?, ?)",
                (inv_id, event.seq, event.model_dump_json()),
            )

    def events(self, inv_id: str, after: int = -1) -> list[ReplayEvent]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT doc FROM events WHERE investigation_id = ? AND seq > ? ORDER BY seq", (inv_id, after)
            ).fetchall()
        return [ReplayEvent.model_validate_json(r[0]) for r in rows]

    def next_seq(self, inv_id: str) -> int:
        with self._conn() as c:
            row = c.execute(
                "SELECT COALESCE(MAX(seq), -1) FROM events WHERE investigation_id = ?", (inv_id,)
            ).fetchone()
        return int(row[0]) + 1

    def audit(self, inv_id: str, at: str, agent: str, step: str, outcome: str, detail: str) -> None:
        with self._lock, self._conn() as c:
            c.execute(
                "INSERT INTO audit (investigation_id, at, agent, step, outcome, detail) VALUES (?, ?, ?, ?, ?, ?)",
                (inv_id, at, agent, step, outcome, detail[:4000]),
            )

    def audit_rows(self, inv_id: str) -> list[dict[str, str]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT at, agent, step, outcome, detail FROM audit WHERE investigation_id = ? ORDER BY id", (inv_id,)
            ).fetchall()
        return [dict(zip(("at", "agent", "step", "outcome", "detail"), r, strict=True)) for r in rows]
