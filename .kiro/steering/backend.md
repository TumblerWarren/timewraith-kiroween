---
inclusion: fileMatch
fileMatchPattern: "backend/**/*.py"
---

# Backend map and checks

Package: `backend/src/timewraith/`. FastAPI app in `api.py`; the investigation engine is `pipeline.py` (`Engine`).

| File | Role |
|---|---|
| `pipeline.py` | Stages: install, environment canary, discovery, design, sweep, verify, fix, gates |
| `agents.py` | Every prompt and every agent reply model (no length limits in reply schemas) |
| `sweep.py` | Clock points, the harness, the rule catalog `INVARIANTS`, the oracle `check()`, regression tests |
| `verifysession.py` | Raven's probe tools and the verdict model |
| `fixsession.py`, `installsession.py` | Tools for Doctor Stitch and the install mechanic |
| `environment.py`, `playbook.py` | Canary, default runner profile, known setups for repair agents |
| `leads.py` | Finds a quoted line again when an agent miscounts |
| `crew.py`, `gitbox.py` | The Kiro Crew and GitHub containers; Kiro sign-in (Builder ID, Google, GitHub, organization) |

## Adding a rule (checklist)
1. `models.py`: add the id to `InvariantId` and any new output field to `OutputField`.
2. `sweep.py`: entry in `INVARIANTS`, normalise the field in `_NORM_JS`, judge it in `check()`, write the regression test in
   `regression_code()`. Add any new `ctx` helper to the harness and the regression test context.
3. `pipeline.py`: `INVARIANT_CATEGORY`. `frontend/src/content/caseView.ts`: `INVARIANT_LABELS`.
4. Regenerate schemas: `python -m timewraith.schema_export`.

## Checks before a commit
```
cd backend
$env:PYTHONPATH="src"
python -m ruff format --check src tests
python -m ruff check src tests
python -m pytest -q -p no:cacheprovider -W ignore tests
```
Frontend: `cd frontend; pnpm typecheck; pnpm exec eslint .; pnpm exec vitest run --configLoader runner`.