from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from timewraith.ingest import IngestError, make_target, parse_issue_url, parse_repository_url, validate_ref


@pytest.mark.parametrize(
    "url",
    [
        "http://github.com/a/b",
        "https://gitlab.com/a/b",
        "https://github.com:8443/a/b",
        "https://user:pw@github.com/a/b",
        "https://github.com/a/b?x=1",
        "https://github.com/a/b#frag",
        "https://github.com/a",
        "https://github.com/a/b/c",
        "https://github.com/-a/b",
        "https://github.com/a/..",
        "file:///etc/passwd",
        "git@github.com:a/b.git",
    ],
)
def test_rejects_bad_urls(url: str) -> None:
    with pytest.raises(IngestError):
        parse_repository_url(url)


def test_accepts_and_normalises() -> None:
    t = make_target("https://github.com/fullcalendar/fullcalendar.git", "v6.1.10")
    assert t.repository_url == "https://github.com/fullcalendar/fullcalendar.git"
    assert (t.owner, t.repo, t.ref) == ("fullcalendar", "fullcalendar", "v6.1.10")


@given(st.text(max_size=80))
def test_url_parser_never_accepts_other_hosts(s: str) -> None:
    try:
        owner, repo = parse_repository_url(s)
    except IngestError:
        return
    assert s.strip().startswith("https://github.com/")
    assert owner and repo and ".." not in repo


@pytest.mark.parametrize("ref", ["-c", "--upload-pack=x", "a..b", "", "a b", "x;rm", "main/"])
def test_rejects_bad_refs(ref: str) -> None:
    with pytest.raises(IngestError):
        validate_ref(ref)


def test_issue_url_must_match_repo() -> None:
    assert parse_issue_url("https://github.com/o/r/issues/12", "o", "r") == 12
    with pytest.raises(IngestError):
        parse_issue_url("https://github.com/other/r/issues/12", "o", "r")
    with pytest.raises(IngestError):
        parse_issue_url("https://github.com/o/r/pull/12", "o", "r")
