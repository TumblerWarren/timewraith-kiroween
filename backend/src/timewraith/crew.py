"""Local setup the app does for the user: start Docker Desktop, run the Kiro Crew image, and sign in to Kiro.

- Docker Desktop is started only when the user presses the button (POST /system/docker/start).
- The Kiro Crew image runs as one long-lived container. It gets no repository and no workspace: agents receive
  source only inside their prompts. Its home directory is a named volume, so the Kiro sign-in persists.
- Sign-in uses kiro-cli's OAuth device flow. The backend runs `kiro-cli login --use-device-flow` in the container,
  reads the one-time code and URL it prints, and hands them to the frontend. The user approves in their own browser;
  the backend never sees a password or token.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from .config import get_settings

IMAGE = "ghcr.io/kirodotdev/kirocrew:stable"
CONTAINER = get_settings().crew_container
VOLUME = get_settings().crew_volume
# The Docker network the Crew joins when TimeWraith itself runs in Docker (compose), so it can reach the backend.
NETWORK = get_settings().crew_network

_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
# "Code: XQFX-WDVN" (Builder ID) and "And confirm the code: JSNZ-NGGR" (Google, GitHub)
_CODE = re.compile(r"(?i:code):\s*([A-Z0-9]{4}-[A-Z0-9]{4})")
LoginMethod = Literal["builder_id", "google", "github"]
# The helper that picks Google or GitHub in kiro-cli's sign-in menu (it shows the menu only in a terminal).
LOGIN_HELPER = Path(__file__).resolve().parents[2] / "agents" / "tw_login.py"
LOGIN_HELPER_IN_CONTAINER = "/home/kirocrew/.tw/tw_login.py"
_URL = re.compile(r"https://[^\s\"'<>]+")
# Sign-in pages kiro-cli is known to use; anything else is not shown as a link.
_LOGIN_HOSTS = ("awsapps.com", "kiro.dev", "aws.amazon.com", "signin.aws", "amazoncognito.com")

REJECTED_MESSAGE = "Kiro rejected the saved sign-in (it expired or was revoked). Sign in again."
LOGIN_TIMEOUT_S = 15 * 60
STATUS_TTL_S = 15.0
# Kill every `kiro-cli login` process and sign-in helper in the container, except this shell itself.
# `kiro-cli chat` (agent calls) does not match.
_STOP_LOGIN = (
    'for p in /proc/[0-9]*; do n="${p#/proc/}"; [ "$n" = "$$" ] && continue; '
    "c=$(tr '\\000' ' ' < \"$p/cmdline\" 2>/dev/null) || continue; "
    'case "$c" in *"kiro-cli login"*|*tw_login.py*) kill "$n" 2>/dev/null;; esac; done; true'
)


def strip_ansi(text: str) -> str:
    return _ANSI.sub("", text)


def parse_device_output(text: str) -> tuple[str | None, str | None]:
    """The one-time code and the sign-in URL from kiro-cli's device-flow output, if present and trusted."""
    clean = strip_ansi(text)
    code_m = _CODE.search(clean)
    url = None
    for m in _URL.finditer(clean):
        host = (urlsplit(m.group(0)).hostname or "").lower()
        if any(host == h or host.endswith("." + h) for h in _LOGIN_HOSTS):
            url = m.group(0)
            break
    return (code_m.group(1) if code_m else None), url


