"""The repository's test environment, checked once per case, before any experiment is judged.

An experiment can fail for two different reasons. The experiment may be wrong (its adapter throws, its rules do
not hold), or the place it runs may be unable to run any generated test at all (the runner does not collect the
harness, a folder is read-only, a global the adapter assumes is missing). The second kind is the same for every
experiment in the case, so it is found once with a canary, repaired once, and saved as a profile every experiment then
uses. Experiments that fail afterwards fail for their own reasons.

Everything here is code that runs no agent. The pipeline calls it first, and asks an agent for help only when the
repository's own setup and the default profile both cannot run the canary.
"""

from __future__ import annotations

import json
import posixpath
import re
import uuid
from pathlib import Path
from typing import Any

from .models import EnvironmentCheck, Experiment, InvariantUse

CANARY_ID = "exp_tw_canary"

# Globals an adapter may assume. A Node that lacks one is reported to the agents that write and repair adapters.
PROBED_GLOBALS = ("Temporal", "structuredClone", "fetch", "TextEncoder", "AbortController", "Intl")

# Packages that supply a global the runtime lacks, and the global they supply.
POLYFILLS = {"temporal-polyfill": "Temporal", "@js-temporal/polyfill": "Temporal"}

_CANARY_TEMPLATE = """// @ts-nocheck
// TimeWraith environment canary: no repository code. It only proves a generated test is collected and runs here.
const PROBES = __PROBES__;
function run(ctx) {
  const missing = PROBES.filter((name) => typeof globalThis[name] === 'undefined');
  return { instant: ctx.now, value: { node: process.version, missing } };
}
module.exports = { run };
"""
_CANARY_ADAPTER = _CANARY_TEMPLATE.replace("__PROBES__", json.dumps(list(PROBED_GLOBALS)))

# The default profile for vitest: collect TimeWraith's generated tests wherever they are, and nothing else. A repository
# whose own config only includes files named test.ts (date-fns) cannot collect them without it.
_VITEST_PROFILE = """import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "tw-profile",
    include: ["**/__tw__/*.tw.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: ["**/node_modules/**", "**/.git/**"],
    pool: "forks",
  },
});
"""


def canary_experiment(candidate_id: str, folder: str, ext: str) -> Experiment:
    """The experiment object the pipeline sweeps like any other; it belongs to no real candidate's findings."""
    return Experiment(
        id=CANARY_ID,
        candidate_id=candidate_id,
        categories=["midnight_rollover"],
        executability="ready",
        status="designed",
        claim="The test environment can run a generated test.",
        fields=["instant", "value"],
        invariants=[InvariantUse(id="well_formed", reason="the canary returns a valid instant")],
        adapter_path=f"{folder}/{CANARY_ID}.adapter{ext}",
        harness_path=f"{folder}/canary.{CANARY_ID}.tw.test{ext}",
        adapter_code=_CANARY_ADAPTER,
    )


def write_canary(ws: Path, ex: Experiment, harness: str, points: dict[str, list[int]]) -> None:
    assert ex.adapter_path and ex.harness_path
    (ws / ex.adapter_path).parent.mkdir(parents=True, exist_ok=True)
    (ws / ex.adapter_path).write_text(_CANARY_ADAPTER, encoding="utf-8")
    (ws / ex.harness_path).write_text(harness, encoding="utf-8")
    tw = ws / ".tw"
    tw.mkdir(exist_ok=True)
    for kind in ("points", "baseline"):
        (tw / f"{kind}-{CANARY_ID}.json").write_text(json.dumps(points), encoding="utf-8")


def remove_canary(ws: Path, ex: Experiment) -> None:
    results = f".tw/out/{CANARY_ID}__UTC.json"
    for rel in (
        ex.adapter_path,
        ex.harness_path,
        results,
        f".tw/points-{CANARY_ID}.json",
        f".tw/baseline-{CANARY_ID}.json",
    ):
        if rel:
            (ws / rel).unlink(missing_ok=True)


