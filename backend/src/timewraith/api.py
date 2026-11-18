"""HTTP API. Run: uv --directory backend run uvicorn timewraith.api:app --host 127.0.0.1 --port 8787"""

from __future__ import annotations

import asyncio
import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import ENGINE_VERSION, crew, gitbox, sandbox
from .agents import make_runtime
from .config import get_settings
from .fixsession import ToolError, ToolSession
from .ingest import IngestError
from .models import (
    FLOW,
    CapabilityReport,
    CreateInvestigation,
    DecisionRecord,
    FeatureMap,
    FlowStep,
    Investigation,
    InvestigationSummary,
    TestPlan,
)
from .pipeline import Engine, Stop
from .store import Store

settings = get_settings()
settings.check_paths()
store = Store(settings.db_path)
engine = Engine(settings, store)
engine.recover()

app = FastAPI(title="TimeWraith", version=ENGINE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-TimeWraith"],
)

STATUS = {
    "forbidden": 403,
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
        phase=i.phase,
        status=i.status,
        bug_count=len(i.bugs),
        fix_verified_count=sum(1 for b in i.bugs if b.fix.state == "verified"),
        intended_count=len(i.intended),
        replay_label=i.replay_label,
        runtime_label=i.runtime_label,
        error=i.error,
        message=i.notes[-1] if i.stage == "failed" and i.notes else None,
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
        "limits": {
            "agent_calls": settings.max_agent_calls,
            "minutes": settings.investigation_budget_s // 60,
            "fix_attempts": settings.max_fix_attempts,
            "bugs_to_fix": settings.max_bugs_to_fix,
        },
    }


def _setup() -> dict[str, Any]:
    """Docker, the Kiro Crew, the Kiro sign-in and the GitHub container, in one status for the readiness board."""
    return {**crew.manager.status(), "github": gitbox.manager.status()}


def _local_action(request: Request) -> None:
    """Actions that touch this machine need a custom header: a cross-site form cannot send one without passing CORS."""
    if request.headers.get("x-timewraith") != "1":
        raise Stop("forbidden", "Missing the X-TimeWraith header")


@app.get("/api/v1/system/setup")
def system_setup() -> dict[str, Any]:
    """Docker Desktop, the Kiro Crew container and the Kiro sign-in, for the readiness board."""
    return _setup()


@app.post("/api/v1/system/docker/start")
def system_docker_start(request: Request) -> dict[str, Any]:
    _local_action(request)
    try:
        message = crew.manager.start_docker()
    except RuntimeError as e:
        raise Stop("docker_start_failed", str(e)) from e
    return {"message": message, **_setup()}


@app.post("/api/v1/system/crew/start")
def system_crew_start(request: Request) -> dict[str, Any]:
    _local_action(request)
    if not crew.manager.docker_running():
        raise Stop("docker_not_running", "Start Docker first")
    return {"message": crew.manager.start_crew(), **_setup()}


@app.post("/api/v1/system/crew/login")
def system_crew_login(request: Request, body: dict[str, Any] | None = None) -> dict[str, Any]:
    """Start the Kiro sign-in. Body `{"method": "builder_id" | "google" | "github"}`; Builder ID when absent."""
    _local_action(request)
    method = (body or {}).get("method", "builder_id")
    if method not in ("builder_id", "google", "github"):
        raise Stop("invalid_method", "Choose builder_id, google or github")
    try:
        crew.manager.start_login(method)
    except RuntimeError as e:
        raise Stop("crew_not_running", str(e)) from e
    return _setup()


def _fix_session(request: Request) -> ToolSession:
    """Only a live tool session's token opens the tools; there is no other way in."""
    s = engine.sessions.get(request.headers.get("x-tw-session"))
    if not s:
        raise Stop("forbidden", "No live tool session for this token")
    return s


@app.post("/api/v1/internal/fix-tools/list")
def fix_tools_list(request: Request) -> dict[str, Any]:
    """The tools of the session this token belongs to: Doctor Stitch's fix tools or Raven's verification tools."""
    return {"tools": _fix_session(request).tools}


@app.post("/api/v1/internal/fix-tools/call")
def fix_tools_call(request: Request, body: dict[str, Any]) -> dict[str, Any]:
    """One tool call from a Kiro agent session, forwarded by the MCP proxy in the Kiro Crew container."""
    s = _fix_session(request)
    name, args = body.get("name"), body.get("arguments")
    if not isinstance(name, str) or not isinstance(args, dict):
        return {"error": "Give a tool name and an arguments object"}
    try:
        return {"result": s.call(name, args)}
    except ToolError as e:
        return {"error": str(e)}


