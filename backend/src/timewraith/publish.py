"""Share an accepted fix on GitHub: fork, push the branch to your fork, open a pull request.

Everything runs in the GitHub container (gitbox.py). The backend sends in only the branch's patch (`git format-patch`)
and a few validated names, so the token never leaves the container and no TimeWraith folder is mounted into it.
Code, not an agent, decides every step, and each step needs the user's confirmation, which must repeat the branch name:
- only a branch named `timewraith/...` is ever pushed, and only to a fork of the original that the signed-in user owns,
  never to the original repository itself;
- the pull request goes to the original repository from that fork branch;
- before the pull request, open pull requests about the same bug are listed, so a duplicate is noticed.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from . import gitbox
from .gitbox import exec_in, scrub
from .ingest import IngestError, git, parse_repository_url
from .models import Bug, Investigation, Publish

NAME = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98})$")
BRANCH = re.compile(r"^timewraith/[A-Za-z0-9._-]{1,120}$")
SHA = re.compile(r"^[0-9a-f]{40}$")
PR_URL = re.compile(r"^https://github\.com/([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)/pull/(\d+)$")
MAX_TITLE, MAX_BODY = 200, 8000

# Runs in the container. The patch arrives on stdin. With TW_PREPARE_ONLY=1 it stops before anything talks to GitHub
# with a token (used by the tests): it rebuilds the commit on the pinned revision and prints its tree.
PUSH_SCRIPT = r"""
set -eu
cat > /tmp/tw.patch
rm -rf /tmp/tw && mkdir /tmp/tw && cd /tmp/tw
git init -q .
git remote add upstream "https://github.com/$TW_OWNER/$TW_REPO.git"
git fetch -q --depth 1 upstream "$TW_BASE"
git checkout -q -b "$TW_BRANCH" FETCH_HEAD
git -c user.name=TimeWraith -c user.email=timewraith@localhost -c commit.gpgsign=false am -q /tmp/tw.patch
echo "REBUILT TREE=$(git rev-parse 'HEAD^{tree}') COMMIT=$(git rev-parse HEAD)"
[ "${TW_PREPARE_ONLY:-}" = 1 ] && exit 0
gh auth setup-git >/dev/null 2>&1
ME=$(gh api user --jq .login)
gh repo fork "$TW_OWNER/$TW_REPO" --clone=false >/dev/null 2>&1 || true
i=0
until gh api "repos/$ME/$TW_REPO" --jq ".fork == true and (.parent.full_name | ascii_downcase) == \"$TW_PARENT_LC\"" \
      2>/dev/null | grep -qx true; do
  i=$((i + 1))
  if [ "$i" -ge 10 ]; then echo "NOT_YOUR_FORK $ME/$TW_REPO" >&2; exit 12; fi
  sleep 3
done
git remote add fork "https://github.com/$ME/$TW_REPO.git"
git push -q fork "$TW_BRANCH"
echo "PUSHED FORK=$ME/$TW_REPO"
"""

PR_SCRIPT = r"""
set -eu
ME=$(gh api user --jq .login)
OLD=$(gh pr list --repo "$TW_UPSTREAM" --head "$TW_BRANCH" --state all --json url,headRepositoryOwner \
      --jq ".[] | select(.headRepositoryOwner.login == \"$ME\") | .url" | head -1)
