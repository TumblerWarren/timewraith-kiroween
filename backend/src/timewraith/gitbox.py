"""The GitHub container: sign-in, and a place to run `git` and `gh` against GitHub.

- One long-lived container (`timewraith-git`), built from backend/docker/git.Dockerfile: git and GitHub's `gh`.
  Its home is a named volume, so the GitHub sign-in persists. It is separate from the Kiro Crew, so the Kiro agents
  can never read the GitHub token, and it has no TimeWraith folder mounted: it only gets patches on stdin.
- Sign-in uses `gh auth login --web`, GitHub's device flow. The backend reads the one-time code and the link from its
  output and shows them in the UI; the user approves in their own browser. The backend never sees the token.
- `exec` is the only way the rest of the backend runs anything in the container (publish.py).
"""

from __future__ import annotations

import re
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from .config import get_settings
from .crew import _docker, _last_line, strip_ansi

IMAGE = "timewraith-git:local"
CONTAINER = get_settings().git_container
VOLUME = get_settings().git_volume
NETWORK = get_settings().crew_network
DOCKERFILE = Path(__file__).resolve().parents[2] / "docker" / "git.Dockerfile"

# "! First copy your one-time code: 24B0-096A" and "Open this URL ...: https://github.com/login/device"
_CODE = re.compile(r"one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})", re.I)
_URL = re.compile(r"https://github\.com/login/device\S*")
_TOKEN = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")
LOGIN_TIMEOUT_S = 15 * 60
IDENTITY_TTL_S = 30.0
SCOPES = "public_repo"
# Kill every `gh auth login` in the container, except this shell itself.
_STOP_LOGIN = (
    'for p in /proc/[0-9]*; do n="${p#/proc/}"; [ "$n" = "$$" ] && continue; '
    "c=$(tr '\\000' ' ' < \"$p/cmdline\" 2>/dev/null) || continue; "
    'case "$c" in *"gh auth login"*) kill "$n" 2>/dev/null;; esac; done; true'
)


def scrub(text: str) -> str:
    """Remove anything that looks like a GitHub token before text is logged or shown."""
    return _TOKEN.sub("***", strip_ansi(text))


def parse_device_output(text: str) -> tuple[str | None, str | None]:
    clean = strip_ansi(text)
    code = _CODE.search(clean)
    url = _URL.search(clean)
    return (code.group(1).upper() if code else None), (url.group(0) if url else None)


def exec_in(
    args: list[str], *, env: dict[str, str] | None = None, stdin: str | None = None, timeout: float = 60
) -> subprocess.CompletedProcess[str]:
    """Run a command in the GitHub container. Arguments and environment values go as a list, never through a shell."""
    cmd = ["docker", "exec", "-i"]
    for k, v in (env or {}).items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [CONTAINER, *args]
    try:
        return subprocess.run(
            cmd, input=stdin or "", capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=timeout, check=False,
        )  # fmt: skip
    except (OSError, subprocess.TimeoutExpired) as e:
        return subprocess.CompletedProcess(cmd, 125, "", str(e))


@dataclass
class GitLogin:
    state: Literal["idle", "pending", "done", "failed"] = "idle"
    code: str | None = None
    url: str | None = None
    error: str | None = None
    started: float = 0.0
    proc: subprocess.Popen[bytes] | None = field(default=None, repr=False)


