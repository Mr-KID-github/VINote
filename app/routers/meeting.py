import asyncio
import json
import logging
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool
from websockets.exceptions import ConnectionClosed

from app.models.auth import AuthenticatedUser
from app.config import settings
from app.routers.note import (
    _ensure_media_extension,
    _normalize_output_language,
    _normalize_summary_mode,
    _persist_upload_bounded,
    _validate_workspace,
)
from app.services.auth_service import authenticate_websocket, get_current_user
from app.services.generation_job_repository import GenerationJobRepository
from app.services.meeting_session_repository import MeetingSessionRepository
from app.services.note_service import NoteService
from app.services.task_artifact_service import TaskArtifactService
from app.services.realtime_meeting_proxy import (
    AudioFrameValidator,
    RelayProtocolError,
    connect_upstream_speaker_session,
    localize_upstream_event,
    validate_client_control,
)
from app.services.vilab_server_connection_service import VILabServerConnectionService


router = APIRouter(prefix="/meeting", tags=["meeting"])
logger = logging.getLogger(__name__)
_sessions = MeetingSessionRepository()
_connections = VILabServerConnectionService()
_jobs = GenerationJobRepository()
_notes = NoteService()
_artifacts = TaskArtifactService()


@router.post("/sessions", status_code=201)
def create_meeting_session(user: AuthenticatedUser = Depends(get_current_user)):
    session = _sessions.create(user.user_id)
    return {
        "session_id": session.id,
        "status": session.status,
        "websocket_url": f"/api/meeting/sessions/{session.id}/realtime",
    }


