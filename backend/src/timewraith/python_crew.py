"""Python Crew investigation. Agents select files, setup, hypotheses, probes, and follow-up work."""

from __future__ import annotations

import ast
import json
import shlex
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

from . import agents as A
from . import python_adapter, sandbox
from .analyze import iter_files
from .models import (
    Actor,
    Bug,
    Candidate,
    ClockConfig,
    CodeUnit,
    Evidence,
    Experiment,
    FeatureMap,
    Investigation,
    PytestResult,
    SweepResult,
    TestPlan,
    Violation,
)
from .sweep import iso, parse_instant

if TYPE_CHECKING:
    from .pipeline import Engine


class Files(BaseModel):
    paths: list[str] = Field(max_length=12)
    reason: str


class Lead(BaseModel):
    path: str
    line: int = Field(ge=1)
    hypothesis: str
    expectation: str


class Leads(BaseModel):
    items: list[Lead] = Field(max_length=12)
    reason: str


class Setup(BaseModel):
    method: Literal["uv_locked", "requirements", "project", "source_only", "blocked"]
    requirements: str = ""
    reason: str


class InstallCommand(BaseModel):
    command: str = Field(default="", max_length=20_000)
    reason: str


class Probe(BaseModel):
    action: Literal["test", "dismiss"]
    reason: str
    code: str = Field(default="", max_length=12000)
    failing: str = ""
    control: str = ""
    zone: str = "UTC"
    evidence: list[Evidence] = Field(default_factory=list, max_length=5)


class Direction(BaseModel):
    next_lead: Lead | None = None
    reason: str


def inventory(root: Path) -> list[str]:
    return [
        p.relative_to(root).as_posix()
        for p in iter_files(root)
        if not p.is_symlink()
        and (
            p.suffix.lower() in {".py", ".toml", ".cfg", ".md", ".rst", ".lock", ".txt", ".in"}
            or p.name in {"Pipfile", "Pipfile.lock", "setup.py"}
        )
    ]


def passages(root: Path, paths: list[str]) -> str:
    chunks = []
    for path in paths[:16]:
        with (root / path).open(encoding="utf8", errors="replace") as stream:
            chunks.append(A._data(path, A.numbered(stream.read(9000))))
    return "\n".join(chunks)


def add_lead(inv: Investigation, root: Path, files: set[str], lead: Lead) -> Experiment | None:
    fm, plan = inv.feature_map, inv.test_plan
    assert fm and plan
    if lead.path not in files or not lead.path.endswith(".py") or not lead.hypothesis.strip():
        return None
    if any(c.rationale == lead.hypothesis and c.unit.path == lead.path for c in fm.candidates):
        return None
    with (root / lead.path).open(encoding="utf8", errors="replace") as stream:
        if not any(i == lead.line for i, _ in enumerate(stream, 1)):
            return None
    idx = len(plan.experiments) + 1
    unit = CodeUnit(path=lead.path, name=lead.path, start_line=lead.line, end_line=lead.line, exported=False)
    cand = Candidate(
        id=f"cand_py{idx}",
        title=lead.hypothesis,
        unit=unit,
        signal_ids=[],
        bug_categories=["other_temporal"],
        score=1,
        score_parts={"crew_review": 1},
        selected=True,
        rationale=lead.hypothesis,
    )
    ex = Experiment(
        id=f"exp_py{idx}",
        candidate_id=cand.id,
        categories=cand.bug_categories,
        adapter="python_crew",
        executability="ready",
        claim=lead.expectation,
        adapter_path=lead.path,
    )
    fm.candidates.append(cand)
    plan.experiments.append(ex)
    return ex


