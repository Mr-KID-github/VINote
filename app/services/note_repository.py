import secrets
from datetime import datetime, timezone

from sqlalchemy import desc, select

from app.db import session_scope
from app.db_models import NoteDB, TeamDB, TeamMemberDB
from app.models.note_library import (
    NoteCreateRequest,
    NoteRecordResponse,
    NoteShareRecord,
    NoteUpdateRequest,
    PublicSharedNoteResponse,
)


class NoteRepository:
    @staticmethod
    def _to_response(record: NoteDB, *, team_name: str | None = None) -> NoteRecordResponse:
        return NoteRecordResponse(
            id=record.id,
            title=record.title,
            content=record.content,
            video_url=record.video_url,
            source_type=record.source_type,
            task_id=record.task_id,
            status=record.status,
            scope=record.scope,
            team_id=record.team_id,
            team_name=team_name,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @staticmethod
    def _to_share_record(record: NoteDB) -> NoteShareRecord:
        return NoteShareRecord(
            note_id=record.id,
            title=record.title,
            share_enabled=record.share_enabled,
            share_token=record.share_token,
            share_created_at=record.share_created_at,
        )

    @staticmethod
    def _get_team_name(db, team_id: str | None) -> str | None:
        if not team_id:
            return None
        return db.scalar(select(TeamDB.name).where(TeamDB.id == team_id))

    @staticmethod
    def _is_team_member(db, *, user_id: str, team_id: str | None) -> bool:
        if not team_id:
            return False
        membership = db.scalar(
            select(TeamMemberDB.id).where(TeamMemberDB.user_id == user_id, TeamMemberDB.team_id == team_id)
        )
        return membership is not None

    def _get_accessible_record(self, db, *, user_id: str, note_id: str) -> NoteDB | None:
        record = db.get(NoteDB, note_id)
        if not record:
            return None
        if record.scope == "personal":
            return record if record.created_by == user_id else None
        if record.scope == "team" and self._is_team_member(db, user_id=user_id, team_id=record.team_id):
            return record
        return None

    def list_notes(self, user_id: str, *, scope: str = "personal", team_id: str | None = None) -> list[NoteRecordResponse]:
        with session_scope() as db:
            statement = select(NoteDB)
            if scope == "team":
                if not team_id or not self._is_team_member(db, user_id=user_id, team_id=team_id):
                    return []
                statement = statement.where(NoteDB.scope == "team", NoteDB.team_id == team_id)
            else:
                statement = statement.where(NoteDB.scope == "personal", NoteDB.created_by == user_id)

            rows = db.scalars(statement.order_by(desc(NoteDB.created_at))).all()
            return [self._to_response(row, team_name=self._get_team_name(db, row.team_id)) for row in rows]

    def get_note(self, user_id: str, note_id: str) -> NoteRecordResponse | None:
        with session_scope() as db:
            row = self._get_accessible_record(db, user_id=user_id, note_id=note_id)
            return self._to_response(row, team_name=self._get_team_name(db, row.team_id)) if row else None

    def create_note(self, user_id: str, payload: NoteCreateRequest) -> NoteRecordResponse:
        with session_scope() as db:
            scope = payload.scope or "personal"
            team_id = None
            if scope == "team":
                if not payload.team_id or not self._is_team_member(db, user_id=user_id, team_id=payload.team_id):
                    raise ValueError("Team not found or access denied")
                team_id = payload.team_id

            record = NoteDB(
                title=payload.title.strip(),
                content=payload.content,
                video_url=payload.video_url,
                source_type=payload.source_type,
                task_id=payload.task_id,
                status=payload.status,
                scope=scope,
                team_id=team_id,
                created_by=user_id,
            )
            db.add(record)
            db.flush()
            return self._to_response(record, team_name=self._get_team_name(db, record.team_id))

    def update_note(self, user_id: str, note_id: str, payload: NoteUpdateRequest) -> NoteRecordResponse | None:
        with session_scope() as db:
            record = self._get_accessible_record(db, user_id=user_id, note_id=note_id)
            if not record:
                return None
            record.title = payload.title.strip()
            record.content = payload.content
            db.flush()
            return self._to_response(record, team_name=self._get_team_name(db, record.team_id))

    def delete_note(self, user_id: str, note_id: str) -> bool:
        with session_scope() as db:
            record = self._get_accessible_record(db, user_id=user_id, note_id=note_id)
            if not record:
                return False
            db.delete(record)
            return True

    def get_share(self, user_id: str, note_id: str) -> NoteShareRecord | None:
        with session_scope() as db:
            record = self._get_accessible_record(db, user_id=user_id, note_id=note_id)
            return self._to_share_record(record) if record else None

    def enable_share(self, user_id: str, note_id: str) -> NoteShareRecord | None:
        with session_scope() as db:
            record = self._get_accessible_record(db, user_id=user_id, note_id=note_id)
            if not record:
                return None

            if not record.share_token:
                record.share_token = self._generate_share_token(db)

            record.share_enabled = True
            record.share_created_at = record.share_created_at or datetime.now(timezone.utc)
            db.flush()
            return self._to_share_record(record)

    def disable_share(self, user_id: str, note_id: str) -> NoteShareRecord | None:
        with session_scope() as db:
            record = self._get_accessible_record(db, user_id=user_id, note_id=note_id)
            if not record:
                return None

            record.share_enabled = False
            db.flush()
            return self._to_share_record(record)

    def get_shared_note(self, share_token: str) -> PublicSharedNoteResponse | None:
        with session_scope() as db:
            record = db.scalar(
                select(NoteDB).where(NoteDB.share_token == share_token, NoteDB.share_enabled.is_(True))
            )
            if not record:
                return None
            return PublicSharedNoteResponse(
                title=record.title,
                content=record.content,
                video_url=record.video_url,
                source_type=record.source_type,
                created_at=record.created_at,
                updated_at=record.updated_at,
                share_created_at=record.share_created_at,
            )

    @staticmethod
    def _generate_share_token(db) -> str:
        while True:
            token = secrets.token_urlsafe(18)
            existing = db.scalar(select(NoteDB.id).where(NoteDB.share_token == token))
            if not existing:
                return token
