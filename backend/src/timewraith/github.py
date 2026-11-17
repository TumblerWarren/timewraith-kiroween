"""Read-only GitHub REST calls: fetch one issue, search a repository's issues."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

API = "https://api.github.com"


def _get(path: str, token: str) -> Any:
    req = urllib.request.Request(  # noqa: S310 (fixed https://api.github.com host)
        API + path,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "timewraith",
            "X-GitHub-Api-Version": "2022-11-28",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 (fixed https host)
        return json.loads(r.read().decode("utf-8"))


def get_issue(owner: str, repo: str, number: int, token: str) -> dict[str, str]:
    d = _get(f"/repos/{owner}/{repo}/issues/{number}", token)
    return {
        "number": str(d["number"]),
        "title": d.get("title") or "",
        "body": (d.get("body") or "")[:6000],
        "url": d.get("html_url") or "",
    }


# Labels of threads that ask or discuss rather than report a defect; such a thread is never a "known issue".
NOT_A_REPORT = {"question", "discussion", "support", "help wanted", "invalid", "wontfix", "duplicate"}


_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
_REF = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")
_PATH = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")


def raw(owner: str, repo: str, ref: str, path: str, limit: int = 200_000) -> str | None:
    """One public file of a repository at a ref, or None when it is not there. Fixed host, no credentials."""
    if not (_NAME.match(owner) and _NAME.match(repo) and _REF.match(ref) and _PATH.match(path)) or ".." in path:
        return None
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{urllib.parse.quote(ref)}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "timewraith"})  # noqa: S310 (fixed https host)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 (fixed https host)
            text: str = r.read(limit).decode("utf-8", errors="replace")
            return text
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise OSError(f"GitHub answered {e.code} for {path}") from e


def repo_info(owner: str, repo: str, token: str) -> dict[str, Any]:
    return _get(f"/repos/{owner}/{repo}", token)  # type: ignore[no-any-return]


def root_names(owner: str, repo: str, ref: str, token: str) -> list[str]:
    items = _get(f"/repos/{owner}/{repo}/contents/?ref={urllib.parse.quote(ref)}", token)
    return [str(i.get("name", "")) for i in items] if isinstance(items, list) else []


def search_issues(owner: str, repo: str, terms: list[str], token: str, exclude: int | None) -> list[dict[str, object]]:
    """Issues and pull requests that mention the terms. A pull request often holds the only report of a bug."""
    words = " ".join(t for t in terms if t and len(t) < 40)[:200]
    q = urllib.parse.quote(f"repo:{owner}/{repo} {words}")
    d = _get(f"/search/issues?q={q}&per_page=10", token)
    out: list[dict[str, object]] = []
    for it in d.get("items", []):
        if exclude is not None and it.get("number") == exclude:
            continue  # Blind hunt: the hidden issue never reaches the Crew before the reveal
        labels = {str(lb.get("name", "")).lower() for lb in it.get("labels") or [] if isinstance(lb, dict)}
        if labels & NOT_A_REPORT:
            continue
        out.append(
            {
                "number": it["number"],
                "title": it.get("title", ""),
                "url": it.get("html_url", ""),
                "state": it.get("state", ""),
                "kind": "pull request" if it.get("pull_request") else "issue",
                "created_at": it.get("created_at", ""),
                "body": (it.get("body") or "")[:1500],
            }
        )
    return out