def write_default_profile(ws: Path) -> str:
    """The runner config every experiment will use when the repository's own cannot collect generated tests. Named like
    an agent's config so the repair tools treat it the same way."""
    rel = f".tw/runner-{uuid.uuid4().hex}.mjs"
    (ws / ".tw").mkdir(exist_ok=True)
    (ws / rel).write_text(_VITEST_PROFILE, encoding="utf-8")
    return rel


def facts_from(outputs: dict[str, list[dict[str, Any]]]) -> tuple[str | None, list[str]]:
    """(node version, globals this Node lacks), from what the canary reported."""
    for rows in outputs.values():
        for row in rows:
            try:
                value = json.loads((row.get("r0") or {}).get("value") or "")
            except TypeError, ValueError:
                continue
            if isinstance(value, dict):
                missing = [str(m) for m in value.get("missing", []) if isinstance(m, str)]
                return str(value.get("node") or "") or None, missing
    return None, []


def installed_polyfills(ws: Path) -> list[str]:
    return [name for name in POLYFILLS if (ws / "node_modules" / name / "package.json").is_file()]


# ---------- a global the runtime lacks, supplied from a polyfill installed outside the repository ----------

POLYFILL_GLOBAL = "Temporal"


def preload_source(package: str) -> str:
    """A module Node loads before anything else (NODE_OPTIONS=--import). It makes the polyfill the global Temporal, and
    adds Date.prototype.toTemporalInstant, as a runtime that has Temporal would. Nothing is replaced if it exists."""
    return (
        f'import {{ Temporal, toTemporalInstant }} from "{package}";\n'
        "if (typeof globalThis.Temporal === 'undefined') globalThis.Temporal = Temporal;\n"
        "if (typeof Date.prototype.toTemporalInstant !== 'function') {\n"
        "  Object.defineProperty(Date.prototype, 'toTemporalInstant', "
        "{ value: toTemporalInstant, configurable: true, writable: true });\n"
        "}\n"
    )


def write_preload(ws: Path, package: str) -> str:
    """Write the preload next to the installed polyfill. Returns its path from the checkout root."""
    rel = ".tw/deps/temporal-global.mjs"
    (ws / rel).parent.mkdir(parents=True, exist_ok=True)
    (ws / rel).write_text(preload_source(package), encoding="utf-8")
    return rel


def package_name(spec: str) -> str:
    """`temporal-polyfill@0.3.0` -> `temporal-polyfill`; `@js-temporal/polyfill@1` -> `@js-temporal/polyfill`."""
    at = spec.rfind("@")
    return spec[:at] if at > 0 else spec


def installed_version(ws: Path, package: str) -> str | None:
    """The version of a polyfill installed under `.tw/deps`, from its own package.json."""
    try:
        data = json.loads((ws / ".tw/deps/node_modules" / package / "package.json").read_text(encoding="utf-8"))
    except OSError, ValueError:
        return None
    return str(data.get("version") or "") or None


def uses_global(ws: Path, unit_paths: list[str], name: str = POLYFILL_GLOBAL) -> bool:
    """Does any of the code under test use this global? Only then is it worth supplying it."""
    pattern = re.compile(rf"\b{re.escape(name)}\b")
    for rel in dict.fromkeys(unit_paths):
        try:
            if pattern.search((ws / rel).read_text(encoding="utf-8", errors="ignore")):
                return True
        except OSError:
            continue
    return False


# ---------- what kind of failure it is ----------

_THROTTLED = re.compile(r"throttl|rate.?limit|too many requests|capacity", re.I)
_ENVIRONMENT = re.compile(
    r"No test files found|did not collect|could not load the harness|EROFS|read-only file system|EACCES|"
    r"Cannot find (?:package|module) '(?:vitest|jest|vite)|ERR_MODULE_NOT_FOUND[^\n]*vite|"
    r"Failed to load (?:the )?(?:vite|vitest) config|Jest: Failed to parse the TypeScript config",
    re.I,
)