def plan_case(engine: Engine, inv: Investigation, rt: A.AgentRuntime) -> None:
    root = engine._ws(inv)
    files = inventory(root)
    inv.feature_map, inv.test_plan = FeatureMap(), TestPlan()
    issue = engine.s.artifacts / inv.id / "issue.txt"
    focus = A._data("case focus", inv.request.area or "")
    if inv.request.mode == "known-issue" and issue.is_file():
        focus += A._data("reported behavior", issue.read_text("utf8")[:5000])
    chosen = engine._agent(
        inv,
        rt,
        "bat-scout",
        "python_inspect",
        "Python case: choose source, tests and docs to read to investigate date/time correctness. "
        "Existing tests are optional. Return repository-relative paths.\n"
        + focus
        + A._data("file inventory", "\n".join(files)[:60000]),
        Files,
    )
    selected = [p for p in chosen.paths if p in files]
    leads = engine._agent(
        inv,
        rt,
        "bat-scout",
        "python_discovery",
        "Read the selected files. Identify concrete temporal correctness hypotheses, citing a source file and line "
        "and explaining the expected public behavior. Return no items if there is no supported lead.\n"
        + focus
        + passages(root, selected),
        Leads,
    )
    for lead in leads.items[: engine.s.max_experiment_candidates]:
        ex = add_lead(inv, root, set(selected), lead)
        if ex:
            record(
                engine,
                inv,
                "bat-scout",
                "python_discovery",
                ex.id,
                lead.hypothesis,
                lead.expectation,
                [Evidence(kind="source", ref=f"{lead.path}:{lead.line}", why=lead.expectation)],
            )
    inv.notes.append(leads.reason)


def record(
    engine: Engine,
    inv: Investigation,
    actor: Actor,
    step: str,
    subject: str,
    claim: str,
    rule: str,
    evidence: list[Evidence] | None = None,
    accepted: bool = True,
) -> None:
    engine._decide(
        inv,
        agent=actor,
        step=step,
        subject=subject,
        claim=claim,
        evidence=evidence or [],
        dropped=0,
        checks=[],
        decision="accepted" if accepted else "rejected",
        rule=rule,
    )


def install_command(choice: Setup, files: list[str]) -> str:
    recognized = {"uv.lock", "poetry.lock", "Pipfile.lock", "pdm.lock", "pylock.toml"}.intersection(files)
    packaged = any(p in files for p in ("setup.py", "setup.cfg", "pyproject.toml"))
    if choice.method == "uv_locked" and "uv.lock" in files:
        install = (
            "UV_PROJECT_ENVIRONMENT=/deps/venv uv sync --locked --inexact --no-editable --python /deps/venv/bin/python"
        )
    elif (
        choice.method == "requirements"
        and not recognized
        and choice.requirements in files
        and choice.requirements.endswith((".txt", ".lock"))
    ):
        install = "/deps/venv/bin/python -m pip install -r " + shlex.quote("./" + choice.requirements)
        if packaged:
            install += " && /deps/venv/bin/python -m pip install --no-deps ."
    elif choice.method == "project" and packaged and not recognized and "requirements.txt" not in files:
        install = "/deps/venv/bin/python -m pip install ."
    elif (
        choice.method == "source_only"
        and not recognized
        and "Pipfile" not in files
        and not packaged
        and not any("requirements" in p.lower() for p in files)
    ):
        install = "true"
    else:
        raise ValueError("Setup choice does not match repository manifests or available installers")
    return (
        "set -eu\nexport UV_PYTHON_DOWNLOADS=never UV_CACHE_DIR=/tmp/uv\n"
        "python -m venv --system-site-packages /deps/venv\n"
        "mkdir /tmp/project\ncp -R /work/. /tmp/project/\ncd /tmp/project\n" + install
    )


