"""
Note generation API routes.
"""
import logging
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.config import settings
from app.models.auth import AuthenticatedUser
from app.models.note import LocalFileRequest, NoteRequest, NoteResponse, SummaryMode, TaskStatusResponse
from app.services.auth_service import get_current_user
from app.services.note_service import NoteService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notes"])
_note_service = NoteService()

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
    return {"task_id": run["id"], "status": run.get("status", "pending"), "message": "Task submitted to VILab Server"}


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    user_id = user.user_id if user else None
    status_data = _note_service.get_status(task_id, user_id=user_id)
    status = status_data.get("status", "not_found")
    message = status_data.get("message", "")
    result = None
    if status == "success":
        result_data = _note_service.get_result(task_id, user_id=user_id)
        if result_data:
            result = NoteResponse(
                task_id=task_id,
                title=result_data.get("title", ""),
                markdown=result_data.get("markdown", ""),
                duration=result_data.get("duration", 0),
                platform=result_data.get("platform", ""),
                video_id=result_data.get("video_id", ""),
                summary_mode=result_data.get("summary_mode", "default"),
            )
    return TaskStatusResponse(task_id=task_id, status=status, message=message, result=result)


@router.get("/task/{task_id}/artifacts/{asset_path:path}", include_in_schema=False)
def get_task_artifact(task_id: str, asset_path: str, user: AuthenticatedUser = Depends(get_current_user)):
    try:
        body, content_type = _note_service.get_artifact(task_id, asset_path, user_id=user.user_id if user else None)
    except Exception as exc:
        logger.error("[API] artifact proxy failed task_id=%s path=%s error=%s", task_id, asset_path, exc)
        raise HTTPException(status_code=404, detail="Artifact not found") from exc
    return Response(content=body, media_type=content_type)


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
    return {"task_id": run["id"], "status": run.get("status", "pending"), "message": "Task submitted to VILab Server"}


@router.post("/generate_from_upload", response_model=dict)
async def generate_from_upload(
    file: UploadFile = File(...),
    source_type: str = Form("media"),
    title: str | None = Form(None),
    style: str | None = Form("meeting"),
    summary_mode: str = Form("default"),
    extras: str | None = Form(None),
    output_language: str | None = Form(None),
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        normalized_source_type = _normalize_source_type(source_type)
        normalized_summary_mode = _normalize_summary_mode(summary_mode)
        normalized_output_language = _normalize_output_language(output_language)
        file_bytes = await file.read()

        if not file_bytes:
            raise ValueError("Uploaded file is empty.")

        task_id = str(uuid.uuid4())
        _ensure_transcript_extension(file.filename) if normalized_source_type == "transcript" else _ensure_media_extension(normalized_source_type, file.filename)
        upload_path = _build_upload_path(task_id, normalized_source_type, file.filename)
        upload_path.write_bytes(file_bytes)
        pipeline = "meeting_minutes" if (style or "meeting") == "meeting" else "media_summary"
        run = _note_service.submit_file(
            file_path=str(upload_path),
            source_type=normalized_source_type,
            pipeline=pipeline,
            title=title or Path(file.filename or upload_path.name).stem,
            style=style or "meeting",
            summary_mode=normalized_summary_mode,
            extras=extras,
            output_language=normalized_output_language,
            user_id=user.user_id if user else None,
        )
        return {"task_id": run["id"], "status": run.get("status", "pending"), "message": "Task submitted to VILab Server"}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[API] generate_from_upload failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
