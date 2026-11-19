"""Known setups: what this project has already learned about getting JS and TS test runners to work.

Advice, not rules. An entry is shown to a repair agent only when the failure text matches it, and the agent decides
whether it applies. Nothing here runs a command or changes a file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Entry:
    id: str
    pattern: re.Pattern[str]
    advice: str
    runner: str | None = None


ENTRIES: tuple[Entry, ...] = (
    Entry(
        "vitest-include",
        re.compile(r"No test files found|include:", re.I),
        "Vitest only collects files its `include` setting matches. Some repositories use unusual patterns, such as "
        "`**/test.ts`. Write a config that extends the repository's own and adds `**/__tw__/*.tw.test.*` to include.",
        "vitest",
    ),
    Entry(
        "jest-testmatch",
        re.compile(r"No tests found|testMatch|testRegex|testPathPattern", re.I),
        "Jest collects only files matching `testMatch` or `testRegex`. Extend the repository's config with a pattern "
        "for `**/__tw__/*.tw.test.*`, and keep its `transform` and `moduleNameMapper` so TypeScript still compiles.",
        "jest",
    ),
    Entry(
        "temporal",
        re.compile(r"Temporal is not defined|Cannot find name 'Temporal'", re.I),
        "Node 22 has no Temporal. TimeWraith supplies a polyfill itself for code that uses it; do not install one "
        "into the repository.",
    ),
    Entry(
        "readonly-cache",
        re.compile(r"EROFS|read-only file system|EACCES.*(\.vite|\.cache|\.jest|node_modules/\.)", re.I),
        "The sandbox root is read-only. Point caches at /tmp (for Vitest, `cacheDir: '/tmp/vite'`; for Jest, "
        "`cacheDirectory: '/tmp/jest'`).",
    ),
    Entry(
        "esm-cjs",
        re.compile(
            r"Cannot use import statement|require is not defined|ERR_REQUIRE_ESM|Unexpected token 'export'", re.I
        ),
        "A module-system mismatch. Use `.mjs` for an ESM config and `.cjs` for CommonJS, and check the repository's "
        '`"type"` field in package.json and how its tests are transformed.',
    ),
    Entry(
        "workspace-build",
        re.compile(r"Cannot find module '(@[\w-]+/[\w-]+|\.\./[\w./-]+)'|Failed to resolve (entry|import)", re.I),
        "In a monorepo, a workspace package may need building before another package can import it. Look at the "
        "root package.json scripts for a build step and run it for the packages the tests need.",
    ),
    Entry(
        "package-manager",
        re.compile(r"packageManager|corepack|Unsupported URL Type|ERR_PNPM|YN0\d{2}", re.I),
        "Use the package manager version the repository pins (`packageManager` in package.json). `corepack` shims "
        "are already on PATH in every command. Yarn Berry needs `.yarnrc.yml`; pnpm may need `--frozen-lockfile`.",
    ),
    Entry(
        "node-version",
        re.compile(r"engine|unsupported.*node|requires node|node:.*not found", re.I),
        "The code may need a different Node. Read `engines` and `.nvmrc`, then try use_node with that major version.",
    ),
)


def advice_for(text: str, runner: str | None = None) -> list[str]:
    """The advice entries whose failure pattern appears in `text`, for this runner."""
    return [e.advice for e in ENTRIES if (e.runner in (None, runner)) and e.pattern.search(text)]


def advice_text(text: str, runner: str | None = None) -> str:
    items = advice_for(text, runner)
    return "\n".join(f"- {a}" for a in items) or "(nothing known matches this failure)"
