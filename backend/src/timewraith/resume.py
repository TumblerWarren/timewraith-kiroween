"""What the agents left unfinished in a case, found from what the case itself recorded.

Every agent step that cannot run (the Kiro account is out of usage, its sign-in expired, the service is throttled) says
so in the case: a decision `not_run`, an experiment `not_designed`, a fix label. After the user signs in with another
account, Continue runs exactly those steps again in the same case and keeps everything already done.

A step counts as unfinished only when the record shows the agent was unavailable. A step the agent ran and failed (a
repair it rejected, a verdict it gave) is finished: running it again would repeat the same work.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .models import Bug, Experiment, Investigation, Violation

# Words the pipeline writes when an agent could not run (agents._raise_unavailable and the steps that catch it).
STOPPED = re.compile(r"usage limit|Kiro rejected|sign-in|sign in|throttl|agent was unavailable|could not run:", re.I)


@dataclass
class Gaps:
    design: list[str] = field(default_factory=list)  # experiments the agent never designed
    repair: list[str] = field(default_factory=list)  # experiments whose adapter repair did not start
    judge: dict[str, int] = field(default_factory=dict)  # experiment -> failure groups nobody judged
    planner: bool = False  # the planner's next round did not run
    fix: list[str] = field(default_factory=list)  # bugs whose fix was not attempted

    @property
    def any(self) -> bool:
        return bool(self.design or self.repair or self.judge or self.planner or self.fix)


def _last(inv: Investigation, step: str, subject: str | None = None) -> object | None:
    found = None
    for d in inv.decisions:
        if d.step == step and (subject is None or d.subject == subject):
            found = d
    return found


def _stopped(texts: list[str]) -> bool:
    return any(STOPPED.search(t) for t in texts)


def groups_of(violations: list[Violation]) -> list[Violation]:
    """One violation for each (rule, kind of failure): the unit the review works through, in order."""
    seen: dict[tuple[str, str], Violation] = {}
    for v in violations:
        seen.setdefault((v.invariant, v.failure_kind), v)
    return list(seen.values())


def unjudged(inv: Investigation, ex: Experiment) -> list[Violation]:
    """The failure groups of an experiment that the review did not get to because the agent stopped.

    The review takes an experiment's groups in order and gives each one decision. Those that were decided (a violation
    that did not repeat, a verdict) are done; the ones after them, left `not_run` because the agent stopped, are not."""
    sweep = next((s for s in reversed(inv.sweeps) if s.experiment_id == ex.id), None)
    if sweep is None:
        return []
    mine = [d for d in inv.decisions if d.subject == ex.id and d.step in {"repeat", "judge_violation"}]
    stopped = [d for d in mine if d.decision == "not_run" and _stopped([*d.checks, d.rule])]
    if not stopped:
        return []
    done = sum(1 for d in mine if d.decision != "not_run")
    return groups_of(sweep.violations)[done:]


def _fix_unfinished(bug: Bug) -> bool:
    return (
        bug.fix.state == "no-safe-fix" and bug.fix.label.startswith("No fix attempted:") and _stopped([bug.fix.label])
    )


def find_gaps(inv: Investigation) -> Gaps:
    gaps = Gaps()
    exps = inv.test_plan.experiments if inv.test_plan else []
    for ex in exps:
        if ex.status == "not_designed" and _stopped([ex.executability_reason or ""]):
            gaps.design.append(ex.id)
            continue
        repair = _last(inv, "repair_adapter", ex.id)
        if (
            repair is not None
            and getattr(repair, "decision", "") == "not_run"
            and ex.status in {"adapter_invalid", "designed"}
            and _stopped(list(getattr(repair, "checks", [])))
        ):
            gaps.repair.append(ex.id)
        left = unjudged(inv, ex)
        if left:
            gaps.judge[ex.id] = len(left)
    planner = _last(inv, "plan_round")
    gaps.planner = bool(
        planner is not None
        and getattr(planner, "decision", "") == "not_run"
        and _stopped([*getattr(planner, "checks", []), getattr(planner, "rule", "")])
    )
    gaps.fix = [b.id for b in inv.bugs if _fix_unfinished(b)]
    return gaps


def describe(gaps: Gaps) -> list[str]:
    """What is left, in words for the page."""

    def many(n: int, one: str, more: str) -> str:
        return f"{n} {one if n == 1 else more}"

    lines: list[str] = []
    if gaps.design:
        lines.append(many(len(gaps.design), "experiment was never designed", "experiments were never designed"))
    if gaps.repair:
        lines.append(many(len(gaps.repair), "adapter repair did not start", "adapter repairs did not start"))
    if gaps.judge:
        n = sum(gaps.judge.values())
        lines.append(many(n, "repeated violation was never judged", "repeated violations were never judged"))
    if gaps.planner:
        lines.append("the planner's next round did not run")
    if gaps.fix:
        lines.append(many(len(gaps.fix), "fix was not attempted", "fixes were not attempted"))
    return lines
