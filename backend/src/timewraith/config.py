"""Settings from TW_* environment variables or backend/.env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TW_", env_file=REPO_ROOT / "backend" / ".env", extra="ignore")

    data_dir: Path = Path.home() / ".timewraith"
    agent_runtime: str = "stub"  # stub | command
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
    investigation_budget_s: int = 30 * 60
    repeat_runs: int = 3
    max_patch_files: int = 3
    max_patch_lines: int = 60

    # Sandbox (Docker)
    docker_cpus: str = "2"
    docker_memory: str = "4g"
    install_timeout_s: int = 600
    test_timeout_s: int = 180

    @property
    def workspaces(self) -> Path:
        return self.data_dir / "workspaces"

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
        for p in (self.workspaces, self.artifacts):
            p.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
