from __future__ import annotations

import stat
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from timewraith import api
from timewraith.config import Settings
from timewraith.models import CreateInvestigation, Investigation, ReplayEvent, Target
from timewraith.pipeline import Engine, Stop
from timewraith.store import Store


@pytest.fixture
def engine(tmp_path: Path) -> Engine:
    settings = Settings(data_dir=tmp_path, agent_runtime="stub")
    settings.check_paths()
    return Engine(settings, Store(settings.db_path))


def saved_case(engine: Engine, inv_id: str = "case-one") -> Investigation:
    inv = Investigation(
        id=inv_id, created_at="2026-11-14T00:00:00Z", stage="completed",
        request=CreateInvestigation(repository_url="https://github.com/example/repo", ref="main", mode="open-hunt"),
        target=Target(repository_url="https://github.com/example/repo", owner="example", repo="repo", ref="main"),
    )
    engine.store.save(inv)
    return inv


def test_delete_cleans_case_history_and_only_its_files(engine: Engine) -> None:
    inv = saved_case(engine)
    other = saved_case(engine, "case-two")
    engine.store.add_event(inv.id, ReplayEvent(
        id="event-one", seq=0, tOffsetMs=0, actor="watchtower-warden", kind="stage", phase="repository",
        text="Finished", status="planned", versionId="v1",
    ))
    engine.store.audit(inv.id, "now", "watchtower-warden", "test", "ok", "record")
    for base in (engine.s.workspaces, engine.s.artifacts):
        for inv_id in (inv.id, other.id):
            folder = base / inv_id
            folder.mkdir()
            (folder / "data.txt").write_text("case data")
            if inv_id == inv.id:
                (folder / "data.txt").chmod(stat.S_IREAD)
    engine.delete(inv.id)
    assert engine.store.get(inv.id) is None
    assert engine.store.events(inv.id) == []
    assert engine.store.audit_rows(inv.id) == []
    assert engine.store.get(other.id) is not None
    for base in (engine.s.workspaces, engine.s.artifacts):
        assert not (base / inv.id).exists()
        assert (base / other.id / "data.txt").read_text() == "case data"
    engine.store.save(inv)
    assert engine.store.get(inv.id) is None, "Stale saves must not restore deleted cases"


@pytest.mark.parametrize("stage", ["queued", "cloning", "awaiting-plan-approval", "fixing"])
def test_delete_rejects_unfinished_cases(engine: Engine, stage: str) -> None:
    inv = saved_case(engine).model_copy(update={"stage": stage})
    engine.store.save(inv)
    with pytest.raises(Stop, match="wait for it to stop"):
        engine.delete(inv.id)
    assert engine.store.get(inv.id) is not None


def test_delete_waits_for_final_worker_save(engine: Engine) -> None:
    inv = saved_case(engine)
    engine._working.add(inv.id)
    with pytest.raises(Stop, match="wait for it to stop"):
        engine.delete(inv.id)
    assert engine.store.get(inv.id) is not None


def test_delete_validates_paths_before_removing_any_files(engine: Engine) -> None:
    inv = saved_case(engine, "../escape")
    with pytest.raises(Stop, match="outside their storage folder"):
        engine.delete(inv.id)
    assert engine.store.get(inv.id) is not None


def test_delete_retains_record_on_file_cleanup_failure(engine: Engine) -> None:
    inv = saved_case(engine)
    (engine.s.workspaces / inv.id).mkdir()
    with (
        patch("timewraith.pipeline.shutil.rmtree", side_effect=PermissionError("in use")),
        pytest.raises(Stop, match="Close files in use"),
    ):
        engine.delete(inv.id)
    assert engine.store.get(inv.id) is not None


def test_delete_endpoint_requires_header_and_removes_case(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    inv = saved_case(engine)
    monkeypatch.setattr(api, "engine", engine)
    monkeypatch.setattr(api, "store", engine.store)
    client = TestClient(api.app)
    path = f"/api/v1/investigations/{inv.id}/delete"
    assert client.post(path).status_code == 403
    assert engine.store.get(inv.id) is not None
    response = client.post(path, headers={"X-TimeWraith": "1"})
    assert response.status_code == 200
    assert response.json() == {"deleted": inv.id}
    assert client.get(f"/api/v1/investigations/{inv.id}").status_code == 404
    assert client.post(path, headers={"X-TimeWraith": "1"}).status_code == 404