@app.post("/api/v1/system/crew/login/cancel")
def system_crew_login_cancel(request: Request) -> dict[str, Any]:
    """Stop a pending Kiro sign-in, so the user can start again with a new code."""
    _local_action(request)
    crew.manager.cancel_login()
    return _setup()


@app.post("/api/v1/system/github/start")
def system_github_start(request: Request) -> dict[str, Any]:
    """Build (if needed) and start the GitHub container."""
    _local_action(request)
    if not crew.manager.docker_running():
        raise Stop("docker_not_running", "Start Docker first")
    return {"message": gitbox.manager.start(), **_setup()}


@app.post("/api/v1/system/github/login")
def system_github_login(request: Request) -> dict[str, Any]:
    """Start the GitHub sign-in: the status then carries the one-time code and the github.com link."""
    _local_action(request)
    try:
        gitbox.manager.start_login()
    except RuntimeError as e:
        raise Stop("github_not_running", str(e)) from e
    return _setup()


@app.post("/api/v1/system/github/login/cancel")
def system_github_login_cancel(request: Request) -> dict[str, Any]:
    _local_action(request)
    gitbox.manager.cancel_login()
    return _setup()


@app.post("/api/v1/system/github/logout")
def system_github_logout(request: Request) -> dict[str, Any]:
    """Remove the GitHub token from the container."""
    _local_action(request)
    try:
        gitbox.manager.logout()
    except RuntimeError as e:
        raise Stop("github_logout_failed", str(e)) from e
    return _setup()


@app.get("/api/v1/investigations/{inv_id}/bugs/{bug_id}/github")
def github_preview(inv_id: str, bug_id: str) -> dict[str, Any]:
    """What sharing this fix on GitHub would send, and what stands in the way. Sends nothing."""
    return engine.github_preview(inv_id, bug_id)


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/contribution")
def prepare_contribution(inv_id: str, bug_id: str, request: Request) -> dict[str, Any]:
    """Check the accepted fix against the repository's own rules and rebuild the branch to follow them.

    Reads the repository's CONTRIBUTING, PR template and commit convention; rebases the fix on the upstream's latest
    default branch; places and formats the test the way the repository does; runs its own formatter, linter, type check
    and tests in the sandbox; and writes the pull request text in its template. It can take a few minutes and sends
    nothing to GitHub."""
    _local_action(request)
    return engine.prepare_contribution(inv_id, bug_id).model_dump()


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/contribution/description")
def generate_description(inv_id: str, bug_id: str, request: Request) -> dict[str, str]:
    """Write the pull request title and description again from the repository's own template and title convention.
    Nothing is saved or sent to GitHub; the text comes back for you to review and edit."""
    _local_action(request)
    return engine.generate_description(inv_id, bug_id)


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/github/push")
def github_push(inv_id: str, bug_id: str, request: Request, body: dict[str, Any]) -> dict[str, Any]:
    """Push the fix branch to your fork. Body `{"confirm_branch": "<the branch name>"}`."""
    _local_action(request)
    return engine.github_push(
        inv_id, bug_id, str(body.get("confirm_branch", "")), bool(body.get("acknowledge_duplicates", False))
    ).model_dump()


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/github/update")
def github_update(inv_id: str, bug_id: str, request: Request, body: dict[str, Any]) -> dict[str, Any]:
    """Add a commit with the rebuilt fix to the branch already on your fork and refresh the open pull request's text.
    Body `{"title", "body", "confirm_branch"}`. A normal fast-forward push; never a force-push."""
    _local_action(request)
    return engine.github_update(
        inv_id,
        bug_id,
        str(body.get("title", "")),
        str(body.get("body", "")),
        str(body.get("confirm_branch", "")),
    ).model_dump()


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/github/pull-request")
def github_pull_request(inv_id: str, bug_id: str, request: Request, body: dict[str, Any]) -> dict[str, Any]:
    """Open the pull request on the original repository. Body `{"title", "body", "confirm_branch"}`."""
    _local_action(request)
    return engine.github_pull_request(
        inv_id,
        bug_id,
        str(body.get("title", "")),
        str(body.get("body", "")),
        str(body.get("confirm_branch", "")),
        bool(body.get("acknowledge_duplicates", False)),
    ).model_dump()