if [ -n "$OLD" ]; then echo "EXISTS $OLD" >&2; exit 14; fi
cat > /tmp/tw-body.md
URL=$(gh pr create --repo "$TW_UPSTREAM" --head "$ME:$TW_BRANCH" --title "$TW_TITLE" --body-file /tmp/tw-body.md)
echo "PR $URL"
"""


def _fail(code: str, message: str) -> Exception:
    from .pipeline import Stop  # local import: pipeline imports this module

    return Stop(code, message)


def upstream_of(inv: Investigation) -> tuple[str, str]:
    try:
        owner, repo = parse_repository_url(inv.target.repository_url)
    except IngestError as e:
        raise _fail("invalid_repo", "The repository address is not a github.com repository") from e
    if not NAME.match(owner) or not NAME.match(repo):
        raise _fail("invalid_repo", "The repository name has characters GitHub does not allow")
    return owner, repo


def _accepted_branch(bug: Bug) -> tuple[str, str, Path]:
    """(branch name, commit, patch file) of an accepted fix; the branch name must be one TimeWraith made."""
    b = bug.fix.branch
    if bug.fix.state != "verified" or bug.fix.user_decision != "accepted":
        raise _fail("fix_not_accepted", "Share a fix after it passed all gates and you accepted it")
    if b is None:
        raise _fail("branch_missing", "The fix has no branch yet; make the branch first")
    if not BRANCH.match(b.name):
        raise _fail("branch_not_allowed", "Only branches named timewraith/... are sent to GitHub")
    patch = Path(b.patch_file)
    if not patch.is_file():
        raise _fail("branch_missing", "The patch file is gone; make the branch again")
    return b.name, b.commit, patch


def _title_body(bug: Bug) -> tuple[str, str]:
    b = bug.fix.branch
    if b and Path(b.path).is_dir():
        try:
            title = git(Path(b.path), ["log", "-1", "--format=%s", b.commit]).strip()
            body = git(Path(b.path), ["log", "-1", "--format=%b", b.commit]).strip()
            if title:
                return title[:MAX_TITLE], body[:MAX_BODY]
        except IngestError:
            pass
    attempt = next((a for a in reversed(bug.fix.attempts) if a.accepted_by_gates), None)
    return f"fix: {bug.title}"[:MAX_TITLE], (
        f"{attempt.summary}\n\nRoot cause: {attempt.root_cause}" if attempt else ""
    )


def _keywords(bug: Bug) -> str:
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z0-9]{3,}", bug.title) if w.lower() not in {"does", "with", "when"}]
    return " ".join(words[:4])


def find_duplicates(upstream: tuple[str, str], bug: Bug) -> list[dict[str, Any]]:
    """Open pull requests about the same bug, from the search and from the issue match Raven found."""
    found: dict[int, dict[str, Any]] = {}
    m = bug.issue_match
    if m and "/pull/" in m.get("url", "") and str(m.get("number", "")).isdigit():
        found[int(m["number"])] = {"number": int(m["number"]), "title": m.get("title", ""), "url": m["url"],
                                   "state": "known report"}  # fmt: skip
    words = _keywords(bug)
    if words:
        repo = f"{upstream[0]}/{upstream[1]}"
        search = f"{words} in:title,body"
        r = exec_in(
            ["gh", "pr", "list", "--repo", repo, "--state", "open", "--search", search,
             "--json", "number,title,url,state", "--limit", "5"],
            timeout=45,
        )  # fmt: skip
        if r.returncode == 0:
            try:
                for item in json.loads(r.stdout or "[]"):
                    found.setdefault(int(item["number"]), item)
            except ValueError, KeyError, TypeError:
                pass
    return list(found.values())


def preview(inv: Investigation, bug: Bug) -> dict[str, Any]:
    """What would be sent, and what stands in the way. Reads only; nothing leaves the machine."""
    upstream = upstream_of(inv)
    connected, user = gitbox.manager.identity()
    problems: list[str] = []
    branch, files = "", []
    try:
        branch, _, _ = _accepted_branch(bug)
        files = bug.fix.branch.files if bug.fix.branch else []
    except Exception as e:  # noqa: BLE001 (a Stop with the reason; shown as a problem, not an error)
        problems.append(str(e))
    if not connected:
        problems.append("Connect GitHub on the Crew page")
    title, body = _title_body(bug)
    return {
        "ready": not problems,
        "upstream": f"{upstream[0]}/{upstream[1]}",
        "fork": f"{user}/{upstream[1]}" if user else None,
        "user": user,
        "branch": branch,
        "title": title,
        "body": body,
        "files": files,
        "duplicates": find_duplicates(upstream, bug) if connected else [],
        "published": bug.fix.publish.model_dump() if bug.fix.publish else None,
        "problems": problems,
    }


def _require_confirm(confirm_branch: str, branch: str) -> None:
    if confirm_branch != branch:
        raise _fail("confirm_mismatch", f"Confirm by repeating the branch name: {branch}")


def _require_connected() -> str:
    connected, user = gitbox.manager.identity(fresh=True)
    if not connected or not user:
        raise _fail("github_not_connected", "Connect GitHub on the Crew page first")
    return user


def push(inv: Investigation, bug: Bug, confirm_branch: str) -> Publish:
    """Fork (if needed) and push the fix branch to the user's fork. Never to the original repository."""
    branch, commit, patch = _accepted_branch(bug)
    _require_confirm(confirm_branch, branch)
    if bug.fix.publish:
        raise _fail("already_published", f"The branch is already on {bug.fix.publish.fork}")
    owner, repo = upstream_of(inv)
    base = bug.fix.branch.base if bug.fix.branch else ""
    if not SHA.match(base):
        raise _fail("branch_missing", "The branch has no pinned base commit")
    user = _require_connected()
    if user.lower() == owner.lower():
        raise _fail("not_your_fork", "You own the original repository: push from a fork or use git directly")
    r = exec_in(
        ["sh", "-c", PUSH_SCRIPT],
        env={
            "TW_OWNER": owner,
            "TW_REPO": repo,
            "TW_BASE": base,
            "TW_BRANCH": branch,
            "TW_PARENT_LC": f"{owner}/{repo}".lower(),
        },  # fmt: skip
        stdin=patch.read_text(encoding="utf-8", errors="surrogateescape"),
        timeout=300,
    )
    out = scrub(r.stdout)
    if r.returncode == 12:
        raise _fail("not_your_fork", f"{user}/{repo} exists but is not a fork of {owner}/{repo}")
    if r.returncode != 0 or "PUSHED FORK=" not in out:
        detail = scrub(r.stderr).strip().splitlines()[-1:] or ["no output"]
        raise _fail("push_failed", f"The push did not finish: {detail[0][:300]}")
    fork = out.rsplit("PUSHED FORK=", 1)[1].split()[0]
    sent = re.search(r"COMMIT=([0-9a-f]{40})", out)
    pub = Publish(fork=fork, branch=branch, commit=sent.group(1) if sent else commit,
                  pushed_at=datetime.now(UTC).isoformat(timespec="seconds"))  # fmt: skip
    bug.fix.publish = pub
    return pub