def is_throttled(text: str) -> bool:
    return bool(_THROTTLED.search(text))


# A package that is not there: a bare name, not a path. (A missing relative path is the adapter's own mistake.)
_MISSING_PACKAGE = re.compile(r"Cannot find (?:package|module) '(?![./])([^']+)'", re.I)


def classify(text: str, env: EnvironmentCheck | None = None) -> str:
    """`throttled`, `environment` or `adapter`: what a failure message says went wrong. Code only reads the words, and
    the globals the canary measured as missing and that nothing installed supplies; the kind decides who gets the
    failure (the environment step or the experiment's own repair), never whether it is true."""
    if is_throttled(text):
        return "throttled"
    if _ENVIRONMENT.search(text) or _MISSING_PACKAGE.search(text):
        return "environment"
    if env is not None and env.status == "ok":
        supplied = {
            POLYFILLS[p] for p in env.polyfills if p in POLYFILLS
        }  # an installed package the adapter can import
        for name in env.missing_globals:
            if name not in supplied and re.search(rf"\b{re.escape(name)} is not defined", text):
                return "environment"
    return "adapter"


def explains_by_environment(problems: str, env: EnvironmentCheck | None, unit_text: str | None = None) -> bool:
    """Is a failure the environment's doing? The referee for an agent that says an experiment is blocked: its reason
    stands only if the failure it is looking at is one this environment explains (a missing runtime feature, a package
    that is not installed, a runner that cannot collect the harness), and not a mistake in the adapter.

    A missing global is not enough on its own: an adapter can name `Temporal` to provoke the error. The code under test
    (`unit_text`) has to use it too, or the claim is refused."""
    if classify(problems, env) != "environment":
        return False
    named = [
        name
        for name in (env.missing_globals if env and env.status == "ok" else [])
        if re.search(rf"\b{re.escape(name)} is not defined", problems)
    ]
    grounded = unit_text is None or not named or any(re.search(rf"\b{re.escape(n)}\b", unit_text) for n in named)
    return grounded


def facts_text(env: EnvironmentCheck | None) -> str:
    """What was measured about the runtime, for the agent that repairs adapters."""
    if env is None or env.status != "ok":
        return ""
    lines = [f"Node {env.node}." if env.node else "Node version unknown."]
    lines.append(
        f"Globals this runtime does not have: {', '.join(env.missing_globals)}."
        if env.missing_globals
        else "No probed global is missing."
    )
    if env.provided:
        lines.append(
            f"TimeWraith supplies {'; '.join(env.provided)} in every test run here. It is a polyfill, not the "
            "runtime's own implementation: it is there as a global, so the adapter needs no import for it."
        )
    if env.missing_globals:
        lines.append(
            f"Installed packages that supply them: {', '.join(env.polyfills)}."
            if env.polyfills
            else "No installed package supplies them."
        )
    lines.append("The sandbox has no network, so nothing can be installed.")
    return " ".join(lines)


# ---------- does the adapter exercise the code it claims to test ----------

_SPEC = re.compile(r"""(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1""")
_COMPUTED = re.compile(r"""\b(?:require|import)\s*\(\s*[^'"\s)]""")
_EXTENSIONS = (".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs")
_RUNTIME_MODULE = re.compile(r"^(?:node:|vitest$|jest$|@jest/|@vitest/|fs$|path$|os$|util$|assert$|crypto$|url$)")


def _specifiers(code: str) -> tuple[list[str], bool]:
    """(module specifiers written as literals, whether any import is computed so cannot be read)."""
    plain = re.sub(r"//[^\n]*|/\*.*?\*/", "", code, flags=re.S)
    return [m.group(2) for m in _SPEC.finditer(plain)], bool(_COMPUTED.search(plain))


