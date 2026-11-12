"""Plan skeletons: one sweep experiment per selected candidate. Pumpkin Mechanic fills in the adapter later."""

from __future__ import annotations

import hashlib
from typing import Literal

from .models import Candidate, CapabilityReport, Experiment, TestPlan

Executability = Literal["ready", "needs_setup", "not_controllable"]


def build_test_plan(cands: list[Candidate], caps: CapabilityReport, max_candidates: int) -> TestPlan:
    selected = [c for c in cands if c.selected]
    plan = TestPlan(capped=len(selected) > max_candidates)
    for c in selected[:max_candidates]:
        ex: Executability = "ready"
        reason: str | None = None
        if not caps.test_runner:
            ex, reason = "not_controllable", "No supported test runner (Vitest or Jest) to control the clock"
        elif not c.unit.exported and c.unit.name != "(module)":
            ex, reason = "needs_setup", "Unit is not exported; the adapter must reach it through an exported caller"
        eid = "exp_" + hashlib.sha256(c.id.encode()).hexdigest()[:10]
        plan.experiments.append(
            Experiment(
                id=eid, candidate_id=c.id, categories=c.bug_categories, executability=ex, executability_reason=reason
            )
        )
    return plan
