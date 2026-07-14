from dataclasses import dataclass
import uuid

from sqlalchemy import select, update

from app.db import session_scope
from app.db_models import GenerationJobDB, MeetingSessionDB


@dataclass(frozen=True)
class MeetingSession:
    id: str
    user_id: str
    status: str
    connection_id: str | None
    upstream_session_id: str | None
    generation_job_id: str | None


class MeetingSessionRepository:
    def create(self, user_id: str) -> MeetingSession:
        with session_scope() as db:
            row = MeetingSessionDB(user_id=user_id, status="created")
            db.add(row)
            db.flush()
            return self._to_session(row)

    def get_owned(self, session_id: str, user_id: str) -> MeetingSession | None:
        with session_scope() as db:
            row = db.scalar(
                select(MeetingSessionDB).where(
                    MeetingSessionDB.id == session_id,
                    MeetingSessionDB.user_id == user_id,
                )
            )
            return self._to_session(row) if row else None

    def claim_realtime(self, session_id: str, user_id: str) -> str | None:
        connection_id = str(uuid.uuid4())
        with session_scope() as db:
            claimed = db.execute(
                update(MeetingSessionDB)
                .where(
                    MeetingSessionDB.id == session_id,
                    MeetingSessionDB.user_id == user_id,
                    MeetingSessionDB.status.in_(("created", "closed", "failed")),
                )
                .values(
                    status="connecting",
                    connection_id=connection_id,
                    upstream_session_id=None,
                )
            )
            return connection_id if claimed.rowcount == 1 else None

    def update_connection(
        self,
        session_id: str,
        user_id: str,
        connection_id: str,
        *,
        status: str,
        upstream_session_id: str | None = None,
    ) -> bool:
        values: dict[str, str | None] = {"status": status}
        if upstream_session_id is not None:
            values["upstream_session_id"] = upstream_session_id
        with session_scope() as db:
            changed = db.execute(
                update(MeetingSessionDB)
                .where(
                    MeetingSessionDB.id == session_id,
                    MeetingSessionDB.user_id == user_id,
                    MeetingSessionDB.connection_id == connection_id,
                    MeetingSessionDB.status.not_in(("finalizing", "offline_processing")),
                )
                .values(**values)
            )
            return changed.rowcount == 1

    def claim_completion(self, session_id: str, user_id: str) -> bool:
        with session_scope() as db:
            claimed = db.execute(
                update(MeetingSessionDB)
                .where(
                    MeetingSessionDB.id == session_id,
                    MeetingSessionDB.user_id == user_id,
                    MeetingSessionDB.generation_job_id.is_(None),
                    MeetingSessionDB.status.not_in(("finalizing", "offline_processing")),
                )
                .values(status="finalizing")
            )
            return claimed.rowcount == 1

    def claim_failed_retry(self, session_id: str, user_id: str, job_id: str) -> bool:
        with session_scope() as db:
            failed_job = db.scalar(
                select(GenerationJobDB.id).where(
                    GenerationJobDB.id == job_id,
                    GenerationJobDB.user_id == user_id,
                    GenerationJobDB.status == "failed",
                )
            )
            if failed_job is None:
                return False
            claimed = db.execute(
                update(MeetingSessionDB)
                .where(
                    MeetingSessionDB.id == session_id,
                    MeetingSessionDB.user_id == user_id,
                    MeetingSessionDB.generation_job_id == job_id,
                    MeetingSessionDB.status == "offline_processing",
                )
                .values(status="finalizing", generation_job_id=None)
            )
            return claimed.rowcount == 1

    def mark_completion_failed(self, session_id: str, user_id: str) -> None:
        with session_scope() as db:
            db.execute(
                update(MeetingSessionDB)
                .where(
                    MeetingSessionDB.id == session_id,
                    MeetingSessionDB.user_id == user_id,
                    MeetingSessionDB.generation_job_id.is_(None),
                    MeetingSessionDB.status == "finalizing",
                )
                .values(status="completion_failed")
            )

    @staticmethod
    def _to_session(row: MeetingSessionDB) -> MeetingSession:
        return MeetingSession(
            id=row.id,
            user_id=row.user_id,
            status=row.status,
            connection_id=row.connection_id,
            upstream_session_id=row.upstream_session_id,
            generation_job_id=row.generation_job_id,
        )
