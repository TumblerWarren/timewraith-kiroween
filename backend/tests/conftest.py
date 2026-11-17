from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

# Settings come from TW_* variables, so a shell that ran the Docker stack (TW_DATA_VOLUME, TW_CREW_CONTAINER, ...) would
# change what the tests see. Start from a clean slate.
for _name in [n for n in os.environ if n.startswith("TW_")]:
    del os.environ[_name]
# The API module reads settings at import time; always point it at a throwaway data dir outside the repo. Never
# reuse TW_DATA_DIR from the shell: importing the API recovers that store, which would stop its running cases.
os.environ["TW_DATA_DIR"] = tempfile.mkdtemp(prefix="tw-test-")
os.environ["TW_AGENT_RUNTIME"] = "stub"


def write_repo(root: Path, files: dict[str, str]) -> Path:
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    return root


EXPIRY_LIB = {
    "package.json": '{"name":"expiry-lib","type":"module","devDependencies":{"vitest":"^2.0.0"},'
    '"scripts":{"test":"vitest run"}}',
    "package-lock.json": "{}",
    "src/token.ts": (
        "export interface Token { issuedAt: number; ttlMs: number }\n"
        "\n"
        "export function isExpired(token: Token): boolean {\n"
        "  const expiresAt = token.issuedAt + token.ttlMs;\n"
        "  return Date.now() > expiresAt;\n"
        "}\n"
        "\n"
        "export function formatDay(d: Date, timeZone: string): string {\n"
        "  return d.toLocaleDateString('en-CA', { timeZone });\n"
        "}\n"
        "\n"
        "const VERSION = '1.0.0';\n"
    ),
    "src/token.test.ts": "import { vi } from 'vitest';\nvi.useFakeTimers();\nimport { isExpired } from './token';\n",
    "README.md": "# expiry-lib\n",
}

NO_TIME = {
    "package.json": '{"name":"no-time"}',
    "src/math.js": "export function add(a, b) { return a + b; }\n",
}

PYTHON_ONLY = {"app.py": "print('hi')\n", "lib/util.py": "x = 1\n"}


@pytest.fixture
def expiry_repo(tmp_path: Path) -> Path:
    return write_repo(tmp_path / "expiry", EXPIRY_LIB)


@pytest.fixture
def no_time_repo(tmp_path: Path) -> Path:
    return write_repo(tmp_path / "notime", NO_TIME)


@pytest.fixture
def python_repo(tmp_path: Path) -> Path:
    return write_repo(tmp_path / "py", PYTHON_ONLY)
