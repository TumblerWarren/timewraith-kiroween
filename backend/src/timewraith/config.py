"""Settings from TW_* environment variables or backend/.env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TW_", env_file=REPO_ROOT / "backend" / ".env", extra="ignore")

    data_dir: Path = Path.home() / ".timewraith"
    # Set when the backend runs in Docker: the name of the volume that holds `data_dir`, so sandbox containers can
    # mount a case's folder from it (sandbox._mount). Empty on a PC, where folders are bind-mounted.
    data_volume: str = ""
    # Where the built frontend is served from (the Docker image sets it). Empty: API only; Vite serves the UI.
    web_dir: str = ""
    # The Kiro Crew container, its volume and the Docker network it joins (compose names them explicitly).
    # Docker Desktop shows containers that share this compose project label as one group. The app, the Kiro Crew,
    # the GitHub container and the test sandboxes all carry it, so they appear under one name.
    project: str = "timewraith"
    crew_container: str = "timewraith-crew"
    crew_volume: str = "timewraith-crew-home"
    crew_network: str = ""
    # The container that holds the GitHub sign-in and does the fork, push and pull request (gitbox.py).
    git_container: str = "timewraith-git"
    git_volume: str = "timewraith-git-home"
    agent_runtime: str = "auto"  # auto (Kiro Crew container when signed in, else stub) | stub | command
    # Command for the "command" runtime. {agent} is replaced by the agent profile name; the prompt goes to stdin.
    agent_command: str = ""
    agent_timeout_s: int = 300
    github_token: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]

    # Limits (user decisions 2026-11-11)
    clone_timeout_s: int = 120
    max_workspace_mb: int = 500
    max_files: int = 50_000
    max_parse_bytes: int = 1_000_000
    max_review_candidates: int = 15
    max_experiment_candidates: int = 8
    max_bugs_to_fix: int = 5
    max_agent_calls: int = 40
    max_fix_attempts: int = 3
    investigation_budget_s: int = 3 * 60 * 60  # active time per case; installing, fixing and reviewing all draw on it
    repeat_runs: int = 3
    max_patch_files: int = 3
    max_patch_lines: int = 60

    # Fix sessions (Doctor Stitch with tools, fixsession.py)
    fix_session_s: int = 12 * 60
    max_tool_calls: int = 40
    max_test_runs: int = 8
    max_other_test_runs: int = 4

    # Planner rounds (Wraith Director reads the coverage ledger and proposes new directions)
    max_plan_rounds: int = 2
    max_intents_per_round: int = 3

    # Design sessions (Pumpkin Mechanic repairing an adapter with tools, designsession.py)
    design_session_s: int = 8 * 60
    # Repair rounds for an adapter that fails its baseline check: each round re-sweeps, and Pumpkin is told why his
    # previous repair was rejected. After the last round the experiment is dropped, with the reasons on record.
    adapter_repair_rounds: int = 2
    # A case that finds nothing is only "clean" if enough of its experiments ran. Below this share it is inconclusive.
    min_experiments_ran: float = 0.7
    # Before any experiment: can a generated test run here at all? Agent repair rounds if the repository's own setup and
    # the default profile both fail. If it still cannot, the case stops early and says why.
    environment_repair_rounds: int = 2
    # The package that supplies Temporal. It is installed outside the repository, only when the code under test uses
    # Temporal and this Node lacks it.
    temporal_polyfill: str = "temporal-polyfill"
    # Waits before retrying an agent request the service throttled; a throttle is not a failed repair.
    throttle_waits_s: tuple[int, ...] = (20, 60, 120)
    max_design_calls: int = 25
    max_adapter_runs: int = 8
    max_baseline_checks: int = 3

    # Verification sessions (Raven Archivist with tools, verifysession.py)
    verify_session_s: int = 10 * 60
    max_verify_calls: int = 30
    max_probes: int = 12
    max_verify_tests: int = 4
    max_issue_searches: int = 3
    # How the Kiro Crew container reaches this backend's fix tools (Docker Desktop maps host.docker.internal).
    crew_backend_url: str = "http://host.docker.internal:8787"

    # Sandbox (Docker)
    docker_cpus: str = "4"
    docker_memory: str = "4g"
    install_timeout_s: int = 20 * 60
    install_retries: int = 3  # self-healing retries after a failed install (installfix.py)
    # Install sessions: the install mechanic repairs an install the fixed retries could not heal (installsession.py)
    # Installing is not boxed in: long sessions, many commands, several rounds. The sandbox is the limit, not the agent.
    install_session_s: int = 45 * 60
    max_install_calls: int = 400
    max_install_commands: int = 300
    install_rounds: int = 3
    test_timeout_s: int = 180
    # One generated harness file in the zone sweep: killed on its own after this, the other files still report.
    sweep_file_timeout_s: int = 300

    def group_labels(self, service: str) -> list[str]:
        """`docker run` arguments that put a container in this app's group (the compose project labels)."""
        return [
            "--label", f"com.docker.compose.project={self.project}",
            "--label", f"com.docker.compose.service={service}",
        ]  # fmt: skip

    @property
    def workspaces(self) -> Path:
        return self.data_dir / "workspaces"

    @property
    def branches(self) -> Path:
        return self.data_dir / "branches"

    @property
    def artifacts(self) -> Path:
        return self.data_dir / "artifacts"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "timewraith.sqlite3"

    def check_paths(self) -> None:
        data = self.data_dir.resolve()
        if data == REPO_ROOT or REPO_ROOT in data.parents:
            raise RuntimeError("TW_DATA_DIR must be outside the TimeWraith repository")
        for p in (self.workspaces, self.artifacts, self.branches):
            p.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
