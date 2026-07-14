"""
Note generation API routes.
"""
import logging
import json
import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.auth import AuthenticatedUser
from app.models.note import LocalFileRequest, NoteRequest, NoteResponse, SummaryMode, TaskStatusResponse
from app.models.transcript import TranscriptResult
from app.services.auth_service import get_current_user
from app.services.generation_job_repository import GenerationJobRepository
from app.services.note_service import NoteService
from app.services.team_repository import TeamRepository
from app.services.task_artifact_service import TaskArtifactService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notes"])
_note_service = NoteService()
_job_repository = GenerationJobRepository()
_team_repository = TeamRepository()
_artifacts = TaskArtifactService()

_ALLOWED_OUTPUT_LANGUAGES = {"en", "zh-CN"}
_ALLOWED_SUMMARY_MODES = {"default", "accurate", "oneshot"}
_ALLOWED_MEDIA_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".m4a",
    ".flac",
    ".ogg",
    ".aac",
    ".opus",
    ".webm",
    ".mp4",
    ".mkv",
    ".mov",
    ".avi",
    ".m4v",
    ".ts",
    ".mts",
    ".flv",
    ".3gp",
    ".mpg",
    ".mpeg",
    ".wmv",
}
_ALLOWED_TRANSCRIPT_EXTENSIONS = {".txt", ".vtt", ".srt", ".json", ".md"}
_UPLOAD_CHUNK_BYTES = 1024 * 1024


def _write_upload_chunk(path: Path, chunk: bytes, *, append: bool) -> None:
    with path.open("ab" if append else "wb") as handle:
        handle.write(chunk)


async def _persist_upload_bounded(file: UploadFile, path: Path, max_bytes: int) -> int:
    total = 0
    append = False
    try:
        while True:
            chunk = await file.read(_UPLOAD_CHUNK_BYTES)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ValueError(f"Uploaded file exceeds the {max_bytes}-byte limit.")
            await run_in_threadpool(_write_upload_chunk, path, chunk, append=append)
            append = True
    except Exception:
        await run_in_threadpool(path.unlink, missing_ok=True)
        raise
    finally:
        await file.close()
    if total == 0:
        await run_in_threadpool(path.unlink, missing_ok=True)
        raise ValueError("Uploaded file is empty.")
    return total


def _normalize_source_type(value: str | None) -> str:
    normalized = (value or "media").strip().lower()
    if normalized in {"media", ""}:
        return "audio"
    if normalized in {"audio", "video", "transcript"}:
        return normalized
    raise ValueError("Invalid source_type. Allowed values are audio, video, transcript.")


def _normalize_summary_mode(value: str) -> SummaryMode:
    normalized = (value or "default").strip().lower()
    if normalized not in _ALLOWED_SUMMARY_MODES:
        raise ValueError("Invalid summary_mode. Allowed: default, accurate, oneshot.")
    return normalized  # type: ignore[return-value]


