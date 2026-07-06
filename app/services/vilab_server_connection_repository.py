from datetime import datetime, timezone

from sqlalchemy import select

from app.db import session_scope
from app.db_models import VILabServerConnectionDB
from app.models.vilab_server import (
    VILabServerConnectionRecord,
    VILabServerConnectionRequest,
    VILabServerConnectionResponse,
)
from app.services.secret_cipher import SecretCipher, mask_secret


def _now():
    return datetime.now(timezone.utc)


class VILabServerConnectionRepository:
    def __init__(self, cipher: SecretCipher | None = None):
        self.cipher = cipher or SecretCipher()

    def get_record(self, user_id: str) -> VILabServerConnectionRecord | None:
        with session_scope() as db:
            row = db.scalar(select(VILabServerConnectionDB).where(VILabServerConnectionDB.user_id == user_id))
            return self._to_record(row) if row else None

    def get_response(self, user_id: str) -> VILabServerConnectionResponse | None:
        record = self.get_record(user_id)
        if not record:
            return None
        return self.to_response(record)

    def upsert(self, user_id: str, payload: VILabServerConnectionRequest) -> VILabServerConnectionResponse:
        api_key = (payload.api_key or "").strip()
        with session_scope() as db:
            row = db.scalar(select(VILabServerConnectionDB).where(VILabServerConnectionDB.user_id == user_id))
            encrypted = self.cipher.encrypt(api_key) if api_key else ""
            if row is None:
                row = VILabServerConnectionDB(
                    user_id=user_id,
                    mode=payload.mode,
                    base_url=payload.base_url.strip().rstrip("/"),
                    api_key_encrypted=encrypted,
                    status="untested",
                )
                db.add(row)
            else:
                row.mode = payload.mode
                row.base_url = payload.base_url.strip().rstrip("/")
                if payload.api_key is not None:
                    row.api_key_encrypted = encrypted
                row.status = "untested"
                row.version = None
                row.latency_ms = None
                row.checked_at = None
            db.flush()
            return self.to_response(self._to_record(row), api_key=api_key if payload.api_key is not None else None)

    def save_test_result(self, user_id: str, *, status: str, version: str | None, latency_ms: int | None):
        with session_scope() as db:
            row = db.scalar(select(VILabServerConnectionDB).where(VILabServerConnectionDB.user_id == user_id))
            if row:
                row.status = status
                row.version = version
                row.latency_ms = latency_ms
                row.checked_at = _now()

    def delete(self, user_id: str):
        with session_scope() as db:
            row = db.scalar(select(VILabServerConnectionDB).where(VILabServerConnectionDB.user_id == user_id))
            if row:
                db.delete(row)

    def decrypt_api_key(self, record: VILabServerConnectionRecord) -> str:
        return self.cipher.decrypt(record.api_key_encrypted) if record.api_key_encrypted else ""

    @staticmethod
    def _to_record(row: VILabServerConnectionDB) -> VILabServerConnectionRecord:
        return VILabServerConnectionRecord(
            id=row.id,
            user_id=row.user_id,
            mode=row.mode,  # type: ignore[arg-type]
            base_url=row.base_url,
            api_key_encrypted=row.api_key_encrypted,
            status=row.status,  # type: ignore[arg-type]
            version=row.version,
            latency_ms=row.latency_ms,
            checked_at=row.checked_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def to_response(self, record: VILabServerConnectionRecord, api_key: str | None = None) -> VILabServerConnectionResponse:
        plain = self.decrypt_api_key(record) if api_key is None else api_key
        return VILabServerConnectionResponse(
            mode=record.mode,
            base_url=record.base_url,
            api_key_hint=mask_secret(plain),
            status=record.status,
            version=record.version,
            latency_ms=record.latency_ms,
            checked_at=record.checked_at,
            using_env_fallback=False,
        )