def _docker(args: list[str], timeout: float = 30) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["docker", *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            encoding="utf-8",
            errors="replace",
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        return subprocess.CompletedProcess(["docker", *args], 125, "", str(e))


def _desktop_paths() -> list[Path]:
    roots = [os.environ.get("PROGRAMFILES", r"C:\Program Files"), os.environ.get("PROGRAMW6432", r"C:\Program Files")]
    return [Path(r) / "Docker" / "Docker" / "Docker Desktop.exe" for r in roots]


@dataclass
class LoginState:
    state: Literal["idle", "pending", "done", "failed"] = "idle"
    code: str | None = None
    url: str | None = None
    error: str | None = None
    method: str = "builder_id"
    started: float = 0.0
    proc: subprocess.Popen[bytes] | None = field(default=None, repr=False)


class CrewManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.docker_started_at = 0.0
        self.install: Literal["idle", "pulling", "starting", "failed"] = "idle"
        self.install_error: str | None = None
        self.login = LoginState()
        self._signed_in: tuple[float, bool] = (0.0, False)
        self._account: str | None = None
        self._rejected = False  # Kiro refused the saved token (mark_sign_in_rejected)

    # ---------- Docker Desktop ----------

    def docker_running(self) -> bool:
        r = _docker(["info", "--format", "{{.OSType}}"], timeout=15)
        return r.returncode == 0 and r.stdout.strip() == "linux"

    def can_start_docker(self) -> bool:
        if sys.platform == "win32":
            return any(p.exists() for p in _desktop_paths())
        return sys.platform == "darwin"

    def start_docker(self) -> str:
        if self.docker_running():
            return "Docker is already running"
        if sys.platform == "win32":
            exe = next((p for p in _desktop_paths() if p.exists()), None)
            if not exe:
                raise RuntimeError("Docker Desktop is not installed in the usual folder; start it yourself")
            flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            subprocess.Popen([str(exe)], creationflags=flags, close_fds=True)  # noqa: S603 (fixed path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-a", "Docker"])
        else:
            raise RuntimeError("Start the Docker service yourself on Linux (it needs administrator rights)")
        self.docker_started_at = time.monotonic()
        return "Docker Desktop is starting; this usually takes under two minutes"

    # ---------- the Kiro Crew container ----------

    def container_state(self) -> Literal["missing", "stopped", "running"]:
        r = _docker(["inspect", "-f", "{{.State.Running}}", CONTAINER], timeout=15)
        if r.returncode != 0:
            return "missing"
        return "running" if r.stdout.strip() == "true" else "stopped"

    def image_present(self) -> bool:
        return _docker(["image", "inspect", IMAGE], timeout=15).returncode == 0

    def start_crew(self) -> str:
        with self._lock:
            if self.install in {"pulling", "starting"}:
                return "Kiro Crew is already being set up"
            self.install, self.install_error = "starting", None
        threading.Thread(target=self._install, daemon=True, name="crew-install").start()
        return "Setting up Kiro Crew"

    def _install(self) -> None:
        try:
            if not self.image_present():
                self.install = "pulling"
                r = _docker(["pull", IMAGE], timeout=1800)
                if r.returncode != 0:
                    raise RuntimeError(_last_line(r.stderr or r.stdout) or "docker pull failed")
            self.install = "starting"
            state = self.container_state()
            if state == "missing":
                # The agents need the network to reach the model; they get no repository, no workspace, no tools.
                r = _docker(
                    [
                        "run",
                        "-d",
                        "--name",
                        CONTAINER,
                        *get_settings().group_labels("crew"),
                        *(["--network", NETWORK] if NETWORK else []),
                        "--restart",
                        "unless-stopped",
                        "--cap-drop",
                        "ALL",
                        "--security-opt",
                        "no-new-privileges",
                        "--no-healthcheck",
                        "--memory",
                        "2g",
                        "--pids-limit",
                        "256",
                        "-v",
                        f"{VOLUME}:/home/kirocrew",
                        "--entrypoint",
                        "sleep",
                        IMAGE,
                        "infinity",
                    ],
                    timeout=120,
                )
            elif state == "stopped":
                r = _docker(["start", CONTAINER], timeout=60)
            else:
                r = subprocess.CompletedProcess([], 0, "", "")
            if r.returncode != 0:
                raise RuntimeError(_last_line(r.stderr or r.stdout) or "could not start the container")
            self.install = "idle"
        except RuntimeError as e:
            self.install, self.install_error = "failed", str(e)[:300]

    # ---------- Kiro sign-in (device flow) ----------

    def remove_crew(self) -> None:
        """Remove only TimeWraith's fixed Crew container and its saved-sign-in volume."""
        with self._lock:
            if self.install in {"pulling", "starting"} or self.login.state == "pending":
                raise RuntimeError("Wait for Crew setup or sign-in to finish before deleting the Crew")
            if not self.docker_running():
                raise RuntimeError("Start Docker before deleting the Crew")
            result = _docker(["rm", "-f", CONTAINER], timeout=60)
            if result.returncode != 0 and "no such container" not in result.stderr.lower():
                raise RuntimeError(_last_line(result.stderr or result.stdout) or "Could not delete the Crew container")
            # Invalidate credentials even if removing the volume subsequently fails.
            self._signed_in = (0.0, False)
            self._account = None
            self._rejected = False
            self.login = LoginState()
            self.install, self.install_error = "idle", None
            result = _docker(["volume", "rm", VOLUME], timeout=60)
            missing_volume = (
                "no such volume" in result.stderr.lower() or f"{VOLUME}: not found" in result.stderr.lower()
            )
            if result.returncode != 0 and not missing_volume:
                raise RuntimeError(
                    "The Crew container was deleted, but its saved sign-in could not be removed. "
                    + (_last_line(result.stderr or result.stdout) or "Try Delete Crew again.")
                )

    def mark_sign_in_rejected(self) -> None:
        """Kiro refused the saved token in an agent call. `kiro-cli whoami` only reads the local file, so it would
        keep reporting signed in; until a new sign-in finishes, show the step as signed out with the reason."""
        self._rejected = True
        self._signed_in = (time.monotonic(), False)
        self._account = None
        if self.login.state != "pending":
            self.login = LoginState(state="failed", error=REJECTED_MESSAGE)

    def signed_in(self, fresh: bool = False) -> bool:
        if self._rejected:
            return False
        at, value = self._signed_in
        if not fresh and time.monotonic() - at < STATUS_TTL_S:
            return value
        ok = (
            self.container_state() == "running"
            and _docker(["exec", "-w", "/home/kirocrew", CONTAINER, "kiro-cli", "whoami"], timeout=20).returncode == 0
        )
        self._signed_in = (time.monotonic(), ok)
        return ok

    def ready(self) -> bool:
        """True when agent calls can go to Kiro Crew: container running and signed in."""
        return self.signed_in()

    def account(self) -> str | None:
        """Who is signed in, as kiro-cli whoami prints it (for example "Builder ID · name@example.com")."""
        r = _docker(["exec", "-w", "/home/kirocrew", CONTAINER, "kiro-cli", "whoami"], timeout=20)
        if r.returncode != 0:
            return None
        lines = [ln.strip() for ln in strip_ansi(r.stdout).splitlines() if ln.strip()]
        method = next((ln.removeprefix("Logged in with ").strip() for ln in lines if ln.startswith("Logged in")), "")
        email = next((ln.split(":", 1)[1].strip() for ln in lines if ln.lower().startswith("email:")), "")
        return " · ".join(p for p in (method, email) if p) or None

    def logout(self) -> None:
        """Sign the Kiro Crew container out of Kiro. Investigations then fall back to the stub runtime."""
        if self.container_state() != "running":
            raise RuntimeError("The Kiro Crew container is not running")
        lg = self.login
        if lg.proc and lg.proc.poll() is None:
            lg.proc.kill()
        r = _docker(["exec", "-w", "/home/kirocrew", CONTAINER, "kiro-cli", "logout"], timeout=30)
        self._signed_in = (0.0, False)
        self._account = None
        self._rejected = False
        self.login = LoginState()
        if r.returncode != 0 and self.signed_in(fresh=True):
            raise RuntimeError(_last_line(r.stderr or r.stdout) or "kiro-cli logout failed")

    def _stop_container_login(self) -> None:
        """Stop any `kiro-cli login` still running in the container. Killing the local `docker exec` does not stop
        the process inside the container, and the image has no pkill, so the shell finds it in /proc."""
        _docker(["exec", CONTAINER, "sh", "-c", _STOP_LOGIN], timeout=20)

    def cancel_login(self) -> None:
        """Stop a pending sign-in so the user can start again with a new code (for example after the browser
        reported an AWS Builder ID error). Safe to call when nothing is pending."""
        with self._lock:
            lg = self.login
            self.login = LoginState()  # the watcher of the old attempt no longer updates what status() shows
        if lg.proc and lg.proc.poll() is None:
            lg.proc.kill()
        if self.container_state() == "running":
            self._stop_container_login()
        self._signed_in = (0.0, False)

    def _login_command(self, method: LoginMethod) -> list[str]:
        if method == "builder_id":
            return ["docker", "exec", CONTAINER, "kiro-cli", "login", "--license", "free", "--use-device-flow"]
        r = subprocess.run(
            ["docker", "exec", "-i", CONTAINER, "sh", "-c", f'mkdir -p "$(dirname {LOGIN_HELPER_IN_CONTAINER})" '
             f"&& cat > {LOGIN_HELPER_IN_CONTAINER}"],
            input=LOGIN_HELPER.read_text(encoding="utf-8"), capture_output=True, text=True, timeout=30, check=False,
            encoding="utf-8",
        )  # fmt: skip
        if r.returncode != 0:
            raise RuntimeError(f"Could not prepare the sign-in: {_last_line(r.stderr) or 'docker exec failed'}")
        return ["docker", "exec", CONTAINER, "python3", LOGIN_HELPER_IN_CONTAINER, method]

    def start_login(self, method: LoginMethod = "builder_id", wait_s: float = 20.0) -> LoginState:
        if method not in ("builder_id", "google", "github"):
            raise RuntimeError("Choose Builder ID, Google or GitHub")
        if self.container_state() != "running":
            raise RuntimeError("Start Kiro Crew first")
        with self._lock:
            lg = self.login
            if lg.state == "pending" and lg.proc and lg.proc.poll() is None:
                return lg
            self._stop_container_login()  # a login left over from an earlier attempt would hold the old code
            proc = subprocess.Popen(
                self._login_command(method),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
            )
            self.login = LoginState(state="pending", started=time.monotonic(), proc=proc, method=method)
        threading.Thread(target=self._watch_login, args=(self.login,), daemon=True, name="crew-login").start()
        end = time.monotonic() + wait_s
        while time.monotonic() < end and self.login.state == "pending" and not self.login.code:
            time.sleep(0.2)
        return self.login

    def _watch_login(self, lg: LoginState) -> None:
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
        self._signed_in = (0.0, False)
        if rc == 0:
            self._rejected = False  # a new sign-in replaces the token Kiro refused
        if rc == 0 and self.signed_in(fresh=True):
            lg.state = "done"
        else:
            lg.state = "failed"
            lg.error = "Sign-in did not finish. Start it again and approve the code in your browser."

    # ---------- status ----------

    def status(self) -> dict[str, Any]:
        installed = shutil.which("docker") is not None
        running = installed and self.docker_running()
        starting = (not running) and self.docker_started_at > 0 and time.monotonic() - self.docker_started_at < 240
        container = self.container_state() if running else "missing"
        signed = running and container == "running" and self.signed_in()
        if signed and self._account is None:
            self._account = self.account()
        elif not signed:
            self._account = None
        lg = self.login
        if lg.state == "pending" and time.monotonic() - lg.started > LOGIN_TIMEOUT_S:
            lg.state, lg.error = "failed", "The sign-in code expired. Start again."
        return {
            "docker": {
                "installed": installed,
                "running": running,
                "starting": starting,
                "can_start": installed and not running and self.can_start_docker(),
            },
            "crew": {
                "image": IMAGE,
                "container": container,
                "install": self.install,
                "install_error": self.install_error,
                "signed_in": signed,
                "account": self._account,
            },
            "login": {
                "state": "done" if signed else lg.state,
                "code": lg.code if lg.state == "pending" else None,
                "url": lg.url if lg.state == "pending" else None,
                "error": lg.error,
                "method": lg.method,
            },
        }


def _last_line(text: str) -> str:
    lines = [ln for ln in strip_ansi(text).strip().splitlines() if ln.strip()]
    return lines[-1][:300] if lines else ""


manager = CrewManager()
