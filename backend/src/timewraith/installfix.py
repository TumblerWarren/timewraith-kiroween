"""Self-healing dependency install: a fixed list of retry actions, matched to the install log.

The install is the only sandbox step with network, and it runs the target repository's own scripts, so nothing
here runs a command an agent wrote. Code picks an action when the log matches a known failure; otherwise Pumpkin
Mechanic may pick one from the same list, citing a log line, and code checks the citation (pipeline.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from typing import Literal

Action = Literal["newer_node", "ignore_scripts", "legacy_peer_deps", "relaxed_lockfile"]

# What each action does, in the words the case shows.
LABELS: dict[Action, str] = {
    "newer_node": "a newer Node version",
    "ignore_scripts": "install scripts skipped",
    "legacy_peer_deps": "peer dependency conflicts allowed",
    "relaxed_lockfile": "lockfile not enforced",
}
NODE_VERSIONS = ("20", "22", "24")

# Known failures, most specific first. A strong engine error comes before script failures; an engine warning
# (printed even on a good install) only counts after the script fix has been tried.
_PATTERNS: list[tuple[Action, re.Pattern[str]]] = [
    (
        "relaxed_lockfile",
        re.compile(
            r"npm ci` can only install|can only install packages when your package\.json and package-lock\.json"
            r"|Missing: \S+ from lock file|ERR_PNPM_OUTDATED_LOCKFILE|ERR_PNPM_LOCKFILE"
            r"|lockfile needs to be updated|The lockfile would have been modified",
            re.I,
        ),
    ),
    ("legacy_peer_deps", re.compile(r"\bERESOLVE\b|ERR_PNPM_PEER_DEP_ISSUES|conflicting peer dependency", re.I)),
    (
        "newer_node",
        re.compile(r"npm error code EBADENGINE|engine \"node\" is incompatible|ERR_PNPM_UNSUPPORTED_ENGINE", re.I),
    ),
    (
        "ignore_scripts",
        re.compile(
            r"npm error command sh -c|\bELIFECYCLE\b|lifecycle script|Command failed with exit code"
            r"|(pre|post)?install script|prepare script",
            re.I,
        ),
    ),
    ("newer_node", re.compile(r"npm warn EBADENGINE|Unsupported engine|requires? node", re.I)),
]

_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
_KEY = re.compile(r"error|ERR!|ERR_|failed|TS\d{4}|cannot|not found|EBADENGINE", re.I)


@dataclass(frozen=True)
class InstallOptions:
    node: str
    ignore_scripts: bool = False
    legacy_peer_deps: bool = False
    relaxed_lockfile: bool = False


def command(pm: str, o: InstallOptions) -> str:
    """The install command for one package manager and set of options. Only fixed flags, never agent text."""
    if pm == "npm":
        parts = ["npm install" if o.relaxed_lockfile else "npm ci", "--no-audit", "--no-fund"]
        if o.legacy_peer_deps:
            parts.append("--legacy-peer-deps")
    elif pm in {"pnpm", "yarn"}:
        lock = ("--no-frozen-lockfile" if pm == "pnpm" else "") if o.relaxed_lockfile else "--frozen-lockfile"
        parts = [f"corepack enable --install-directory /tmp/bin && /tmp/bin/{pm} install", lock]
        if o.legacy_peer_deps and pm == "pnpm":
            parts.append("--config.strict-peer-dependencies=false")
    else:
        raise ValueError(f"unknown package manager {pm!r}")
    if o.ignore_scripts:
        parts.append("--ignore-scripts")
    return " ".join(p for p in parts if p)


def apply(o: InstallOptions, action: Action, pm: str) -> InstallOptions | None:
    """The options with one more fix, or None when the action cannot change anything."""
    if action == "newer_node":
        newer = [v for v in NODE_VERSIONS if int(v) > int(o.node)]
        return replace(o, node=newer[0]) if newer else None
    if action == "ignore_scripts":
        return None if o.ignore_scripts else replace(o, ignore_scripts=True)
    if action == "legacy_peer_deps":
        return None if o.legacy_peer_deps or pm == "yarn" else replace(o, legacy_peer_deps=True)
    return None if o.relaxed_lockfile else replace(o, relaxed_lockfile=True)


def clean(log: str) -> str:
    return _ANSI.sub("", log)


def matches(log: str) -> list[tuple[Action, str]]:
    """(action, the log line that shows its known failure), in the order the actions should be tried."""
    lines = clean(log).splitlines()
    found: list[tuple[Action, str]] = []
    for action, rx in _PATTERNS:
        if any(a == action for a, _ in found):
            continue
        line = next((ln.strip() for ln in lines if rx.search(ln)), None)
        if line:
            found.append((action, line[:300]))
    return found


def applicable(o: InstallOptions, pm: str) -> list[Action]:
    return [a for a in LABELS if apply(o, a, pm) is not None]


def excerpt(log: str, limit: int = 12) -> str:
    """The lines that explain a failed install: error lines if there are any, otherwise the last lines."""
    lines = [ln.rstrip() for ln in clean(log).splitlines() if ln.strip()]
    key = [ln for ln in lines if _KEY.search(ln) and "npm warn deprecated" not in ln]
    return "\n".join((key or lines)[-limit:])[:2000]


def cites(log: str, line: str) -> bool:
    """True when the quoted line really is in the log (whitespace-insensitive)."""
    q = " ".join(line.split())
    return len(q) >= 8 and q in " ".join(clean(log).split())