def pull_request(inv: Investigation, bug: Bug, title: str, body: str, confirm_branch: str) -> Publish:
    """Open the pull request on the original repository from the pushed fork branch."""
    branch, _, _ = _accepted_branch(bug)
    _require_confirm(confirm_branch, branch)
    pub = bug.fix.publish
    if pub is None:
        raise _fail("not_pushed", "Push the branch to your fork first")
    if pub.pr_url:
        raise _fail("pr_exists", f"A pull request is already open: {pub.pr_url}")
    title = " ".join(title.split())[:MAX_TITLE]
    if not title:
        raise _fail("invalid_title", "Give the pull request a title")
    owner, repo = upstream_of(inv)
    _require_connected()
    r = exec_in(
        ["sh", "-c", PR_SCRIPT],
        env={"TW_UPSTREAM": f"{owner}/{repo}", "TW_BRANCH": branch, "TW_TITLE": title},
        stdin=body[:MAX_BODY],
        timeout=120,
    )
    if r.returncode == 14:
        raise _fail("pr_exists", scrub(r.stderr).strip().splitlines()[-1][:300])
    m = PR_URL.match(scrub(r.stdout).strip().splitlines()[-1].removeprefix("PR ").strip()) if r.stdout.strip() else None
    if r.returncode != 0 or not m:
        detail = scrub(r.stderr).strip().splitlines()[-1:] or ["no output"]
        raise _fail("pr_failed", f"The pull request was not opened: {detail[0][:300]}")
    pub.pr_url, pub.pr_number = m.group(0), int(m.group(3))
    pub.pr_opened_at = datetime.now(UTC).isoformat(timespec="seconds")
    return pub
