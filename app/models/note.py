"""
Request and response models for note generation.
"""
from dataclasses import dataclass
from typing import Any, Literal, Optional

from pydantic import BaseModel

from app.models.audio import AudioDownloadResult
from app.models.transcript import TranscriptResult

OutputLanguage = Literal["en", "zh-CN"]
SummaryMode = Literal["default", "accurate", "oneshot"]


class NoteRequest(BaseModel):
    video_url: str
    style: Optional[str] = "detailed"
    summary_mode: SummaryMode = "default"
    extras: Optional[str] = None
    output_language: Optional[OutputLanguage] = None


class LocalFileRequest(BaseModel):
    file_path: str
    title: Optional[str] = None
    style: Optional[str] = "meeting"
    summary_mode: SummaryMode = "default"
    extras: Optional[str] = None
    output_language: Optional[OutputLanguage] = None


class NoteResponse(BaseModel):
    task_id: str
    title: str
    markdown: str
    duration: float
    platform: str
    video_id: str
    summary_mode: SummaryMode = "default"


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    message: str = ""
    result: Optional[NoteResponse] = None
    metadata: dict[str, Any] | None = None
    note_id: str | None = None


@dataclass
class NoteResult:
    markdown: str
    transcript: TranscriptResult
    audio_meta: AudioDownloadResult
    summary_mode: SummaryMode = "default"
    output_dir: str | None = None
