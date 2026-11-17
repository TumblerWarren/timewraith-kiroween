"""A token Kiro refuses stops agent steps and shows the Crew as signed out, even though whoami still passes."""

from __future__ import annotations

import pytest

from timewraith import agents as A
from timewraith import crew


@pytest.fixture
def manager(monkeypatch: pytest.MonkeyPatch) -> crew.CrewManager:
    m = crew.CrewManager()
    monkeypatch.setattr(crew, "manager", m)
    return m


def test_refused_token_stops_agents_and_shows_signed_out(manager: crew.CrewManager) -> None:
    detail = (
        "Error: Internal error (code -32603): Encountered an error in the response stream: "
        "The bearer token included in the request is invalid. (request_id: c3180f60)"
    )
    with pytest.raises(A.AgentSignInExpired) as e:
        A._raise_unavailable("doctor-stitch", detail)
    assert isinstance(e.value, A.AgentQuotaReached), "every quota stop path also stops for this"
    assert str(e.value) == A.SIGN_IN_MESSAGE
    assert manager.signed_in(fresh=True) is False and manager.ready() is False
    assert manager.login.state == "failed" and manager.login.error == crew.REJECTED_MESSAGE


def test_quota_and_other_errors_are_unchanged(manager: crew.CrewManager) -> None:
    with pytest.raises(A.AgentQuotaReached) as q:
        A._raise_unavailable("raven-archivist", "The monthly usage limit has been reached (request_id: x)")
    assert not isinstance(q.value, A.AgentSignInExpired)
    with pytest.raises(A.AgentUnavailable) as other:
        A._raise_unavailable("raven-archivist", "connection reset")
    assert not isinstance(other.value, A.AgentQuotaReached)
    assert manager._rejected is False