def _resolve(ws: Path, from_file: str, spec: str) -> str | None:
    """The checkout file a relative specifier means, as a path from the checkout root, or None."""
    base = posixpath.dirname(from_file)
    target = posixpath.normpath(posixpath.join(base, spec))
    stem, suffix = posixpath.splitext(target)
    options = [target]
    if suffix in {".js", ".jsx", ".mjs", ".cjs"}:  # TypeScript writes the compiled name in its imports
        options += [stem + ext for ext in (".ts", ".tsx", ".mts", ".cts")]
    options += [target + ext for ext in _EXTENSIONS]
    options += [posixpath.join(target, "index" + ext) for ext in _EXTENSIONS]
    return next((o for o in options if (ws / o).is_file()), None)


def exercises_unit(ws: Path, adapter_path: str, code: str, unit_path: str, *, depth: int = 3) -> bool | None:
    """Does the adapter reach the file it claims to test, directly or through files that re-export it?

    True: it does. False: it does not (it imports other code, or nothing from the repository). None: it cannot be told
    from the text, because the adapter imports a package by name or computes what it imports, so nothing is raised."""
    specs, computed = _specifiers(code)
    if computed:
        return None
    relative = [s for s in specs if s.startswith(".")]
    if any(not s.startswith(".") and not _RUNTIME_MODULE.match(s) for s in specs):
        return None
    seen: set[str] = set()

    def reaches(from_file: str, specifiers: list[str], left: int) -> bool:
        for spec in specifiers:
            resolved = _resolve(ws, from_file, spec)
            if resolved is None or resolved in seen:
                continue
            seen.add(resolved)
            if resolved == unit_path:
                return True
            if left > 1 and resolved.endswith(_EXTENSIONS):
                try:
                    text = (ws / resolved).read_text(encoding="utf-8", errors="ignore")[:200_000]
                except OSError:
                    continue
                inner = [s for s in _specifiers(text)[0] if s.startswith(".")]
                if reaches(resolved, inner, left - 1):
                    return True
        return False

    return reaches(adapter_path, relative, depth)


def unit_problem(ws: Path, adapter_path: str, code: str, unit_path: str) -> list[str]:
    """The baseline problem for an adapter that does not exercise its candidate, or []. Code reads where the adapter's
    imports lead; it does not judge whether the test is a good one."""
    if exercises_unit(ws, adapter_path, code, unit_path) is not False:
        return []
    specs = [s for s in _specifiers(code)[0] if s.startswith(".")]
    uses = f"It imports {', '.join(specs[:3])}" if specs else "It imports nothing from the repository"
    return [
        f"The adapter never reaches the code under test, {unit_path}. {uses}. An experiment must exercise the "
        "candidate it claims to test: do not swap in a different function to make the check pass."
    ]


# ---------- telling the agents what this Node has ----------


def hints_for(adapter_code: str, env: EnvironmentCheck | None) -> list[str]:
    """Problems a read of the adapter shows before any run: it uses a global this Node does not have. Only globals the
    canary measured as missing are reported, so nothing is guessed about a runtime that was not looked at."""
    if env is None or env.status != "ok" or not env.missing_globals:
        return []
    code = re.sub(r"//[^\n]*|/\*.*?\*/", "", adapter_code, flags=re.S)
    out: list[str] = []
    for name in env.missing_globals:
        used = re.search(rf"(?<![\w.$'\"`]){re.escape(name)}\b", code)
        guarded = re.search(rf"typeof\s+{re.escape(name)}\b", code)
        imported = re.search(
            rf"(?:import[^;\n]*\b{re.escape(name)}\b[^;\n]*from|{re.escape(name)}\s*=\s*require)", code
        )
        if used and not guarded and not imported:
            out.append(environment_hint(name, env))
    return out


def environment_hint(name: str, env: EnvironmentCheck) -> str:
    packages = [p for p in env.polyfills if POLYFILLS.get(p) == name]
    node = f" (Node {env.node})" if env.node else ""
    if packages:
        return (
            f"Environment: `{name}` is not a global in this runtime{node}. The repository has {packages[0]} "
            f"installed: import {{ {name} }} from '{packages[0]}' in the adapter."
        )
    return f"Environment: `{name}` is not a global in this runtime{node}, and no package that supplies it is installed."
