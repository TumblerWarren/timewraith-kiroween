"""Python fix verification and contribution checks, using the installed case environment."""

from __future__ import annotations

import ast
import shlex
import tomllib
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel

from . import agents as A
from . import python_adapter, sandbox
from .ingest import git
from .models import Bug, CheckResult, Evidence, Experiment, Fix, FixAttempt, GateResult, Investigation
from .python_crew import behavioral_outcome

if TYPE_CHECKING:
    from .pipeline import Engine


class Repair(BaseModel):
    summary: str
    root_cause: str
    original: str
    replacement: str
    regression: str
    evidence: list[Evidence]


def test_result(
    engine: Engine, inv: Investigation, ws: Path, bug: Bug, path: str, code: str, instant: str, *, controlled: bool
) -> str:
    result = python_adapter.run(
        engine.s,
        ws,
        path,
        instant,
        bug.clock.time_zone,
        code=code,
        environment=inv.python_environment,
        controlled=controlled,
    )
    return behavioral_outcome(result)


def suite(engine: Engine, inv: Investigation, ws: Path, bug: Bug) -> CheckResult:
    result = python_adapter.run(
        engine.s, ws, ".", bug.clock.instant, bug.clock.time_zone, environment=inv.python_environment, controlled=False
    )
    empty = result.outcome == "skipped" and result.detail == "No tests collected"
    return CheckResult(
        name="Repository pytest suite",
        command="pytest",
        passed=result.outcome == "passed" or empty,
        detail=result.detail or f"{result.passed} passed, {result.skipped} skipped",
    )


def safe_path(root: Path, rel: str) -> Path:
    path = root / rel
    if path.resolve() != path.absolute() or root.resolve() not in path.resolve().parents:
        raise ValueError(f"Path is outside the regular checkout: {rel}")
    return path


@contextmanager
def checkout(ws: Path, revision: str) -> Iterator[Path]:
    work = ws.parent / f"python-check-{uuid.uuid4().hex}"
    git(ws, ["worktree", "add", "--detach", str(work), revision])
    try:
        yield work
    finally:
        git(ws, ["worktree", "remove", "--force", str(work)])


def static_checks(engine: Engine, inv: Investigation, root: Path, rel: str) -> list[CheckResult]:
    project = root / "pyproject.toml"
    tools = tomllib.loads(project.read_text("utf8")).get("tool", {}) if project.is_file() else {}
    commands = []
    if "ruff" in tools or any((root / p).is_file() for p in ("ruff.toml", ".ruff.toml")):
        commands.append(("Ruff", ["ruff", "check", "--no-cache", rel]))
    if "mypy" in tools or any((root / p).is_file() for p in ("mypy.ini", ".mypy.ini")):
        commands.append(("mypy", ["mypy", "--cache-dir=/tmp/mypy", rel]))
    checks = []
    for name, args in commands:
        command = shlex.join(["/deps/venv/bin/python", "-B", "-m", *args])
        result = sandbox.run(
            engine.s,
            root,
            "",
            command,
            python_worker=True,
            python_environment=inv.python_environment,
            readonly=True,
            network=False,
            timeout=engine.s.test_timeout_s,
        )
        checks.append(
            CheckResult(name=name, command=shlex.join(args), passed=result.code == 0, detail=result.out[-1000:])
        )
    return checks


def fix(engine: Engine, inv: Investigation, rt: A.AgentRuntime, bug: Bug, ex: Experiment, t0: float) -> None:
    with checkout(engine._ws(inv), "HEAD") as root:
        verify_repair(engine, inv, rt, bug, ex, t0, root)