def install(engine: Engine, inv: Investigation, rt: A.AgentRuntime, files: list[str], t0: float) -> bool:
    root = engine._ws(inv)
    manifests = [
        p
        for p in files
        if p in {"pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "Pipfile.lock"}
        or p.endswith(".lock")
        or "requirements" in p.lower()
    ]
    context = passages(root, manifests) + A._data("manifest names", "\n".join(manifests))
    history = ""
    for attempt in range(1, engine.s.install_retries + 2):
        engine._check(inv, t0)
        if getattr(rt, "supports_sessions", False):
            proposed = engine._agent(
                inv,
                rt,
                "install-mechanic",
                "python_install",
                "Propose a complete shell command to install this Python checkout in the sandbox. "
                "The working directory is an editable copy of the checkout and /deps/venv is initialized. "
                "Use /deps/venv/bin/python -m pip or an equivalent tool so the installed packages survive. "
                "Use the manifests and previous errors to diagnose the failure. Return an empty command if blocked."
                + context
                + A._data("previous attempts", history[-6000:]),
                InstallCommand,
            )
            if not proposed.command.strip():
                inv.notes.append(proposed.reason)
                return False
            label, reason = "agent shell", proposed.reason
            setup = (
                "set -eu\npython -m venv --system-site-packages /deps/venv\n"
                "mkdir /tmp/project\ncp -R /work/. /tmp/project/\ncd /tmp/project\n"
            )
            command = setup + proposed.command
        else:
            choice = engine._agent(
                inv,
                rt,
                "install-mechanic",
                "python_install",
                "Choose a reproducible setup from the checkout and previous logs. Prefer its lock. "
                "requirements uses a requirements file. project installs the root package. "
                "source_only is for dependency-free standalone source. Choose blocked if the lock cannot be honored.\n"
                + context
                + A._data("previous attempts", history[-6000:]),
                Setup,
            )
            if choice.method == "blocked":
                record(
                    engine,
                    inv,
                    "pumpkin-mechanic",
                    "python_install",
                    inv.id,
                    choice.reason,
                    "Setup blocked",
                    accepted=False,
                )
                inv.notes.append(choice.reason)
                return False
            label, reason = f"{choice.method} {choice.requirements}", choice.reason
            command = None
        try:
            cmd = command if command is not None else install_command(choice, files)
            result = sandbox.run(
                engine.s,
                root,
                "",
                cmd,
                python_worker=True,
                python_environment=attempt,
                readonly=True,
                network=True,
                timeout=min(engine.s.install_timeout_s, max(1, int(engine._remaining(inv)))),
            )
            ok, detail = result.code == 0, result.out[-1800:]
            if ok and command is not None:
                check = sandbox.run(
                    engine.s,
                    root,
                    "",
                    "/deps/venv/bin/python -I -B -m pytest --version",
                    python_worker=True,
                    python_environment=attempt,
                    readonly=True,
                    network=False,
                    timeout=engine.s.test_timeout_s,
                )
                ok, detail = check.code == 0, check.out[-1800:]
        except ValueError as exc:
            ok, detail = False, str(exc)
        record(
            engine,
            inv,
            "pumpkin-mechanic",
            "python_install",
            f"setup-{attempt}",
            reason,
            f"{label}: {'installed' if ok else detail}",
            accepted=ok,
        )
        if ok:
            inv.python_environment = attempt
            engine.store.save(inv)
            return True
        history += f"\n{label}: {detail}"
    inv.notes.append("Python installation attempts exhausted: " + history[-1000:])
    return False


def clocks(inv: Investigation, proposal: Probe) -> tuple[str, str]:
    assert inv.sweep_window
    ZoneInfo(proposal.zone)
    points = [parse_instant(t) for t in (proposal.failing, proposal.control)]
    if any(t is None or not inv.sweep_window.contains(t) for t in points) or points[0] == points[1]:
        raise ValueError("Choose two distinct instants inside the case window")
    tree = ast.parse(proposal.code)
    if not any(isinstance(n, ast.Assert) for n in ast.walk(tree)):
        raise ValueError("A pytest experiment needs a behavioral assertion")
    return iso(int(points[0] or 0)), iso(int(points[1] or 0))


def behavioral_outcome(result: PytestResult) -> str:
    if result.exercised_source and not result.skipped:
        if result.outcome == "failed" and result.assertion_failure and result.failed == 1 and not result.passed:
            return "assertion_failed"
        if result.outcome == "passed" and result.passed == 1 and not result.failed:
            return "passed"
    return "error"


def investigate(
    engine: Engine, inv: Investigation, rt: A.AgentRuntime, ex: Experiment, files: list[str], t0: float
) -> None:
    assert inv.sweep_window and inv.python_environment and ex.adapter_path
    root, path = engine._ws(inv), ex.adapter_path
    context = passages(root, [path, *[p for p in files if p.lower().startswith("readme")][:2]])
    assert inv.feature_map
    candidate = next(c for c in inv.feature_map.candidates if c.id == ex.candidate_id)
    hypothesis = candidate.rationale or candidate.title
    instructions = (
        "Python temporal correctness investigation. Design a single ordinary pytest test that imports the real "
        "repository API and asserts its documented behavior. The same code runs at a failing and a passing control "
        "instant you choose. Wall time, datetime.now(), date.today(), and monotonic time are controlled. "
        "Use timewraith_clock.advance(seconds, wall=True, monotonic=True) to advance clocks independently. Do not "
        "encode an assertion about the harness or condition the test on the case timestamps. Cite source or "
        "documentation path:line; dismiss unsupported hypotheses.\n"
        f"Window: {iso(inv.sweep_window.start_ms)} to {iso(inv.sweep_window.end_ms)} exclusive.\n"
    )
    history = ""
    sweep = SweepResult(experiment_id=ex.id, points_run=0, zones=[])
    inv.sweeps.append(sweep)
    for actor in ("pumpkin-mechanic", "raven-archivist"):
        verification = actor == "raven-archivist"
        engine._stage(
            inv,
            "verifying" if verification else "experimenting",
            f"Raven is reproducing {ex.id}" if verification else f"Pumpkin is testing {ex.id}",
        )
        agent: Actor = "raven-archivist" if verification else "pumpkin-mechanic"
        step = "python_verify" if verification else "python_design"
        for _ in range(2):
            engine._check(inv, t0)
            prompt = instructions + (
                "Independently reproduce or dismiss the observed behavior through the public API. "
                if verification
                else "Investigate the proposed lead. "
            )
            proposal = engine._agent(
                inv,
                rt,
                agent,
                step,
                prompt
                + context
                + A._data("hypothesis", hypothesis + "\n" + (ex.claim or ""))
                + A._data("observations", history[-4500:]),
                Probe,
            )
            if proposal.action == "dismiss":
                record(
                    engine, inv, agent, step, ex.id, proposal.reason, "Agent dismissed the hypothesis", accepted=False
                )
                ex.status = "swept" if sweep.points_run else "not_run"
                return
            try:
                failing, control = clocks(inv, proposal)
                kept, _ = engine._evidence(inv, proposal.evidence)
                if not any(e.kind in {"source", "doc", "test"} for e in kept):
                    raise ValueError("Cite a resolvable source, test or documentation passage")
                if verification and ([failing, control] != ex.anchors or [proposal.zone] != ex.zones):
                    raise ValueError("Reproduce the original clock points and zone")
                if verification and ast.dump(ast.parse(proposal.code)) == ast.dump(ast.parse(ex.adapter_code or "")):
                    raise ValueError("Supply an independently written reproduction")
            except (ValueError, KeyError, SyntaxError) as exc:
                record(engine, inv, agent, step, ex.id, proposal.reason, str(exc), accepted=False)
                history += f"\nRejected design: {exc}"
                continue
            if not verification:
                ex.adapter_code, ex.anchors, ex.zones = proposal.code, [failing, control], [proposal.zone]
                ex.point_count, ex.status = 2, "designed"
            results = []
            for instant in [failing] * (engine.s.repeat_runs if verification else 1) + [control]:
                engine._check(inv, t0)
                r = python_adapter.run(
                    engine.s, root, path, instant, proposal.zone, code=proposal.code, environment=inv.python_environment
                )
                results.append(r)
                sweep.pytest_results.append(r)
                if r.outcome in {"passed", "failed"}:
                    sweep.points_run += 1
                    if r.zone not in sweep.zones:
                        sweep.zones.append(r.zone)
                engine.store.save(inv)
            last = results[-1]
            ok = (
                all(behavioral_outcome(r) == "assertion_failed" for r in results[:-1])
                and behavioral_outcome(last) == "passed"
            )
            history = f"{proposal.reason} at {failing} (control {control}), {proposal.zone}\n" + "\n".join(
                f"{r.instant} {r.zone}: {r.outcome}, source exercised={r.exercised_source}, {r.detail}" for r in results
            )
            record(engine, inv, agent, step, ex.id, proposal.reason, history[-2200:], kept, ok)
            if not ok:
                continue
            ex.status = "swept"
            if not verification:
                history = f"{proposal.reason} at {failing} (passing control {control}), zone {proposal.zone}"
                engine._raise_status(inv, "observed-anomaly")
                break
            v = Violation(
                invariant="python_assertion",
                instant=failing,
                local=datetime.fromisoformat(failing).astimezone(ZoneInfo(proposal.zone)).isoformat(),
                zone=proposal.zone,
                failure_kind="assertion",
                detail=proposal.reason,
            )
            bid = f"bug_{ex.id[4:]}"
            rel = f"tests/test_tw_{bid}.py"
            inv.bugs.append(
                Bug(
                    id=bid,
                    candidate_id=ex.candidate_id,
                    experiment_id=ex.id,
                    title=proposal.reason,
                    category="other_temporal",
                    invariant="python_assertion",
                    status="reproduced",
                    clock=ClockConfig(
                        instant=failing, time_zone=proposal.zone, label="Independent Python reproduction"
                    ),
                    violation=v,
                    failure=results[0].detail,
                    evidence=kept,
                    regression_test_path=rel,
                    regression_test=proposal.code,
                    reproduction={"code": proposal.code, "failing": failing, "control": control},
                )
            )
            sweep.violations.append(v)
            engine._raise_status(inv, "reproduced")
            engine._event(inv, agent, "verify", proposal.reason, data={"bug_id": bid, "experiment_id": ex.id})
            return
        else:
            ex.status = "swept" if sweep.points_run else "not_run"
            ex.executability_reason = history[-500:] or "Agent did not provide a runnable design"
            return


def execute(engine: Engine, inv: Investigation, rt: A.AgentRuntime, t0: float) -> None:
    assert inv.test_plan
    files = inventory(engine._ws(inv))
    engine._stage(inv, "installing", "Preparing the Python worker for the Install Mechanic")
    image = sandbox.prepare_pytest(min(engine.s.install_timeout_s, max(1, int(engine._remaining(inv)))))
    if image.code or not install(engine, inv, rt, files, t0):
        inv.notes.append("Python setup blocked. " + image.out[-600:] if image.code else "Python setup blocked.")
        inv.status = "inconclusive"
        return
    engine._stage(inv, "experimenting", "Pumpkin is designing Python experiments against the installed project")
    for initial in inv.test_plan.experiments:
        investigate(engine, inv, rt, initial, files, t0)
    for _ in range(engine.s.max_plan_rounds):
        engine._check(inv, t0)
        if len(inv.test_plan.experiments) >= engine.s.max_experiment_candidates:
            break
        direction = engine._agent(
            inv,
            rt,
            "wraith-director",
            "python_followup",
            "Based on observed results, choose a new source-based temporal hypothesis, or stop. "
            "You can select a different source module.\n"
            + A._data("files", "\n".join(files)[:50000])
            + A._data("reviewed leads", json.dumps([e.claim for e in inv.test_plan.experiments]))
            + A._data("observations", json.dumps([s.model_dump() for s in inv.sweeps])[-10000:]),
            Direction,
        )
        ex = add_lead(inv, engine._ws(inv), set(files), direction.next_lead) if direction.next_lead else None
        record(
            engine,
            inv,
            "wraith-director",
            "python_followup",
            ex.id if ex else inv.id,
            direction.reason,
            "Follow-up scheduled" if ex else "No further valid lead",
        )
        if not ex:
            break
        investigate(engine, inv, rt, ex, files, t0)
