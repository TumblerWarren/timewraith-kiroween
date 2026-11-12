"""Validate the target, resolve the ref to a commit SHA, and clone that one revision with hardened Git settings.

No code from the target repository runs here: hooks are disabled, submodules and LFS are not fetched,
and symlinks are checked out as plain files.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from .models import Target

_OWNER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
_REPO = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
_REF = re.compile(r"^[A-Za-z0-9._/-]{1,200}$")
_SHA = re.compile(r"^[0-9a-f]{40}$")
_ISSUE_PATH = re.compile(r"^/([^/]+)/([^/]+)/issues/(\d{1,9})/?$")


class IngestError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def parse_repository_url(url: str) -> tuple[str, str]:
    """Return (owner, repo) for https://github.com/<owner>/<repo>[.git]; raise IngestError otherwise."""
    parts = urlsplit(url.strip())
    if parts.scheme != "https" or parts.hostname != "github.com" or parts.port is not None:
        raise IngestError("invalid_repository_url", "Only https://github.com/<owner>/<repo> URLs are accepted")
    if parts.username or parts.password or parts.query or parts.fragment:
        raise IngestError("invalid_repository_url", "The URL must not contain credentials, a query or a fragment")
    segs = [s for s in parts.path.split("/") if s]
    if len(segs) != 2:
        raise IngestError("invalid_repository_url", "The URL path must be /<owner>/<repo>")
    owner, repo = segs[0], segs[1].removesuffix(".git")
    if not _OWNER.match(owner) or not _REPO.match(repo) or repo in {".", ".."}:
        raise IngestError("invalid_repository_url", "Owner or repository name has characters GitHub does not allow")
    return owner, repo


def validate_ref(ref: str) -> str:
    ref = ref.strip()
    if not _REF.match(ref) or ref.startswith("-") or ".." in ref or ref.endswith("/"):
        raise IngestError("invalid_ref", "The ref must be a branch, tag or commit SHA")
    return ref


def parse_issue_url(url: str, owner: str, repo: str) -> int:
    parts = urlsplit(url.strip())
    m = _ISSUE_PATH.match(parts.path)
    if parts.scheme != "https" or parts.hostname != "github.com" or not m:
        raise IngestError("invalid_issue_url", "The issue URL must be https://github.com/<owner>/<repo>/issues/<n>")
    if m.group(1).lower() != owner.lower() or m.group(2).removesuffix(".git").lower() != repo.lower():
        raise IngestError("invalid_issue_url", "The issue must belong to the target repository")
    return int(m.group(3))


def make_target(url: str, ref: str) -> Target:
    owner, repo = parse_repository_url(url)
    return Target(
        repository_url=f"https://github.com/{owner}/{repo}.git", owner=owner, repo=repo, ref=validate_ref(ref)
    )


def _git_env(empty_home: str) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(
        GIT_TERMINAL_PROMPT="0",
        GIT_LFS_SKIP_SMUDGE="1",
        GIT_CONFIG_NOSYSTEM="1",
        GIT_CONFIG_GLOBAL=os.devnull,
        HOME=empty_home,
        USERPROFILE=empty_home,
    )
    return env


def _git_flags(hooks_dir: str) -> list[str]:
    return [
        "-c",
        f"core.hooksPath={hooks_dir}",
        "-c",
        "protocol.allow=never",
        "-c",
        "protocol.https.allow=always",
        "-c",
        "core.symlinks=false",
        "-c",
        "core.longpaths=true",
        "-c",
        "submodule.recurse=false",
        "-c",
        "filter.lfs.smudge=",
        "-c",
        "filter.lfs.process=",
        "-c",
        "filter.lfs.required=false",
        "-c",
        "advice.detachedHead=false",
    ]


