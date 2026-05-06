import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import settings
from app.models.note import NoteRequest, NoteResponse, TaskStatusResponse
from app.routers import note as note_router
from app.services.external_api_auth_service import ExternalAPIPrincipal, require_external_api_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["external-api"])


def _external_user_id(principal: ExternalAPIPrincipal) -> str | None:
    return principal.user_id or settings.external_api_user_id or None


def _ensure_profile_selection_supported(
    *,
    principal: ExternalAPIPrincipal,
    model_profile_id: str | None,
    stt_profile_id: str | None,
) -> None:
    if _external_user_id(principal):
        return
    if model_profile_id or stt_profile_id:
        raise HTTPException(
            status_code=400,
            detail="EXTERNAL_API_USER_ID is required when using model_profile_id or stt_profile_id",
        )


def _build_note_response(task_id: str, result) -> NoteResponse:
    return NoteResponse(
        task_id=task_id,
        title=result.audio_meta.title,
        markdown=result.markdown,
        duration=result.audio_meta.duration,
        platform=result.audio_meta.platform,
        video_id=result.audio_meta.video_id,
        summary_mode=result.summary_mode,
    )


def _prepare_external_task(task_id: str, principal: ExternalAPIPrincipal) -> None:
    task_dir = note_router._note_service.artifact_service.create_task_dir(task_id)
    note_router._note_service.artifact_service.save_task_owner(task_dir, _external_user_id(principal))
    note_router._note_service.artifact_service.update_status(task_dir, "pending", "Task submitted")


def _ensure_task_access(task_id: str, principal: ExternalAPIPrincipal) -> None:
    user_id = _external_user_id(principal)
    if not user_id:
        return

    owner_id = note_router._note_service.artifact_service.get_task_owner(task_id)
    if owner_id and owner_id == user_id:
        return
    if owner_id is None and principal.source == "env":
        return
    raise HTTPException(status_code=404, detail="Task not found")


@router.post("/generate", response_model=dict)
def generate_note_async(
    req: NoteRequest,
    background_tasks: BackgroundTasks,
    principal: ExternalAPIPrincipal = Depends(require_external_api_key),
):
    _ensure_profile_selection_supported(
        principal=principal,
        model_profile_id=req.model_profile_id,
        stt_profile_id=req.stt_profile_id,
    )
    task_id = str(uuid.uuid4())
    _prepare_external_task(task_id, principal)
    background_tasks.add_task(
        note_router._run_task,
        task_id=task_id,
        req=req,
        user_id=_external_user_id(principal),
    )
    return {"task_id": task_id, "status": "pending", "message": "Task submitted"}


@router.post("/generate_sync", response_model=NoteResponse)
def generate_note_sync(
    req: NoteRequest,
    principal: ExternalAPIPrincipal = Depends(require_external_api_key),
):
    _ensure_profile_selection_supported(
        principal=principal,
        model_profile_id=req.model_profile_id,
        stt_profile_id=req.stt_profile_id,
    )
    task_id = str(uuid.uuid4())
    try:
        result = note_router._note_service.generate(
            video_url=req.video_url,
            task_id=task_id,
            platform=req.platform,
            style=req.style or "detailed",
            summary_mode=req.summary_mode,
            extras=req.extras,
            output_language=req.output_language,
            model_profile_id=req.model_profile_id,
            stt_profile_id=req.stt_profile_id,
            model_name=req.model_name,
            api_key=req.api_key,
            base_url=req.base_url,
            user_id=_external_user_id(principal),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[External API] generate_sync failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _build_note_response(task_id, result)


@router.post("/generate_from_upload", response_model=dict)
async def generate_from_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source_type: str = Form("media"),
    title: str | None = Form(None),
    style: str | None = Form("meeting"),
    summary_mode: str = Form("default"),
    extras: str | None = Form(None),
    output_language: str | None = Form(None),
    model_profile_id: str | None = Form(None),
    stt_profile_id: str | None = Form(None),
    model_name: str | None = Form(None),
    api_key: str | None = Form(None),
    base_url: str | None = Form(None),
    principal: ExternalAPIPrincipal = Depends(require_external_api_key),
):
    _ensure_profile_selection_supported(
        principal=principal,
        model_profile_id=model_profile_id,
        stt_profile_id=stt_profile_id,
    )
    try:
        normalized_source_type = note_router._normalize_source_type(source_type)
        normalized_summary_mode = note_router._normalize_summary_mode(summary_mode)
        normalized_output_language = note_router._normalize_output_language(output_language)
        file_bytes = await file.read()

        if not file_bytes:
            raise ValueError("Uploaded file is empty.")

        task_id = str(uuid.uuid4())
        _prepare_external_task(task_id, principal)

        if normalized_source_type == "transcript":
            note_router._ensure_transcript_extension(file.filename)
            transcript = note_router._build_transcript_from_upload(file.filename, file_bytes)
            background_tasks.add_task(
                note_router._run_task_from_transcript,
                task_id=task_id,
                transcript=transcript,
                title=title or Path(file.filename or "transcript.txt").stem,
                style=style or "meeting",
                summary_mode=normalized_summary_mode,
                extras=extras,
                output_language=normalized_output_language,
                model_profile_id=model_profile_id,
                stt_profile_id=stt_profile_id,
                model_name=model_name,
                api_key=api_key,
                base_url=base_url,
                user_id=_external_user_id(principal),
            )
        else:
            note_router._ensure_media_extension(normalized_source_type, file.filename)
            upload_path = note_router._build_upload_path(task_id, normalized_source_type, file.filename)
            upload_path.write_bytes(file_bytes)
            req = note_router._build_note_request_fields(
                file_path=str(upload_path),
                title=title,
                style=style,
                summary_mode=normalized_summary_mode,
                extras=extras,
                output_language=normalized_output_language,
                model_profile_id=model_profile_id,
                stt_profile_id=stt_profile_id,
                model_name=model_name,
                api_key=api_key,
                base_url=base_url,
            )
            background_tasks.add_task(
                note_router._run_task_from_file,
                task_id=task_id,
                req=req,
                user_id=_external_user_id(principal),
            )
        return {"task_id": task_id, "status": "pending", "message": "Task submitted"}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[External API] generate_from_upload failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/generate_from_upload_sync", response_model=NoteResponse)