def _normalize_output_language(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip()
    if normalized not in _ALLOWED_OUTPUT_LANGUAGES:
        raise ValueError("Invalid output_language. Allowed: en, zh-CN.")
    return normalized


def _sanitize_filename(value: str | None) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", (value or "").strip())
    safe = re.sub(r"_+", "_", safe).strip("._")
    return safe or "upload"


def _build_upload_path(task_id: str, source_type: str, filename: str | None) -> Path:
    uploads_dir = settings.data_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    sanitized_name = _sanitize_filename(filename)
    file_suffix = Path(sanitized_name).suffix.lower()
    stem = Path(sanitized_name).stem
    if not file_suffix:
        file_suffix = ".bin"
    if not stem:
        stem = task_id
    file_name = f"{task_id}_{source_type}_{stem}{file_suffix}"
    return uploads_dir / file_name


def _ensure_media_extension(source_type: str, filename: str | None):
    if source_type == "transcript":
        return
    ext = Path(filename or "").suffix.lower()
    if ext and ext not in _ALLOWED_MEDIA_EXTENSIONS:
        raise ValueError(f"Unsupported media format: {ext}")


def _ensure_transcript_extension(filename: str | None):
    ext = Path(filename or "").suffix.lower()
    if ext and ext not in _ALLOWED_TRANSCRIPT_EXTENSIONS:
        raise ValueError(f"Unsupported transcript format: {ext}")


def _create_local_job(
    run: dict,
    user: AuthenticatedUser,
    source_type: str,
    title: str | None,
    scope: str = "personal",
    team_id: str | None = None,
    job_id: str | None = None,
    source_media_path: str | None = None,
) -> dict:
    upstream_run_id = run.get("id")
    if not isinstance(upstream_run_id, str) or not upstream_run_id:
        raise ValueError("VILab Server did not return a run ID")
    upstream_status = str(run.get("status") or "queued").lower()
    status = "pending" if upstream_status in {"queued", "pending"} else "processing"
    local_job_id = job_id or str(uuid.uuid4())
    task_dir = None
    try:
        if source_media_path:
            task_dir = _artifacts.create_task_dir(local_job_id)
            _artifacts.stage_source_media(task_dir, source_media_path, media_kind=source_type)
            _artifacts.update_status(task_dir, "processing", "Source media preserved")
        job = _job_repository.create(
            user_id=user.user_id,
            upstream_run_id=upstream_run_id,
            status=status,
            source_type=source_type,
            title=title,
            metadata={"upstreamStatus": upstream_status},
            scope=scope,
            team_id=team_id,
            job_id=local_job_id,
        )
    except Exception:
        try:
            _note_service.cancel(upstream_run_id, user_id=user.user_id)
        except Exception:
            logger.exception("[API] failed to cancel orphaned VILab run after local job persistence error")
        if task_dir and task_dir.exists():
            shutil.rmtree(task_dir, ignore_errors=True)
        raise
    return {"task_id": job.id, "status": job.status, "message": "Task submitted to VILab Server"}


def _validate_workspace(user_id: str, scope: str, team_id: str | None) -> None:
    if scope == "personal" and team_id is None:
        return
    if scope != "team" or not team_id:
        raise ValueError("Invalid generation workspace")
    if not _team_repository.is_team_member(user_id, team_id):
        raise HTTPException(status_code=403, detail="Team not found or access denied")


def _transcript_from_upload(path: Path) -> TranscriptResult:
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        payload = json.loads(text)
        if isinstance(payload, dict):
            text = str(payload.get("fullText") or payload.get("full_text") or payload.get("transcript") or payload.get("text") or "")
        elif isinstance(payload, list):
            text = "\n".join(str(item.get("text") or "") for item in payload if isinstance(item, dict))
    elif path.suffix.lower() in {".vtt", ".srt"}:
        lines = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped or stripped == "WEBVTT" or stripped.isdigit() or "-->" in stripped:
                continue
            lines.append(stripped)
        text = "\n".join(lines)
    if not text.strip():
        raise ValueError("Transcript file does not contain text.")
    return TranscriptResult(language=None, full_text=text.strip(), segments=[])


def _owned_job_or_404(task_id: str, user: AuthenticatedUser):
    job = _job_repository.get_owned(task_id, user.user_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return job


@router.post("/generate")
def generate_note_async(
    req: NoteRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        run = _note_service.submit_video_url(
            video_url=req.video_url,
            style=req.style or "detailed",
            summary_mode=req.summary_mode,
            extras=req.extras,
            output_language=req.output_language,
            user_id=user.user_id if user else None,
        )
    except Exception as exc:
        logger.error("[API] generate failed to submit VILab Server run: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _create_local_job(run, user, "video_url", None)


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    job = _owned_job_or_404(task_id, user)
    try:
        status_data = _note_service.get_status(job.upstream_run_id, user_id=user.user_id)
    except Exception as exc:
        logger.warning("[API] task poll failed task_id=%s error=%s", task_id, exc)
        raise HTTPException(status_code=502, detail="Unable to refresh generation task; retry polling.") from exc
    status = status_data.get("status", "not_found")
    message = status_data.get("message", "")
    metadata = status_data.get("metadata") if isinstance(status_data.get("metadata"), dict) else {}
    error = status_data.get("error") if isinstance(status_data.get("error"), dict) else None
    if error:
        metadata = {**metadata, "error": error}
    _job_repository.update_snapshot(
        task_id,
        user.user_id,
        status=status,
        metadata=metadata,
        error=error,
    )
    result = None
    if status == "success":
        result_data = _note_service.get_result(job.upstream_run_id, user_id=user.user_id)
        if result_data:
            finalized = _job_repository.finalize_completed(
                task_id,
                user.user_id,
                _note_service.get_structured_result(status_data["run"]),
            )
            result = NoteResponse(
                task_id=task_id,
                title=result_data.get("title", ""),
                markdown=result_data.get("markdown", ""),
                duration=result_data.get("duration", 0),
                platform=result_data.get("platform", ""),
                video_id=task_id,
                summary_mode=result_data.get("summary_mode", "default"),
            )
            job = finalized or job
    return TaskStatusResponse(
        task_id=task_id,
        status=status,
        message=message,
        result=result,
        metadata=metadata,
        note_id=job.note_id,
    )


@router.get("/task/{task_id}/artifacts/{asset_path:path}", include_in_schema=False)
def get_task_artifact(task_id: str, asset_path: str, user: AuthenticatedUser = Depends(get_current_user)):
    try:
        job = _owned_job_or_404(task_id, user)
        body, content_type = _note_service.get_artifact(job.upstream_run_id, asset_path, user_id=user.user_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[API] artifact proxy failed task_id=%s path=%s error=%s", task_id, asset_path, exc)
        raise HTTPException(status_code=404, detail="Artifact not found") from exc
    return Response(content=body, media_type=content_type)


@router.post("/task/{task_id}/cancel")
def cancel_task(task_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    job = _owned_job_or_404(task_id, user)
    try:
        run = _note_service.cancel(job.upstream_run_id, user_id=user.user_id)
    except Exception as exc:
        logger.error("[API] cancellation proxy failed task_id=%s error=%s", task_id, exc)
        raise HTTPException(status_code=502, detail="Unable to cancel generation task") from exc
    status = "failed" if str(run.get("status") or "").lower() in {"cancelled", "canceled"} else "processing"
    _job_repository.update_snapshot(
        task_id,
        user.user_id,
        status=status,
        metadata={"upstreamStatus": str(run.get("status") or "unknown")},
        error={"category": "cancelled", "message": "Task cancelled"} if status == "failed" else None,
    )
    return {"task_id": task_id, "status": status}


@router.get("/styles")
def get_styles(user: AuthenticatedUser = Depends(get_current_user)):
    try:
        styles = _note_service.list_styles(user_id=user.user_id if user else None)
    except Exception as exc:
        logger.error("[API] styles proxy failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return styles


@router.post("/generate_from_file", response_model=dict)
def generate_from_file_async(
    req: LocalFileRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        _note_service.ensure_ready_for_source("audio", user_id=user.user_id)
        run = _note_service.submit_file(
            file_path=req.file_path,
            source_type="audio",
            title=req.title,
            style=req.style or "meeting",
            summary_mode=req.summary_mode,
            extras=req.extras,
            output_language=req.output_language,
            user_id=user.user_id if user else None,
        )
    except Exception as exc:
        logger.error("[API] generate_from_file failed to submit VILab Server run: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _create_local_job(run, user, "audio", req.title, source_media_path=req.file_path)


@router.post("/generate_from_upload", response_model=dict)
async def generate_from_upload(
    file: UploadFile = File(...),
    source_type: str = Form("media"),
    title: str | None = Form(None),
    style: str | None = Form("meeting"),
    summary_mode: str = Form("default"),
    extras: str | None = Form(None),
    output_language: str | None = Form(None),
    scope: str = Form("personal"),
    team_id: str | None = Form(None),
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        normalized_source_type = _normalize_source_type(source_type)
        normalized_summary_mode = _normalize_summary_mode(summary_mode)
        normalized_output_language = _normalize_output_language(output_language)
        _validate_workspace(user.user_id, scope, team_id)
        if normalized_source_type == "video":
            raise HTTPException(status_code=422, detail="Video upload is not enabled in the audio meeting workflow")
        _note_service.ensure_ready_for_source(normalized_source_type, user_id=user.user_id)
        task_id = str(uuid.uuid4())
        _ensure_transcript_extension(file.filename) if normalized_source_type == "transcript" else _ensure_media_extension(normalized_source_type, file.filename)
        upload_path = _build_upload_path(task_id, normalized_source_type, file.filename)
        await _persist_upload_bounded(file, upload_path, settings.upload_max_bytes)
        common = {
            "title": title or Path(file.filename or upload_path.name).stem,
            "style": style or "meeting",
            "summary_mode": normalized_summary_mode,
            "extras": extras,
            "output_language": normalized_output_language,
            "user_id": user.user_id,
        }
        if normalized_source_type == "transcript":
            transcript = await run_in_threadpool(_transcript_from_upload, upload_path)
            run = await run_in_threadpool(
                _note_service.submit_transcript,
                transcript=transcript,
                **common,
            )
        else:
            run = await run_in_threadpool(
                _note_service.submit_file,
                file_path=str(upload_path),
                source_type="audio",
                pipeline="meeting_minutes",
                **common,
            )
        return _create_local_job(
            run,
            user,
            normalized_source_type,
            title or Path(file.filename or upload_path.name).stem,
            scope,
            team_id,
            job_id=task_id,
            source_media_path=str(upload_path) if normalized_source_type == "audio" else None,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        status_code = 413 if "exceeds" in str(exc) else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[API] generate_from_upload failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