class GitBox:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.install: Literal["idle", "building", "starting", "failed"] = "idle"
        self.install_error: str | None = None
        self.login = GitLogin()
        self._identity: tuple[float, bool, str | None] = (0.0, False, None)

    # ---------- the container ----------

    def container_state(self) -> Literal["missing", "stopped", "running"]:
        r = _docker(["inspect", "-f", "{{.State.Running}}", CONTAINER], timeout=15)
        if r.returncode != 0:
            return "missing"
        return "running" if r.stdout.strip() == "true" else "stopped"

    def start(self) -> str:
        with self._lock:
            if self.install in {"building", "starting"}:
                return "The GitHub container is already being set up"
            self.install, self.install_error = "starting", None
        threading.Thread(target=self._install, daemon=True, name="git-install").start()
        return "Setting up the GitHub container"

    def _install(self) -> None:
        try:
            if _docker(["image", "inspect", IMAGE], timeout=15).returncode != 0:
                self.install = "building"
                if not DOCKERFILE.is_file():
                    raise RuntimeError("The GitHub container's Dockerfile is missing from this install")
                r = _docker(["build", "-q", "-t", IMAGE, "-f", str(DOCKERFILE), str(DOCKERFILE.parent)], timeout=900)
                if r.returncode != 0:
                    raise RuntimeError(_last_line(r.stderr or r.stdout) or "docker build failed")
            self.install = "starting"
            state = self.container_state()
            if state == "missing":
                r = _docker(
                    ["run", "-d", "--name", CONTAINER, *get_settings().group_labels("git"),
                     "--restart", "unless-stopped", "--cap-drop", "ALL",
                     "--security-opt", "no-new-privileges", "--memory", "512m", "--pids-limit", "256",
                     *(["--network", NETWORK] if NETWORK else []), "-v", f"{VOLUME}:/home/gh", IMAGE],
                    timeout=120,
                )  # fmt: skip
            elif state == "stopped":
                r = _docker(["start", CONTAINER], timeout=60)
            else:
                r = subprocess.CompletedProcess([], 0, "", "")
            if r.returncode != 0:
                raise RuntimeError(_last_line(r.stderr or r.stdout) or "could not start the container")
            self.install = "idle"
        except RuntimeError as e:
            self.install, self.install_error = "failed", str(e)[:300]

    # ---------- who is signed in ----------

    def identity(self, fresh: bool = False) -> tuple[bool, str | None]:
        """(connected, GitHub user name). `gh auth status` also fails when the token was revoked."""
        at, ok, user = self._identity
        if not fresh and time.monotonic() - at < IDENTITY_TTL_S:
            return ok, user
        ok, user = False, None
        if self.container_state() == "running" and exec_in(["gh", "auth", "status", "--hostname", "github.com"],
                                                           timeout=30).returncode == 0:  # fmt: skip
            who = exec_in(["gh", "api", "user", "--jq", ".login"], timeout=30)
            user = who.stdout.strip() or None if who.returncode == 0 else None
            ok = user is not None
        self._identity = (time.monotonic(), ok, user)
        return ok, user

    # ---------- sign-in (device flow) ----------

    def _stop_container_login(self) -> None:
        exec_in(["sh", "-c", _STOP_LOGIN], timeout=20)

    def start_login(self, wait_s: float = 25.0) -> GitLogin:
        if self.container_state() != "running":
            raise RuntimeError("Start the GitHub container first")
        with self._lock:
            lg = self.login
            if lg.state == "pending" and lg.proc and lg.proc.poll() is None:
                return lg
            self._stop_container_login()  # a login left from an earlier attempt would hold the old code
            proc = subprocess.Popen(  # noqa: S603 (fixed program and arguments)
                ["docker", "exec", CONTAINER, "gh", "auth", "login", "--hostname", "github.com",
                 "--git-protocol", "https", "--web", "--scopes", SCOPES],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            )  # fmt: skip
            self.login = GitLogin(state="pending", started=time.monotonic(), proc=proc)
        threading.Thread(target=self._watch_login, args=(self.login,), daemon=True, name="git-login").start()
        end = time.monotonic() + wait_s
        while time.monotonic() < end and self.login.state == "pending" and not self.login.code:
            time.sleep(0.2)
        return self.login

    def _watch_login(self, lg: GitLogin) -> None:
        assert lg.proc and lg.proc.stdout
        buf = ""
        killer = threading.Timer(LOGIN_TIMEOUT_S, lg.proc.kill)
        killer.start()
        try:
            while True:
                chunk = lg.proc.stdout.read1(512) if hasattr(lg.proc.stdout, "read1") else lg.proc.stdout.read(512)
                if not chunk:
                    break
                buf = (buf + chunk.decode("utf-8", "replace"))[-8000:]
                if not lg.code:
                    lg.code, lg.url = parse_device_output(buf)
            rc = lg.proc.wait()
        finally:
            killer.cancel()
        if self.login is not lg:
            return  # cancelled: a new attempt (or none) owns the sign-in state now
        if rc == 0:
            exec_in(["gh", "auth", "setup-git"], timeout=30)  # git uses the gh token for https pushes
        ok, _ = self.identity(fresh=True)
        if rc == 0 and ok:
            lg.state = "done"
        else:
            lg.state = "failed"
            lg.error = "Sign-in did not finish. Start it again and approve the code on github.com."

    def cancel_login(self) -> None:
        with self._lock:
            lg = self.login
            self.login = GitLogin()
        if lg.proc and lg.proc.poll() is None:
            lg.proc.kill()
        if self.container_state() == "running":
            self._stop_container_login()

    def logout(self) -> None:
        """Remove the GitHub token from the container."""
        if self.container_state() != "running":
            raise RuntimeError("The GitHub container is not running")
        self.cancel_login()
        r = exec_in(["gh", "auth", "logout", "--hostname", "github.com"], timeout=30)
        self._identity = (0.0, False, None)
        if r.returncode != 0 and self.identity(fresh=True)[0]:
            raise RuntimeError(scrub(_last_line(r.stderr or r.stdout)) or "gh auth logout failed")

    # ---------- status ----------

    def status(self) -> dict[str, Any]:
        container = self.container_state()
        connected, user = self.identity() if container == "running" else (False, None)
        lg = self.login
        if lg.state == "pending" and time.monotonic() - lg.started > LOGIN_TIMEOUT_S:
            lg.state, lg.error = "failed", "The sign-in code expired. Start again."
        return {
            "container": container,
            "install": self.install,
            "install_error": self.install_error,
            "connected": connected,
            "user": user,
            "scopes": SCOPES,
            "login": {
                "state": "done" if connected else lg.state,
                "code": lg.code if lg.state == "pending" else None,
                "url": lg.url if lg.state == "pending" else None,
                "error": lg.error,
            },
        }


manager = GitBox()