@router.get("/sessions/{session_id}")
def get_meeting_session(session_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    session = _sessions.get_owned(session_id, user.user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Meeting session not found")
    return {
        "session_id": session.id,
        "status": session.status,
        "generation_job_id": session.generation_job_id,
    }


@router.post("/sessions/{session_id}/complete", status_code=202)
async def complete_meeting_session(
    session_id: str,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    style: str = Form("meeting"),
    summary_mode: str = Form("default"),
    output_language: str | None = Form(None),
    scope: str = Form("personal"),
    team_id: str | None = Form(None),
    user: AuthenticatedUser = Depends(get_current_user),
):
    session = _sessions.get_owned(session_id, user.user_id)
    if not session:
        await file.close()
        raise HTTPException(status_code=404, detail="Meeting session not found")
    existing = _jobs.get_owned(session.generation_job_id, user.user_id) if session.generation_job_id else None
    if existing and existing.status != "failed":
        await file.close()
        return {"session_id": session.id, "task_id": existing.id, "status": existing.status}

    failed_job_id = existing.id if existing and existing.status == "failed" else None

    task_dir: Path | None = None
    upstream_run_id: str | None = None
    claimed = False
    try:
        normalized_summary_mode = _normalize_summary_mode(summary_mode)
        normalized_output_language = _normalize_output_language(output_language)
        _validate_workspace(user.user_id, scope, team_id)
        _ensure_media_extension("audio", file.filename)
        await run_in_threadpool(_notes.ensure_ready_for_source, "audio", user_id=user.user_id)
        if failed_job_id:
            claimed = _sessions.claim_failed_retry(session_id, user.user_id, failed_job_id)
        else:
            claimed = _sessions.claim_completion(session_id, user.user_id)
        if not claimed:
            await file.close()
            current = _sessions.get_owned(session_id, user.user_id)
            if current and current.generation_job_id:
                current_job = _jobs.get_owned(current.generation_job_id, user.user_id)
                if current_job:
                    return {"session_id": session.id, "task_id": current_job.id, "status": current_job.status}
            raise HTTPException(status_code=409, detail="Meeting completion is already in progress")

        job_id = str(uuid.uuid4())
        task_dir = _artifacts.create_task_dir(job_id)
        media_dir = task_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(file.filename or "recording.webm").suffix.lower() or ".webm"
        upload_path = media_dir / f"source_audio{suffix}"
        await _persist_upload_bounded(file, upload_path, settings.upload_max_bytes)
        _artifacts.record_source_media(task_dir, upload_path, media_kind="audio")
        _artifacts.update_status(task_dir, "processing", "Meeting recording queued")
        resolved_title = title or "Meeting recording"
        run = await run_in_threadpool(
            _notes.submit_file,
            file_path=str(upload_path),
            source_type="audio",
            pipeline="meeting_minutes",
            title=resolved_title,
            style=style or "meeting",
            summary_mode=normalized_summary_mode,
            output_language=normalized_output_language,
            user_id=user.user_id,
        )
        upstream_run_id = run.get("id")
        if not isinstance(upstream_run_id, str) or not upstream_run_id:
            raise ValueError("VILab Server did not return a run ID")
        upstream_status = str(run.get("status") or "queued").lower()
        local_status = "pending" if upstream_status in {"queued", "pending"} else "processing"
        job = _jobs.create_for_meeting_session(
            job_id=job_id,
            session_id=session_id,
            user_id=user.user_id,
            upstream_run_id=upstream_run_id,
            status=local_status,
            title=resolved_title,
            scope=scope,
            team_id=team_id,
            metadata={"upstreamStatus": upstream_status, "meetingSessionId": session_id},
        )
        return {"session_id": session.id, "task_id": job.id, "status": job.status}
    except HTTPException:
        await file.close()
        if claimed:
            _sessions.mark_completion_failed(session_id, user.user_id)
        if task_dir and task_dir.exists():
            await run_in_threadpool(shutil.rmtree, task_dir, True)
        raise
    except ValueError as exc:
        await file.close()
        if claimed:
            _sessions.mark_completion_failed(session_id, user.user_id)
        if upstream_run_id:
            try:
                await run_in_threadpool(_notes.cancel, upstream_run_id, user_id=user.user_id)
            except Exception:
                logger.warning("Unable to cancel orphaned VILab run after invalid meeting handoff", exc_info=True)
        if task_dir and task_dir.exists():
            await run_in_threadpool(shutil.rmtree, task_dir, True)
        status_code = 413 if "exceeds" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        await file.close()
        logger.exception("Meeting offline handoff failed session_id=%s", session_id)
        if claimed:
            _sessions.mark_completion_failed(session_id, user.user_id)
        if upstream_run_id:
            try:
                await run_in_threadpool(_notes.cancel, upstream_run_id, user_id=user.user_id)
            except Exception:
                logger.warning("Unable to cancel orphaned VILab run after failed meeting handoff", exc_info=True)
        if task_dir and task_dir.exists():
            await run_in_threadpool(shutil.rmtree, task_dir, True)
        raise HTTPException(status_code=502, detail="Unable to start offline meeting processing") from exc


@router.websocket("/sessions/{session_id}/realtime")
async def proxy_meeting_realtime(websocket: WebSocket, session_id: str):
    try:
        user = authenticate_websocket(websocket)
    except HTTPException:
        await websocket.close(code=4401)
        return
    if not _sessions.get_owned(session_id, user.user_id):
        await websocket.close(code=4404)
        return
    connection_id = _sessions.claim_realtime(session_id, user.user_id)
    if not connection_id:
        await websocket.close(code=4409)
        return

    await websocket.accept()
    upstream = None
    try:
        client = _connections.resolve_client(user.user_id)
        upstream = await connect_upstream_speaker_session(client)
    except Exception:
        _sessions.update_connection(session_id, user.user_id, connection_id, status="failed")
        await websocket.send_json({
            "schemaVersion": 2,
            "type": "error",
            "sessionId": session_id,
            "code": "upstream_unavailable",
            "message": "Realtime meeting service is unavailable",
            "fatal": True,
        })
        await websocket.close(code=1011)
        return

    _sessions.update_connection(session_id, user.user_id, connection_id, status="connected")
    upstream_started = asyncio.Event()
    validator = AudioFrameValidator()
    client_started = False
    upstream_terminal = False

    async def browser_to_upstream():
        nonlocal client_started
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                raise WebSocketDisconnect(message.get("code", 1000))
            if message.get("text") is not None:
                value = validate_client_control(message["text"], started=client_started)
                client_started = True
                await upstream.send(json.dumps(value, separators=(",", ":")))
                continue
            frame = message.get("bytes")
            if frame is None:
                continue
            if not upstream_started.is_set():
                raise RelayProtocolError("audio_before_session_start", "Audio sent before session.started", 1002)
            validator.validate(frame)
            await upstream.send(frame)

    async def upstream_to_browser():
        nonlocal upstream_terminal
        while True:
            message = await upstream.recv()
            if not isinstance(message, str):
                raise RelayProtocolError("upstream_protocol_error", "Unexpected binary upstream event", 1011)
            localized, upstream_id, terminal = localize_upstream_event(message, session_id)
            event_type = json.loads(localized)["type"]
            if event_type == "session.started":
                upstream_started.set()
            if event_type == "session.accepted" and upstream_id:
                _sessions.update_connection(
                    session_id,
                    user.user_id,
                    connection_id,
                    status="active",
                    upstream_session_id=upstream_id,
                )
            upstream_terminal = terminal
            await websocket.send_text(localized)
            if terminal:
                return

    tasks = {asyncio.create_task(browser_to_upstream()), asyncio.create_task(upstream_to_browser())}
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
        for task in pending:
            task.cancel()
    except RelayProtocolError as exc:
        await websocket.send_json({
            "schemaVersion": 2,
            "type": "error",
            "sessionId": session_id,
            "code": exc.code,
            "message": str(exc),
            "fatal": True,
        })
        await websocket.close(code=exc.close_code)
    except (WebSocketDisconnect, ConnectionClosed):
        pass
    except Exception:
        try:
            await websocket.send_json({
                "schemaVersion": 2,
                "type": "error",
                "sessionId": session_id,
                "code": "relay_failed",
                "message": "Realtime relay failed",
                "fatal": True,
            })
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        for task in tasks:
            task.cancel()
        try:
            if client_started and not validator.finished and not upstream_terminal:
                await upstream.send(json.dumps({"type": "session.cancel", "reason": "client_disconnect"}))
            await upstream.close()
        except Exception:
            pass
        _sessions.update_connection(session_id, user.user_id, connection_id, status="closed")
