import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.models.auth import AuthenticatedUser
from app.models.note_library import (
    NoteCreateRequest,
    NoteRecordResponse,
    NoteScope,
    NoteUpdateRequest,
    SpeakerAliasesResponse,
    SpeakerAliasesUpdateRequest,
)
from app.services.auth_service import get_current_user
from app.services.task_artifact_service import TaskArtifactService
from app.services.note_repository import NoteRepository
from app.services.generation_job_repository import GenerationJobRepository
from app.services.note_service import NoteService

router = APIRouter(tags=["notes-library"])
_repository = NoteRepository()
_artifact_service = TaskArtifactService()
_jobs = GenerationJobRepository()
_note_service = NoteService()


@router.get("/notes", response_model=list[NoteRecordResponse])
def list_notes(
    scope: NoteScope = Query(default="personal"),
    team_id: str | None = Query(default=None),
    user: AuthenticatedUser = Depends(get_current_user),
):
    return _repository.list_notes(user.user_id, scope=scope, team_id=team_id)


@router.get("/notes/{note_id}", response_model=NoteRecordResponse)
def get_note(note_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    note = _repository.get_note(user.user_id, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


@router.get("/notes/{note_id}/media", include_in_schema=False)
def get_note_media(note_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    note = _repository.get_note(user.user_id, note_id)
    if not note or not note.task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    task_dir = _artifact_service.find_task_dir(note.task_id)
    if not task_dir:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    declared_source = _artifact_service.resolve_source_media(task_dir)
    if declared_source:
        media_type = mimetypes.guess_type(declared_source.name)[0] or "application/octet-stream"
        return FileResponse(path=declared_source, media_type=media_type, filename=declared_source.name)

    media_dir = task_dir / "media"
    media_candidates = [
        path for path in sorted(media_dir.glob("*"))
        if path.is_file()
        and path.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov", ".mp3", ".m4a", ".wav", ".ogg"}
        and ".vilab." not in path.name
    ]
    expects_video = note.source_type == "video" or bool(note.video_url)
    source_stem = "source_video" if expects_video else "source_audio"
    preferred_suffixes = {".mp4", ".mkv", ".webm", ".mov"} if expects_video else {".mp3", ".m4a", ".wav", ".ogg", ".webm"}
    preferred_media = next(
        (path for path in media_candidates if path.stem == source_stem and path.suffix.lower() in preferred_suffixes),
        None,
    )
    if not preferred_media:
        preferred_media = next((path for path in media_candidates if path.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}), None)
    if not preferred_media:
        preferred_media = next(iter(media_candidates), None)
    if preferred_media:
        media_path = preferred_media.resolve()
    else:
        audio_meta = _artifact_service.load_audio_meta(task_dir)
        if not audio_meta:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
        media_path = Path(audio_meta.file_path).resolve()

    if not media_path.exists() or not media_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    media_type = mimetypes.guess_type(media_path.name)[0] or "application/octet-stream"
    return FileResponse(path=media_path, media_type=media_type, filename=media_path.name)


@router.get("/notes/{note_id}/pipeline", include_in_schema=False)
def get_note_pipeline(note_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    note = _repository.get_note(user.user_id, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    if not note.task_id:
        return {"stageRunIds": {}, "transcript": None, "summary": None, "note": None}
    job = _jobs.get_accessible(note.task_id, user.user_id)
    if not job:
        return {"stageRunIds": {}, "transcript": None, "summary": None, "note": None}
    trace = _note_service.get_pipeline_trace(job.upstream_run_id, user_id=user.user_id)
    aliases = _repository.get_speaker_aliases(user.user_id, note_id) or {}
    trace["speakerAliases"] = aliases
    transcript = trace.get("transcript")
    if isinstance(transcript, dict) and isinstance(transcript.get("turns"), list):
        transcript["turns"] = [
            {
                **turn,
                **({"speakerLabel": aliases[turn.get("speakerId")]} if turn.get("speakerId") in aliases else {}),
            }
            if isinstance(turn, dict)
            else turn
            for turn in transcript["turns"]
        ]
    return trace


@router.patch("/notes/{note_id}/speakers", response_model=SpeakerAliasesResponse, include_in_schema=False)
def update_note_speakers(
    note_id: str,
    payload: SpeakerAliasesUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        aliases = _repository.update_speaker_aliases(user.user_id, note_id, payload.aliases)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if aliases is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return {"aliases": aliases}


@router.post("/notes", response_model=NoteRecordResponse, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreateRequest, user: AuthenticatedUser = Depends(get_current_user)):
    try:
        return _repository.create_note(user.user_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/notes/{note_id}", response_model=NoteRecordResponse)
def update_note(note_id: str, payload: NoteUpdateRequest, user: AuthenticatedUser = Depends(get_current_user)):
    note = _repository.update_note(user.user_id, note_id, payload)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    deleted = _repository.delete_note(user.user_id, note_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