def _run_git(args: list[str], cwd: Path | None, timeout: int, scratch: str) -> str:
    try:
        out = subprocess.run(
            ["git", *_git_flags(scratch), *args],
            cwd=cwd,
            env=_git_env(scratch),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        raise IngestError("clone_timeout", "Git did not finish within the time limit") from e
    if out.returncode != 0:
        lines = (out.stderr or out.stdout).strip().splitlines()
        raise IngestError("git_failed", lines[-1][:300] if lines else "git failed")
    return out.stdout


def git(ws: Path, args: list[str], *, stdin: str | None = None, timeout: int = 120) -> str:
    """Run git in a cloned workspace with the same hardened flags as the clone (no hooks, no global config).

    Output keeps the repository's own line endings (no autocrlf: the global config is not read).
    """
    with tempfile.TemporaryDirectory() as scratch:
        try:
            out = subprocess.run(
                ["git", *_git_flags(scratch), "-c", "core.quotePath=false", *args],
                cwd=ws,
                env=_git_env(scratch),
                input=stdin.encode("utf-8", errors="surrogateescape") if stdin is not None else None,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            raise IngestError("git_failed", f"git {args[0]} did not finish in time") from e
    if out.returncode != 0:
        lines = out.stderr.decode("utf-8", "replace").strip().splitlines()
        raise IngestError("git_failed", lines[-1][:300] if lines else f"git {args[0]} failed")
    return out.stdout.decode("utf-8", errors="surrogateescape")


def default_branch(repository_url: str, timeout: int) -> str | None:
    """The remote's default branch (HEAD), or None when it cannot be read."""
    with tempfile.TemporaryDirectory() as scratch:
        try:
            out = _run_git(["ls-remote", "--symref", repository_url, "HEAD"], None, timeout, scratch)
        except IngestError:
            return None
    for ln in out.splitlines():
        if ln.startswith("ref: refs/heads/") and "\tHEAD" in ln:
            return ln[len("ref: refs/heads/") :].split("\t", 1)[0]
    return None


def resolve_ref(target: Target, timeout: int) -> str:
    if _SHA.match(target.ref):
        return target.ref
    with tempfile.TemporaryDirectory() as scratch:
        try:
            out = _run_git(
                [
                    "ls-remote",
                    target.repository_url,
                    target.ref,
                    f"refs/heads/{target.ref}",
                    f"refs/tags/{target.ref}",
                    f"refs/tags/{target.ref}^{{}}",
                ],
                None,
                timeout,
                scratch,
            )
        except IngestError as e:
            raise IngestError("ref_not_found", f"Could not resolve ref '{target.ref}'") from e
    lines = [ln.split("\t") for ln in out.strip().splitlines() if "\t" in ln]
    if not lines:
        default = default_branch(target.repository_url, timeout)
        hint = f" The default branch is '{default}'." if default and default != target.ref else ""
        raise IngestError("ref_not_found", f"Ref '{target.ref}' not found.{hint}")
    peeled = [sha for sha, name in lines if name.endswith("^{}")]
    heads = [sha for sha, name in lines if name == f"refs/heads/{target.ref}"]
    return (peeled or heads or [lines[0][0]])[0]


def clone(target: Target, dest: Path, timeout: int, max_mb: int, max_files: int) -> None:
    assert target.revision and _SHA.match(target.revision)
    dest.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory() as scratch:
        _run_git(["init", "-q"], dest, timeout, scratch)
        _run_git(["remote", "add", "origin", target.repository_url], dest, timeout, scratch)
        _run_git(["fetch", "-q", "--depth", "1", "--no-tags", "origin", target.revision], dest, timeout, scratch)
        _run_git(["checkout", "-q", "--detach", "FETCH_HEAD"], dest, timeout, scratch)
    total, count = 0, 0
    for p in dest.rglob("*"):
        if ".git" in p.parts[len(dest.parts) :][:1]:
            continue
        if p.is_file():
            count += 1
            total += p.stat().st_size
    if count > max_files:
        raise IngestError("too_many_files", f"Repository has more than {max_files} files")
    if total > max_mb * 1024 * 1024:
        raise IngestError("repository_too_large", f"Repository is larger than {max_mb} MB")


def git_in_workspace(ws: Path, args: list[str], timeout: int = 60) -> str:
    """Local-only git commands in a cloned workspace (diff, checkout of our own edits)."""
    with tempfile.TemporaryDirectory() as scratch:
        return _run_git(args, ws, timeout, scratch)