async def generate_from_upload_sync(
    file: UploadFile = File(...),
    source_type: str = Form("media"),
    title: str | None = Form(None),
    style: str | None = Form("meeting"),
    summary_mode: str = Form("default"),
    extras: str | None = Form(None),
    output_language: str | None = Form(None),
    model_profile_id: str | None = Form(None),
    stt_profile_id: str | None = Form(None),
    model_name: str | None = Form(None),
    api_key: str | None = Form(None),
    base_url: str | None = Form(None),
    principal: ExternalAPIPrincipal = Depends(require_external_api_key),
):
    _ensure_profile_selection_supported(
        principal=principal,
        model_profile_id=model_profile_id,
        stt_profile_id=stt_profile_id,
    )
    task_id = str(uuid.uuid4())
    try:
        normalized_source_type = note_router._normalize_source_type(source_type)
        normalized_summary_mode = note_router._normalize_summary_mode(summary_mode)
        normalized_output_language = note_router._normalize_output_language(output_language)
        file_bytes = await file.read()

        if not file_bytes:
            raise ValueError("Uploaded file is empty.")

        if normalized_source_type == "transcript":
            note_router._ensure_transcript_extension(file.filename)
            transcript = note_router._build_transcript_from_upload(file.filename, file_bytes)
            result = note_router._note_service.generate_from_transcript(
                transcript=transcript,
                task_id=task_id,
                title=title or Path(file.filename or "transcript.txt").stem,
                style=style or "meeting",
                summary_mode=normalized_summary_mode,
                extras=extras,
                output_language=normalized_output_language,
                model_profile_id=model_profile_id,
                stt_profile_id=stt_profile_id,
                model_name=model_name,
                api_key=api_key,
                base_url=base_url,
                user_id=_external_user_id(principal),
            )
        else:
            note_router._ensure_media_extension(normalized_source_type, file.filename)
            upload_path = note_router._build_upload_path(task_id, normalized_source_type, file.filename)
            upload_path.write_bytes(file_bytes)
            req = note_router._build_note_request_fields(
                file_path=str(upload_path),
                title=title,
                style=style,
                summary_mode=normalized_summary_mode,
                extras=extras,
                output_language=normalized_output_language,
                model_profile_id=model_profile_id,
                stt_profile_id=stt_profile_id,
                model_name=model_name,
                api_key=api_key,
                base_url=base_url,
            )
            result = note_router._note_service.generate_from_file(
                file_path=req.file_path,
                task_id=task_id,
                title=req.title,
                style=req.style or "meeting",
                summary_mode=req.summary_mode,
                extras=req.extras,
                output_language=req.output_language,
                model_profile_id=req.model_profile_id,
                stt_profile_id=req.stt_profile_id,
                model_name=req.model_name,
                api_key=req.api_key,
                base_url=req.base_url,
                user_id=_external_user_id(principal),
            )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("[External API] generate_from_upload_sync failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _build_note_response(task_id, result)


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
def get_task_status(
    task_id: str,
    principal: ExternalAPIPrincipal = Depends(require_external_api_key),
):
    _ensure_task_access(task_id, principal)
    return note_router.get_task_status(task_id)


@router.get("/task/{task_id}/artifacts/{asset_path:path}", include_in_schema=False)
def get_task_artifact(
    task_id: str,
    asset_path: str,
    principal: ExternalAPIPrincipal = Depends(require_external_api_key),
):
    _ensure_task_access(task_id, principal)
    response = note_router.get_task_artifact(task_id, asset_path)
    if not isinstance(response, FileResponse):
        raise HTTPException(status_code=404, detail="Artifact not found")
    return response
