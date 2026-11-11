"""Read-only GitHub REST calls: fetch one issue, search a repository's issues."""

from __future__ import annotations

import json
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


def search_issues(owner: str, repo: str, terms: list[str], token: str, exclude: int | None) -> list[dict[str, object]]:
    words = " ".join(t for t in terms if t and len(t) < 40)[:200]
    q = urllib.parse.quote(f"repo:{owner}/{repo} is:issue {words}")
    d = _get(f"/search/issues?q={q}&per_page=10", token)
    out: list[dict[str, object]] = []
    for it in d.get("items", []):
        if exclude is not None and it.get("number") == exclude:
            continue  # Blind hunt: the hidden issue never reaches the Crew before the reveal
        out.append(
            {
                "number": it["number"],
                "title": it.get("title", ""),
                "url": it.get("html_url", ""),
                "state": it.get("state", ""),
                "body": (it.get("body") or "")[:800],
            }
        )
    return out
