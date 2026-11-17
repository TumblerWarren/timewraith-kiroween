from __future__ import annotations

import subprocess
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from timewraith import crew
from timewraith.api import app


def result(code: int = 0, error: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], code, "", error)


def test_delete_removes_only_crew_and_saved_sign_in() -> None:
    manager = crew.CrewManager()
    manager._signed_in = (123.0, True)
    manager._account = "test@example.com"
    with patch.object(manager, "docker_running", return_value=True), patch.object(
        crew, "_docker", return_value=result()
    ) as docker:
        manager.remove_crew()
    assert [call.args[0] for call in docker.call_args_list] == [
        ["rm", "-f", crew.CONTAINER], ["volume", "rm", crew.VOLUME]
    ]
    assert manager._signed_in == (0.0, False)
    assert manager._account is None
    assert manager.login.state == "idle"


def test_delete_can_retry_already_missing_resources() -> None:
    manager = crew.CrewManager()
    missing = [result(1, "No such container: timewraith-crew"), result(1, "timewraith-crew-home: not found")]
    with patch.object(manager, "docker_running", return_value=True), patch.object(crew, "_docker", side_effect=missing):
        manager.remove_crew()


def test_delete_stops_on_container_failure() -> None:
    manager = crew.CrewManager()
    with patch.object(manager, "docker_running", return_value=True), patch.object(
        crew, "_docker", return_value=result(1, "permission denied")
    ) as docker, pytest.raises(RuntimeError, match="permission denied"):
        manager.remove_crew()
    assert docker.call_count == 1


def test_delete_reports_partial_volume_failure_and_clears_auth() -> None:
    manager = crew.CrewManager()
    manager._signed_in = (123.0, True)
    with patch.object(manager, "docker_running", return_value=True), patch.object(
        crew, "_docker", side_effect=[result(), result(1, "volume is in use")]
    ), pytest.raises(RuntimeError, match="saved sign-in could not be removed"):
        manager.remove_crew()
    assert manager._signed_in == (0.0, False)


@pytest.mark.parametrize("busy", ["install", "login", "docker"])
def test_delete_is_blocked_when_unavailable(busy: str) -> None:
    manager = crew.CrewManager()
    if busy == "install":
        manager.install = "pulling"
    elif busy == "login":
        manager.login.state = "pending"
    with (
        patch.object(manager, "docker_running", return_value=False),
        patch.object(crew, "_docker") as docker,
        pytest.raises(RuntimeError),
    ):
        manager.remove_crew()
    docker.assert_not_called()


def test_delete_endpoint_returns_refreshed_status_and_handles_failure() -> None:
    client = TestClient(app)
    with patch.object(crew.manager, "remove_crew") as remove, patch.object(
        crew.manager, "status", return_value={"crew": {"container": "missing"}}
    ):
        response = client.post("/api/v1/system/crew/delete", headers={"X-TimeWraith": "1"})
        assert response.status_code == 200
        assert response.json()["crew"]["container"] == "missing"
        remove.assert_called_once()
    with patch.object(crew.manager, "remove_crew", side_effect=RuntimeError("Start Docker first")):
        response = client.post("/api/v1/system/crew/delete", headers={"X-TimeWraith": "1"})
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "crew_delete_failed"
