from __future__ import annotations

from fastapi.testclient import TestClient

from timewraith.api import app
from timewraith.schema_export import OUT, render

client = TestClient(app)


def test_health_reports_runtime_and_sandbox() -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["agent_runtime"]["label"] == "Stub runtime, not a Kiro Crew run"
    assert "available" in body["sandbox"]


def test_invalid_url_uses_error_shape() -> None:
    r = client.post("/api/v1/investigations", json={"repository_url": "https://gitlab.com/a/b", "ref": "main"})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "invalid_repository_url"
    assert ":\\" not in err["message"] and "/Users/" not in err["message"]


def test_known_issue_needs_issue_url() -> None:
    r = client.post(
        "/api/v1/investigations",
        json={"repository_url": "https://github.com/o/r", "ref": "main", "mode": "known-issue"},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "issue_required"


def test_unknown_investigation_is_404() -> None:
    r = client.get("/api/v1/investigations/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_schema_export_is_current() -> None:
    for name, text in render().items():
        assert (OUT / name).read_text(encoding="utf-8") == text, f"Run schema_export: {name} is stale"
