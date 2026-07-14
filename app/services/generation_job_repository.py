import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update

from app.db import session_scope
from app.db_models import GenerationJobDB, MeetingSessionDB, NoteDB, TeamMemberDB


@dataclass(frozen=True)
class GenerationJob:
    id: str
    user_id: str
    upstream_run_id: str
    status: str
    source_type: str
    title: str | None
    scope: str
    team_id: str | None
    metadata: dict[str, Any]
    error: dict[str, Any] | None
    result: dict[str, Any] | None
    note_id: str | None
    finalized_at: datetime | None


class GenerationJobRepository:
    def create(
        self,
        *,
        user_id: str,
        upstream_run_id: str,
        status: str,
        source_type: str,
        title: str | None,
        metadata: dict[str, Any] | None = None,
        scope: str = "personal",
        team_id: str | None = None,
        job_id: str | None = None,
    ) -> GenerationJob:
        with session_scope() as db:
            row = GenerationJobDB(
                id=job_id or str(uuid.uuid4()),
                user_id=user_id,
                upstream_run_id=upstream_run_id,
                status=status,
                source_type=source_type,
                title=title,
                scope=scope,
                team_id=team_id,
                metadata_json=_dump_json(metadata or {}),
            )
            db.add(row)
            db.flush()
            return self._to_job(row)

    def create_for_meeting_session(
        self,
        *,
        job_id: str,
        session_id: str,
        user_id: str,
        upstream_run_id: str,
        status: str,
        title: str,
        scope: str,
        team_id: str | None,
        metadata: dict[str, Any] | None = None,
    ) -> GenerationJob:
        with session_scope() as db:
            meeting = db.scalar(
                select(MeetingSessionDB).where(
                    MeetingSessionDB.id == session_id,
                    MeetingSessionDB.user_id == user_id,
                )
            )
            if meeting is None or meeting.generation_job_id is not None or meeting.status != "finalizing":
                raise ValueError("Meeting completion is not claimable")
            row = GenerationJobDB(
                id=job_id,
                user_id=user_id,
                upstream_run_id=upstream_run_id,
                status=status,
                source_type="meeting_recording",
                title=title,
                scope=scope,
                team_id=team_id,
                metadata_json=_dump_json(metadata or {}),
            )
            db.add(row)
            meeting.generation_job_id = job_id
            meeting.status = "offline_processing"
            db.flush()
            return self._to_job(row)

    def finalize_completed(
        self,
        job_id: str,
        user_id: str,
        structured_result: dict[str, Any],
    ) -> GenerationJob | None:
        with session_scope() as db:
            current = db.scalar(
                select(GenerationJobDB).where(
                    GenerationJobDB.id == job_id,
                    GenerationJobDB.user_id == user_id,
                )
            )
            if current is None:
                return None
            if current.note_id:
                return self._to_job(current)
            if current.scope == "team":
                membership = db.scalar(
                    select(TeamMemberDB.id).where(
                        TeamMemberDB.user_id == user_id,
                        TeamMemberDB.team_id == current.team_id,
                    )
                )
                if membership is None:
                    raise ValueError("Team not found or access denied")

            note_id = str(uuid.uuid4())
            finalized_at = datetime.now(timezone.utc)
            claimed = db.execute(
                update(GenerationJobDB)
                .where(
                    GenerationJobDB.id == job_id,
                    GenerationJobDB.user_id == user_id,
                    GenerationJobDB.note_id.is_(None),
                )
                .values(
                    status="success",
                    result_json=_dump_json(structured_result),
                    note_id=note_id,
                    finalized_at=finalized_at,
                )
            )
            if claimed.rowcount == 1:
                summary = structured_result.get("summary") if isinstance(structured_result.get("summary"), dict) else {}
                title = structured_result.get("title") or summary.get("title") or current.title or "Meeting note"
                db.add(
                    NoteDB(
                        id=note_id,
                        title=str(title).strip() or "Meeting note",
                        content=str(structured_result.get("markdown") or ""),
                        structured_json=_dump_json(structured_result),
                        source_type=current.source_type,
                        task_id=current.id,
                        status="done",
                        scope=current.scope,
                        team_id=current.team_id if current.scope == "team" else None,
                        created_by=user_id,
                    )
                )
                db.flush()
            row = db.scalar(select(GenerationJobDB).where(GenerationJobDB.id == job_id))
            return self._to_job(row) if row else None

    def get_owned(self, job_id: str, user_id: str) -> GenerationJob | None:
        with session_scope() as db:
            row = db.scalar(
                select(GenerationJobDB).where(
                    GenerationJobDB.id == job_id,
                    GenerationJobDB.user_id == user_id,
                )
            )
            return self._to_job(row) if row else None

    def get_accessible(self, job_id: str, user_id: str) -> GenerationJob | None:
        with session_scope() as db:
            row = db.scalar(select(GenerationJobDB).where(GenerationJobDB.id == job_id))
            if row is None:
                return None
            if row.scope == "personal":
                return self._to_job(row) if row.user_id == user_id else None
            membership = db.scalar(
                select(TeamMemberDB.id).where(
                    TeamMemberDB.user_id == user_id,
                    TeamMemberDB.team_id == row.team_id,
                )
            )
            return self._to_job(row) if membership is not None else None

    def update_snapshot(
        self,
        job_id: str,
        user_id: str,
        *,
        status: str,
        metadata: dict[str, Any],
        error: dict[str, Any] | None,
    ) -> GenerationJob | None:
        with session_scope() as db:
            row = db.scalar(
                select(GenerationJobDB).where(
                    GenerationJobDB.id == job_id,
                    GenerationJobDB.user_id == user_id,
                )
            )
            if row is None:
                return None
            row.status = status
            row.metadata_json = _dump_json(metadata)
            row.error_json = _dump_json(error) if error else None
            db.flush()
            return self._to_job(row)

    @staticmethod
    def _to_job(row: GenerationJobDB) -> GenerationJob:
        return GenerationJob(
            id=row.id,
            user_id=row.user_id,
            upstream_run_id=row.upstream_run_id,
            status=row.status,
            source_type=row.source_type,
            title=row.title,
            scope=row.scope,
            team_id=row.team_id,
            metadata=_load_object(row.metadata_json),
            error=_load_optional_object(row.error_json),
            result=_load_optional_object(row.result_json),
            note_id=row.note_id,
            finalized_at=row.finalized_at,
        )


def _dump_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _load_object(value: str | None) -> dict[str, Any]:
    loaded = _load_optional_object(value)
    return loaded or {}


def _load_optional_object(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        loaded = json.loads(value)
    except (TypeError, ValueError):
        return None
    return loaded if isinstance(loaded, dict) else None
