"""Write the JSON Schemas of the API models to backend/schemas/.

Run: uv --directory backend run python -m timewraith.schema_export
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

from .models import (
    CapabilityReport,
    CreateInvestigation,
    DecisionRecord,
    FeatureMap,
    FlowStep,
    Investigation,
    InvestigationSummary,
    ReplayEvent,
    TestPlan,
)

MODELS: dict[str, type[BaseModel]] = {
    "CreateInvestigation": CreateInvestigation,
    "InvestigationSummary": InvestigationSummary,
    "Investigation": Investigation,
    "FeatureMap": FeatureMap,
    "TestPlan": TestPlan,
    "CapabilityReport": CapabilityReport,
    "ReplayEvent": ReplayEvent,
    "DecisionRecord": DecisionRecord,
    "FlowStep": FlowStep,
}
OUT = Path(__file__).resolve().parents[2] / "schemas"


def render() -> dict[str, str]:
    return {
        f"{n}.schema.json": json.dumps(m.model_json_schema(), indent=2, sort_keys=True) + "\n"
        for n, m in MODELS.items()
    }


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, text in render().items():
        (OUT / name).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
