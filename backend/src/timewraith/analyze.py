"""Repository analysis from files only. Nothing in the target is executed."""

from __future__ import annotations

import json
import re
from pathlib import Path

from .models import CapabilityItem, CapabilityReport

JS_EXT = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"}
OTHER_LANG_EXT = {
    ".py": "Python",
    ".rb": "Ruby",
    ".go": "Go",
    ".java": "Java",
    ".php": "PHP",
    ".cs": "C#",
    ".rs": "Rust",
}
SKIP_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    ".next",
    "coverage",
    "vendor",
    ".turbo",
    ".cache",
    ".venv",
    "venv",
    ".tox",
    "__pycache__",
    ".pytest_cache",
}
FAKE_TIMER = re.compile(
    r"\b(vi|jest)\.(useFakeTimers|setSystemTime)\b|@sinonjs/fake-timers|\bmockdate\b|\btimekeeper\b"
)


def iter_files(root: Path) -> list[Path]:
    out: list[Path] = []
    stack = [root]
    while stack:
        d = stack.pop()
        try:
            entries = sorted(d.iterdir())
        except OSError:
            continue
        for e in entries:
            if e.is_dir():
                if e.name not in SKIP_DIRS and not e.is_symlink():
                    stack.append(e)
            elif e.is_file():
                out.append(e)
    return sorted(out)


def _read_json(p: Path) -> dict[str, object]:
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except OSError, ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def analyze(root: Path) -> CapabilityReport:
    files = iter_files(root)
    rel = [f.relative_to(root).as_posix() for f in files]
    js = [r for r in rel if Path(r).suffix in JS_EXT]
    others: dict[str, int] = {}
    for r in rel:
        lang = OTHER_LANG_EXT.get(Path(r).suffix)
        if lang:
            others[lang] = others.get(lang, 0) + 1
    items: list[CapabilityItem] = []
    report = CapabilityReport()

    pkg_path = root / "package.json"
    pkg = _read_json(pkg_path)
    is_js = bool(pkg) and len(js) >= sum(others.values()) * 0.3
    if is_js:
        items.append(
            CapabilityItem(
                id="language.js_ts", status="supported", reason=f"{len(js)} JS/TS files", files=["package.json"]
            )
        )
    else:
        main = max(others, key=lambda k: others[k]) if others else "unknown"
        items.append(CapabilityItem(id="language.js_ts", status="unsupported", reason=f"Unsupported in M1: {main}"))
        if main == "Python":
            items.append(
                CapabilityItem(
                    id="language.python",
                    status="supported",
                    reason="Python source detected; limited pytest clock scenarios",
                )
            )
            tests = [r for r in rel if Path(r).match("test_*.py") or Path(r).match("*_test.py")]
            report.test_runner = "pytest"
            items.append(
                CapabilityItem(
                    id="adapter.pytest",
                    status="supported",
                    reason="Crew can design pytest experiments from Python source",
                    files=tests[:5],
                )
            )
        report.items = items
        return report

    if (root / "pnpm-lock.yaml").exists():
        report.package_manager = "pnpm"
    elif (root / "yarn.lock").exists():
        report.package_manager = "yarn"
    elif (root / "package-lock.json").exists():
        report.package_manager = "npm"
    items.append(
        CapabilityItem(id="package_manager", status="supported", reason=f"Lockfile for {report.package_manager}")
        if report.package_manager
        else CapabilityItem(
            id="package_manager", status="unsupported", reason="No lockfile: dependency install is not reproducible"
        )
    )

    deps: dict[str, object] = {}
    for key in ("dependencies", "devDependencies"):
        section = pkg.get(key)
        if isinstance(section, dict):
            deps.update(section)
    scripts = pkg.get("scripts")
    report.scripts = {k: str(v) for k, v in scripts.items()} if isinstance(scripts, dict) else {}
    if "vitest" in deps or any(r.startswith("vitest.config.") for r in rel):
        report.test_runner = "vitest"
    elif "jest" in deps or "jest" in pkg or any(r.startswith("jest.config.") for r in rel):
        report.test_runner = "jest"
    items.append(
        CapabilityItem(id="adapter.js_tests", status="supported", reason=f"{report.test_runner} detected")
        if report.test_runner
        else CapabilityItem(
            id="adapter.js_tests",
            status="unsupported",
            reason=_no_runner_reason(deps, scripts),
        )
    )

    workspaces = pkg.get("workspaces") or (root / "pnpm-workspace.yaml").exists()
    if workspaces:
        items.append(
            CapabilityItem(
                id="workspace.monorepo",
                status="unknown",
                reason="Monorepo detected; the MVP runs tests from the root package only",
            )
        )

    fake = [r for r in js if _is_test(r) and _grep(root / r, FAKE_TIMER)]
    items.append(
        CapabilityItem(
            id="adapter.js_tests.fake_timers",
            status="supported" if fake else "unknown",
            reason="Existing tests use fake timers" if fake else "No fake-timer use found",
            files=fake[:5],
        )
    )

    engines = pkg.get("engines")
    node_req = str(engines.get("node", "")) if isinstance(engines, dict) else ""
    nvmrc = root / ".nvmrc"
    hint = nvmrc.read_text(encoding="utf-8", errors="ignore").strip() if nvmrc.exists() else node_req
    m = re.search(r"(\d{2})", hint)
    report.node_version = "20" if m and int(m.group(1)) <= 20 else "22"

    items.append(
        CapabilityItem(
            id="clock.test_process",
            status="supported" if report.test_runner else "unsupported",
            reason="Clock and TZ controlled inside the test process",
        )
    )
    items.append(
        CapabilityItem(id="clock.server", status="unsupported", reason="Server clock not controlled by MVP adapters")
    )
    items.append(CapabilityItem(id="adapter.browser", status="unsupported", reason="Browser adapter not in the MVP"))
    report.items = items
    return report


