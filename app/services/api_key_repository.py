import hashlib
import secrets
from datetime import datetime, timezone

from sqlalchemy import desc, select

from app.db import session_scope
from app.db_models import APIKeyDB
from app.models.api_key import APIKeyCreateResponse, APIKeyRecord, APIKeyResponse

API_KEY_PREFIX = "vnt_"
API_KEY_HINT_LENGTH = 12


class APIKeyRepository:
    @staticmethod
    def hash_key(api_key: str) -> str:
        return hashlib.sha256(api_key.encode("utf-8")).hexdigest()

    @staticmethod
    def generate_key() -> str:
        return f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"

    @staticmethod
    def _to_response(row: APIKeyDB) -> APIKeyResponse:
        return APIKeyResponse(
            id=row.id,
            name=row.name,
            key_prefix=row.key_prefix,
            last_used_at=row.last_used_at,
            created_at=row.created_at,
            revoked_at=row.revoked_at,
        )

    @staticmethod
    def _to_record(row: APIKeyDB) -> APIKeyRecord:
        return APIKeyRecord(
            id=row.id,
            user_id=row.user_id,
            name=row.name,
            key_prefix=row.key_prefix,
            key_hash=row.key_hash,
            last_used_at=row.last_used_at,
            created_at=row.created_at,
            revoked_at=row.revoked_at,
        )

    def list_keys(self, user_id: str) -> list[APIKeyResponse]:
        with session_scope() as db:
            rows = db.scalars(
                select(APIKeyDB)
                .where(APIKeyDB.user_id == user_id, APIKeyDB.revoked_at.is_(None))
                .order_by(desc(APIKeyDB.created_at))
            ).all()
            return [self._to_response(row) for row in rows]

    def create_key(self, user_id: str, name: str) -> APIKeyCreateResponse:
        clean_name = name.strip()
        plain_key = self.generate_key()
        row = APIKeyDB(
            user_id=user_id,
            name=clean_name,
            key_prefix=plain_key[:API_KEY_HINT_LENGTH],
            key_hash=self.hash_key(plain_key),
        )
        with session_scope() as db:
            db.add(row)
            db.flush()
            response = self._to_response(row)
            return APIKeyCreateResponse(**response.model_dump(), api_key=plain_key)

    def revoke_key(self, user_id: str, key_id: str) -> bool:
        with session_scope() as db:
            row = db.scalar(
                select(APIKeyDB).where(
                    APIKeyDB.id == key_id,
                    APIKeyDB.user_id == user_id,
                    APIKeyDB.revoked_at.is_(None),
                )
            )
            if not row:
                return False
            row.revoked_at = datetime.now(timezone.utc)
            return True

    def authenticate_key(self, api_key: str) -> APIKeyRecord | None:
        key_hash = self.hash_key(api_key)
        with session_scope() as db:
            row = db.scalar(
                select(APIKeyDB).where(
                    APIKeyDB.key_hash == key_hash,
                    APIKeyDB.revoked_at.is_(None),
                )
            )
            if not row:
                return None
            row.last_used_at = datetime.now(timezone.utc)
            db.flush()
            return self._to_record(row)