@app.post("/api/v1/system/crew/logout")
def system_crew_logout(request: Request) -> dict[str, Any]:
    """Sign the Kiro Crew container out of Kiro. Running investigations keep the runtime they started with."""
    _local_action(request)
    try:
        crew.manager.logout()
    except RuntimeError as e:
        raise Stop("logout_failed", str(e)) from e
    return _setup()


@app.get("/api/v1/flow")
def flow() -> list[FlowStep]:
    """The five-step flow for the top of the Case Board (plus the follow-on fix step), with owners."""
    return FLOW


@app.post("/api/v1/system/crew/delete")
def system_crew_delete(request: Request) -> dict[str, Any]:
    """Delete the local Crew and saved sign-in; keep the image and case history."""
    _local_action(request)
    try:
        crew.manager.remove_crew()
    except RuntimeError as e:
        raise Stop("crew_delete_failed", str(e)) from e
    return _setup()


@app.get("/api/v1/investigations/{inv_id}/decisions")
def decisions(inv_id: str) -> list[DecisionRecord]:
    """Why the Crew did what it did: each agent claim, its checked evidence, and the rule that decided."""
    return _inv(inv_id).decisions


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


@app.post("/api/v1/investigations/{inv_id}/delete")
def delete_investigation(inv_id: str, request: Request) -> dict[str, str]:
    _local_action(request)
    engine.delete(inv_id)
    return {"deleted": inv_id}


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/fix/{decision}")
def decide_fix(inv_id: str, bug_id: str, decision: str) -> InvestigationSummary:
    if decision not in {"accept", "reject"}:
        raise Stop("not_found", "Use /fix/accept or /fix/reject")
    return _summary(engine.decide_fix(inv_id, bug_id, decision == "accept"))


@app.get("/api/v1/investigations/{inv_id}/bugs/{bug_id}/patch")
def patch(inv_id: str, bug_id: str) -> FileResponse:
    path = engine.patch_file(inv_id, bug_id)
    return FileResponse(path, media_type="text/x-diff", filename=f"timewraith-{bug_id}.patch")


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/branch")
def make_branch(inv_id: str, bug_id: str, request: Request) -> dict[str, Any]:
    """(Re)make the local git branch of an accepted fix. It is also made when you accept the fix."""
    _local_action(request)  # writes a folder on this machine
    return engine.make_branch(inv_id, bug_id).model_dump()


@app.get("/api/v1/investigations/{inv_id}/bugs/{bug_id}/branch.patch")
def branch_patch(inv_id: str, bug_id: str) -> FileResponse:
    """The branch's commit as a `git format-patch` file: `git am` applies it with message and author."""
    path = engine.branch_patch(inv_id, bug_id)
    return FileResponse(path, media_type="text/x-diff", filename=f"timewraith-{bug_id}.branch.patch")


@app.post("/api/v1/investigations/{inv_id}/bugs/{bug_id}/retest")
def retest(inv_id: str, bug_id: str, request: Request, body: dict[str, Any]) -> dict[str, Any]:
    """Rerun the bug's regression test on another revision. Body `{"ref": "main" | "<sha>" | "pull/453"}`."""
    _local_action(request)  # fetches from GitHub and runs the repository's code in the sandbox
    ref = body.get("ref")
    if not isinstance(ref, str) or not ref.strip():
        raise Stop("invalid_ref", "Give a ref: a branch, tag, commit SHA or pull request such as pull/453")
    inv = engine.retest(inv_id, bug_id, ref)
    bug = next(b for b in inv.bugs if b.id == bug_id)
    return bug.retests[-1].model_dump()


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
            if not inv or (inv.stage in final and not batch):
                stage = inv.stage if inv else "deleted"
                yield f'event: end\ndata: {{"stage": "{stage}"}}\n\n'
                return
            idle = 0 if batch else idle + 1
            if idle and idle % 30 == 0:
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# The built frontend (the Docker image sets TW_WEB_DIR). Mounted last, so every /api route above wins. The UI uses hash
# routes, so plain static serving is enough.
if settings.web_dir and Path(settings.web_dir).is_dir():
    app.mount("/", StaticFiles(directory=settings.web_dir, html=True), name="web")
