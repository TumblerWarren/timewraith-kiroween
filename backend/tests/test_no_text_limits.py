"""An agent that says too much is never turned away for it: text has no length limit, lists are cut, not rejected."""

from __future__ import annotations

import json

import pytest
from pydantic import BaseModel

from timewraith import agents as A
from timewraith.fixsession import Submission
from timewraith.models import Evidence
from timewraith.verifysession import Verdict

LONG = "word " * 5000  # 25,000 characters


def ev(n: int) -> list[dict[str, str]]:
    return [{"kind": "source", "ref": f"src/a.ts:{i + 1}", "why": LONG} for i in range(n)]


def test_the_review_reply_that_failed_on_600_characters_is_now_accepted() -> None:
    out = A.ReviewFixOut.model_validate({"approve": False, "reason": LONG, "evidence": ev(9)})
    assert out.reason == LONG and len(out.evidence) == 6, "extra evidence items are dropped, not rejected"


@pytest.mark.parametrize(
    "model,data",
    [
        (A.ReviewItem, {"candidate_id": "c", "keep": True, "claim": LONG}),
        (A.AdapterOut, {"claim": LONG, "adapter_code": LONG * 4, "fields": ["next"], "anchors": ["a"] * 9}),
        (A.JudgeOut, {"verdict": "defect", "claim": LONG, "title": LONG}),
        (A.IssueMatchOut, {"issue_number": 1, "reason": LONG}),
        (A.RevealOut, {"outcome": "match", "reason": LONG}),
        (A.PlanItem, {"candidate_id": "c", "focus": LONG, "rationale": LONG}),
        (A.PlanOut, {"done_reason": LONG}),
        (Submission, {"summary": LONG, "root_cause": LONG}),
    ],
)
def test_no_prose_field_of_an_agent_reply_has_a_length_limit(model: type[BaseModel], data: dict[str, object]) -> None:
    assert model.model_validate(data) is not None


def test_lists_are_cut_to_their_first_items() -> None:
    out = A.AdapterOut.model_validate({"claim": "c", "adapter_code": "x", "fields": ["next"] * 8, "anchors": ["a"] * 9})
    assert len(out.fields) == 5 and len(out.anchors) == 5
    plan = A.PlanOut.model_validate({"intents": [{"candidate_id": "c", "focus": "f", "rationale": "r"}] * 10})
    assert len(plan.intents) == 6


def test_the_schema_given_to_the_agent_names_no_length_limit() -> None:
    for model in (A.ReviewFixOut, A.JudgeOut, A.AdapterOut, A.PlanOut, A.IssueMatchOut, A.RevealOut, Evidence):
        assert "maxLength" not in json.dumps(model.model_json_schema()), model.__name__


def test_a_long_verdict_is_accepted() -> None:
    v = Verdict.model_validate({"verdict": "intended_behavior", "claim": LONG, "title": LONG, "evidence": ev(12)})
    assert len(v.evidence) == 8 and v.claim == LONG