def verify_repair(
    engine: Engine, inv: Investigation, rt: A.AgentRuntime, bug: Bug, ex: Experiment, t0: float, root: Path
) -> None:
    assert ex.adapter_path and inv.python_environment and inv.test_plan
    rel = ex.adapter_path
    source = safe_path(root, rel)
    test_file = safe_path(root, bug.regression_test_path)
    tracked = git(root, ["ls-files", "-z"]).split("\0")
    if (
        rel not in tracked
        or source.suffix != ".py"
        or any(part in {".github", ".tw", "__tw__", "tests", "test"} for part in Path(rel).parts[:-1])
        or source.name in {"setup.py", "conftest.py"}
        or source.name.startswith("test_")
        or source.name.endswith("_test.py")
        or test_file.exists()
    ):
        bug.fix = Fix(state="skipped", label="No eligible source or regression test path")
        return
    original = source.read_bytes()
    text = original.decode("utf-8").replace("\r\n", "\n")
    eol = "\r\n" if b"\r\n" in original else "\n"
    bug.fix = Fix(state="in-progress", label="Doctor Stitch is preparing a Python fix")
    feedback = ""
    for number in range(1, engine.s.max_fix_attempts + 1):
        engine._check(inv, t0)
        proposal = engine._agent(
            inv,
            rt,
            "doctor-stitch",
            "python_fix",
            "Repair the cited calendar behavior. Provide a unique exact source fragment and its replacement. "
            "Write one portable pytest regression that pins its own inputs or uses monkeypatch and runs on ordinary "
            "Python without TimeWraith. Cite the source line explaining the cause.\n"
            + A._data(rel, A.numbered(text))
            + A._data("reproduced behavior", bug.title + "\n" + bug.regression_test)
            + A._data("failing clock", str(bug.clock))
            + A._data("previous checks", feedback),
            Repair,
        )
        attempt = FixAttempt(attempt=number, diff="", summary=proposal.summary, root_cause=proposal.root_cause)
        bug.fix.attempts.append(attempt)
        kept, _ = engine._evidence(inv, proposal.evidence)
        gates = attempt.gates
        try:
            if not any(e.kind == "source" and e.ref.startswith(rel + ":") for e in kept):
                raise ValueError("Cite a line in the source under repair")
            if not proposal.original or text.count(proposal.original) != 1:
                raise ValueError("Source edit must match exactly once")
            ast.parse(proposal.regression)
            updated = text.replace(proposal.original, proposal.replacement, 1)
            ast.parse(updated)

            def probe(code: str, clock: str, controlled: bool = True) -> str:
                engine._check(inv, t0)
                return test_result(engine, inv, root, bug, rel, code, clock, controlled=controlled)

            failing = bug.clock.instant
            before = probe(proposal.regression, failing, False)
            gates.append(GateResult(gate="test_first", passed=before == "assertion_failed", detail=before))
            if not gates[-1].passed:
                raise ValueError("The standalone regression must fail by assertion on the original")
            controls = []
            for experiment in inv.test_plan.experiments:
                if not experiment.adapter_code or not experiment.adapter_path:
                    continue
                for clock in experiment.anchors:
                    for zone in experiment.zones:
                        engine._check(inv, t0)
                        args = (engine.s, root, experiment.adapter_path, clock, zone)
                        result = python_adapter.run(
                            *args, code=experiment.adapter_code, environment=inv.python_environment
                        )
                        if behavioral_outcome(result) == "passed":
                            controls.append((args, experiment.adapter_code))
            source.write_bytes(updated.replace("\n", eol).encode("utf8"))
            attempt.diff = git(root, ["diff", "--", rel])
            counts = git(root, ["diff", "--numstat", "--", rel]).split("\t")
            bounded = len(counts) >= 3 and sum(int(n) for n in counts[:2]) <= engine.s.max_patch_lines
            gates.append(GateResult(gate="diff_limits", passed=bounded and bool(attempt.diff), detail=rel))
            if not gates[-1].passed:
                raise ValueError("Patch is empty or exceeds the configured diff limit")
            checks = [probe(bug.regression_test, failing) for _ in range(engine.s.repeat_runs)]
            checks.append(probe(proposal.regression, failing, False))
            gates.append(GateResult(gate="fixed", passed=all(r == "passed" for r in checks), detail=", ".join(checks)))
            passes = []
            for args, code in controls:
                engine._check(inv, t0)
                result = python_adapter.run(*args, code=code, environment=inv.python_environment)
                passes.append(behavioral_outcome(result))
            control = (bug.reproduction or {}).get("control")
            if control:
                passes.append(probe(bug.regression_test, control))
            gates.append(
                GateResult(
                    gate="no_new_anomalies",
                    passed=bool(passes) and all(r == "passed" for r in passes),
                    detail=f"Control outcomes: {passes}",
                )
            )
            checked = suite(engine, inv, root, bug)
            gates.append(GateResult(gate="no_regressions", passed=checked.passed, detail=checked.detail))
            static = static_checks(engine, inv, root, rel)
            gates.append(
                GateResult(
                    gate="static_checks",
                    passed=all(c.passed for c in static),
                    detail="; ".join(f"{c.name}: {c.detail}" for c in static) or "Source and test parse",
                )
            )
            source.write_bytes(original)
            undone = probe(proposal.regression, failing, False)
            gates.append(GateResult(gate="mutation_check", passed=undone == "assertion_failed", detail=undone))
            if all(g.passed for g in gates):
                review = engine._agent(
                    inv,
                    rt,
                    "raven-archivist",
                    "review_fix",
                    A.prompt_review_fix(bug=bug.title, diff=attempt.diff, test_code=proposal.regression),
                    A.ReviewFixOut,
                )
                gates.append(GateResult(gate="independent_review", passed=review.approve, detail=review.reason))
            if len(gates) == 8 and all(g.passed for g in gates):
                bug.contribution_test = proposal.regression.rstrip() + "\n"
                engine._save_patch(inv, bug, ex, attempt.diff)
                attempt.accepted_by_gates = True
                bug.status = "fixed-version-verified"
                engine._raise_status(inv, bug.status)
                bug.fix.state, bug.fix.label = "verified", "Suggested fix · verified"
            feedback = "\n".join(g.detail for g in gates if not g.passed)
        except (SyntaxError, ValueError) as exc:
            feedback = str(exc)
        finally:
            source.write_bytes(original)
        engine._decide(
            inv,
            agent="doctor-stitch",
            step="python_fix",
            subject=bug.id,
            claim=proposal.root_cause,
            evidence=kept,
            dropped=len(proposal.evidence) - len(kept),
            checks=[g.detail for g in gates],
            decision="accepted" if attempt.accepted_by_gates else "rejected",
            rule=feedback or "All eight Python checks passed",
            phase="fix",
        )
        if attempt.accepted_by_gates:
            return
    bug.fix.state, bug.fix.label = "no-safe-fix", feedback or "Python verification failed"
