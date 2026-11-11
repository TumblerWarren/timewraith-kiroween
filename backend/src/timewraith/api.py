"""HTTP API. Run: uv --directory backend run uvicorn timewraith.api:app --host 127.0.0.1 --port 8787"""

from __future__ import annotations

import asyncio
import shutil
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from . import ENGINE_VERSION, sandbox
from .agents import make_runtime
from .config import get_settings
from .ingest import IngestError
from .models import CapabilityReport, CreateInvestigation, FeatureMap, Investigation, InvestigationSummary, TestPlan
from .pipeline import Engine, Stop
from .store import Store

settings = get_settings()
settings.check_paths()
store = Store(settings.db_path)
engine = Engine(settings, store)
engine.recover()

app = FastAPI(title="TimeWraith", version=ENGINE_VERSION)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"]
)

STATUS = {
    "not_found": 404,
    "not_awaiting_approval": 409,
    "fix_not_verified": 409,
    "fix_not_accepted": 409,
    "not_ready": 409,
}


def _err(code: str, message: str, status: int = 422) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


@app.exception_handler(IngestError)
async def _ingest_error(_: Request, e: IngestError) -> JSONResponse:
    return _err(e.code, str(e))


@app.exception_handler(Stop)
async def _stop_error(_: Request, e: Stop) -> JSONResponse:
    return _err(e.code, str(e), STATUS.get(e.code, 409))


def _inv(inv_id: str) -> Investigation:
    inv = store.get(inv_id)
    if not inv:
        raise Stop("not_found", "Investigation not found")
    return inv


def _summary(i: Investigation) -> InvestigationSummary:
    return InvestigationSummary(
        id=i.id,
        created_at=i.created_at,
        target=i.target,
        mode=i.request.mode,
        stage=i.stage,
        status=i.status,
        bug_count=len(i.bugs),
        replay_label=i.replay_label,
        runtime_label=i.runtime_label,
    )


def _public(i: Investigation) -> dict[str, Any]:
    """Blind hunt: the issue URL stays sealed until the reveal."""
    d = i.model_dump()
    if i.request.mode == "blind-hunt" and not i.revealed:
        d["request"]["issue_url"] = None
    return d


@app.get("/api/v1/health")
def health() -> dict[str, Any]:
    docker_ok, docker_msg = sandbox.docker_available()
    rt = make_runtime(settings, lambda *_: None)
    return {
        "engine_version": ENGINE_VERSION,
        "gateway": "connected",
        "agent_runtime": {"name": rt.name, "label": rt.label},
        "sandbox": {"available": docker_ok, "detail": docker_msg},
        "git": shutil.which("git") is not None,
    }


@app.post("/api/v1/investigations", status_code=202)
def create(req: CreateInvestigation) -> InvestigationSummary:
    return _summary(engine.create(req))


@app.get("/api/v1/investigations")
def list_investigations(limit: int = 50) -> list[InvestigationSummary]:
    return [_summary(i) for i in store.recent(min(max(limit, 1), 200))]


@app.get("/api/v1/investigations/{inv_id}")
def get_investigation(inv_id: str) -> dict[str, Any]:
    return _public(_inv(inv_id))


@app.get("/api/v1/investigations/{inv_id}/feature-map")
def feature_map(inv_id: str) -> FeatureMap:
    fm = _inv(inv_id).feature_map
    if not fm:
        raise Stop("not_ready", "Discovery has not finished")
    return fm


@app.get("/api/v1/investigations/{inv_id}/test-plan")
def test_plan(inv_id: str) -> TestPlan:
    tp = _inv(inv_id).test_plan
    if not tp:
        raise Stop("not_ready", "Planning has not finished")
    return tp


@app.get("/api/v1/investigations/{inv_id}/capabilities")
def capabilities(inv_id: str) -> CapabilityReport:
    c = _inv(inv_id).capabilities
    if not c:
        raise Stop("not_ready", "Analysis has not finished")
    return c


@app.post("/api/v1/investigations/{inv_id}/approve-plan")
def approve_plan(inv_id: str) -> InvestigationSummary:
    return _summary(engine.approve_plan(inv_id))


@app.post("/api/v1/investigations/{inv_id}/cancel")
def cancel(inv_id: str) -> InvestigationSummary:
    engine.cancel(inv_id)
    return _summary(_inv(inv_id))


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/fix/{decision}")
def decide_fix(inv_id: str, bug_id: str, decision: str) -> InvestigationSummary:
    if decision not in {"accept", "reject"}:
        raise Stop("not_found", "Use /fix/accept or /fix/reject")
    return _summary(engine.decide_fix(inv_id, bug_id, decision == "accept"))


@app.get("/api/v1/investigations/{inv_id}/bugs/{bug_id}/patch")
def patch(inv_id: str, bug_id: str) -> FileResponse:
    path = engine.patch_file(inv_id, bug_id)
    return FileResponse(path, media_type="text/x-diff", filename=f"timewraith-{bug_id}.patch")


@app.get("/api/v1/investigations/{inv_id}/audit")
def audit(inv_id: str) -> list[dict[str, str]]:
    _inv(inv_id)
    return store.audit_rows(inv_id)


@app.get("/api/v1/investigations/{inv_id}/events")
async def events(inv_id: str, request: Request) -> StreamingResponse:
    """Server-Sent Events in the frontend's ReplayEvent shape. Resumes from the Last-Event-ID header (a seq)."""
    _inv(inv_id)
    last = request.headers.get("last-event-id")
    after = int(last) if last and last.isdigit() else -1
    final = {"completed", "failed", "cancelled"}

    async def stream() -> AsyncIterator[str]:
        nonlocal after
        idle = 0
        while not await request.is_disconnected():
            batch = store.events(inv_id, after)
            for ev in batch:
                after = ev.seq
                yield f"id: {ev.seq}\nevent: replay\ndata: {ev.model_dump_json()}\n\n"
            inv = store.get(inv_id)
            if inv and inv.stage in final and not batch:
                yield f'event: end\ndata: {{"stage": "{inv.stage}"}}\n\n'
                return
            idle = 0 if batch else idle + 1
            if idle and idle % 30 == 0:
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
