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


def test_flow_endpoint_names_owners() -> None:
    r = client.get("/api/v1/flow")
    assert r.status_code == 200
    steps = r.json()
    assert steps[0]["title"] == "Repository" and steps[1]["owner"] == "bat-scout"
    assert {s["kind"] for s in steps} == {"code", "kiro-agent"}


def test_schema_export_is_current() -> None:
    for name, text in render().items():
        assert (OUT / name).read_text(encoding="utf-8") == text, f"Run schema_export: {name} is stale"


def test_local_actions_need_the_custom_header() -> None:
    for path in (
        "/api/v1/system/docker/start",
        "/api/v1/system/crew/start",
        "/api/v1/system/crew/login",
        "/api/v1/system/crew/login/cancel",
        "/api/v1/system/crew/logout",
        "/api/v1/system/crew/delete",
    ):
        r = client.post(path)
        assert r.status_code == 403
        assert r.json()["error"]["code"] == "forbidden"


def test_device_flow_output_is_parsed_and_only_trusted_urls_pass() -> None:
    from timewraith.crew import parse_device_output

    out = (
        "Confirm the following code in the browser\nCode: XQFX-WDVN\n"
        "Open this URL: https://view.awsapps.com/start/#/device?user_code=XQFX-WDVN\n\x1b[2K Logging in..."
    )
    assert parse_device_output(out) == ("XQFX-WDVN", "https://view.awsapps.com/start/#/device?user_code=XQFX-WDVN")
    assert parse_device_output("Code: ABCD-EFGH\nOpen this URL: https://evil.example/device") == ("ABCD-EFGH", None)
    assert parse_device_output("Logging in...") == (None, None)
    google = (
        "\x1b[?25h\r\nTo sign in with Google, visit:\r\n"
        "  https://app.kiro.dev/account/device?user_code=JSNZ-NGGR&login_provider=Google\r\n\r\n"
        "And confirm the code: JSNZ-NGGR\r\n"
    )
    assert parse_device_output(google) == (
        "JSNZ-NGGR",
        "https://app.kiro.dev/account/device?user_code=JSNZ-NGGR&login_provider=Google",
    )


def test_sign_in_method_must_be_known() -> None:
    r = client.post("/api/v1/system/crew/login", headers={"X-TimeWraith": "1"}, json={"method": "facebook"})
    assert r.status_code >= 400 and r.json()["error"]["code"] == "invalid_method"


def test_kiro_container_calls_approve_no_tools() -> None:
    from timewraith.agents import KiroCrewDockerRuntime
    from timewraith.config import get_settings

    cmd = KiroCrewDockerRuntime(get_settings(), lambda *_: None)._command("bat-scout")
    assert cmd[:4] == ["docker", "exec", "-i", "timewraith-crew"]
    assert "--trust-tools= " in cmd[-1] and "--no-interactive" in cmd[-1]
    assert "trust-all-tools" not in cmd[-1]