_OTHER_RUNNERS = ("mocha", "ava", "tap", "jasmine", "uvu", "tape", "node-tap", "@playwright/test", "cypress", "bun")


def _no_runner_reason(deps: dict[str, object], scripts: object) -> str:
    """Why a JS repo cannot be run, naming the runner it uses instead so the message is actionable."""
    text = " ".join(str(v) for v in scripts.values()) if isinstance(scripts, dict) else ""
    found = [r for r in _OTHER_RUNNERS if r in deps or re.search(rf"(^|[\s;&|]){re.escape(r)}(\s|$)", text)]
    if "node --test" in text or "node:test" in text:
        found.append("node:test")
    using = f"It uses {', '.join(found)}. " if found else "No test runner was found in package.json. "
    return f"{using}TimeWraith runs experiments only through Jest or Vitest, so no experiments were planned."


def _is_test(rel: str) -> bool:
    """A test file by its path: `*.test.ts`, `*.spec.ts`, a `tests/` or `__tests__/` folder, or a file that is just
    named `test.ts` / `tests.ts` beside the code it covers (date-fns does this in every package)."""
    return bool(
        re.search(
            r"(\.(test|spec|test-d)\.[cm]?[jt]sx?$)|(^|/)(__tests__|tests?|e2e)/|(^|/)(tests?|specs?)\.[cm]?[jt]sx?$",
            rel,
        )
    )


# A framework import, or several test cases at the start of a line. Whatever a repository calls its test files, they
# say what they are.
_TEST_IMPORT = re.compile(
    r"""(?:\bfrom\s+|\brequire\(\s*|\bimport\s+)['"](?:vitest|@vitest/[\w-]+|@jest/globals|jest|mocha|jasmine|ava|tap|uvu|"""
    r"""node:test|bun:test|@playwright/test)['"]"""
)
_TEST_CASE = re.compile(r"""^[ \t]*(?:describe|it|test|suite)(?:\.\w+)?[ \t]*\([ \t]*['"`]""", re.M)


def looks_like_test(rel: str, text: str) -> bool:
    """Test file by its path or by what is in it. `text` may be only the start of the file."""
    return _is_test(rel) or bool(_TEST_IMPORT.search(text)) or len(_TEST_CASE.findall(text)) >= 3


def _grep(p: Path, rx: re.Pattern[str]) -> bool:
    try:
        return bool(rx.search(p.read_text(encoding="utf-8", errors="ignore")))
    except OSError:
        return False


is_test_file = _is_test
