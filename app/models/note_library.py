from datetime import datetime

from pydantic import BaseModel, Field


class NoteRecordResponse(BaseModel):
    id: str
    title: str
    content: str
    video_url: str | None = None
    source_type: str | None = None
    task_id: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class NoteCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = ""
    video_url: str | None = None
    source_type: str | None = None
    task_id: str | None = None
    status: str = "done"


class NoteUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = ""
    status: str | None = None


class NoteShareRecord(BaseModel):
    note_id: str
    title: str
    share_enabled: bool
    share_token: str | None = None
    share_created_at: datetime | None = None


class NoteShareResponse(NoteShareRecord):
    share_url: str | None = None


class PublicSharedNoteResponse(BaseModel):
    title: str
    content: str
    video_url: str | None = None
    source_type: str | None = None
    created_at: datetime
    updated_at: datetime
    share_created_at: datetime | None = None
