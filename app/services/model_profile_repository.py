import base64
import hashlib
import logging
from typing import Any, Optional

from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import desc, select

from app.db import session_scope
from app.db_models import ModelProfileDB
from app.models.model_profile import (
    OLLAMA_API_KEY_PLACEHOLDER,
    ModelProfileCreateRequest,
    ModelProfileRecord,
    ModelProfileResponse,
    ModelProfileUpdateRequest,
)

logger = logging.getLogger(__name__)


class ModelProfileRepository:
    def __init__(self):
        self._fernet: Optional[Fernet] = None
        from app.config import settings

        if settings.model_profile_encryption_key:
            digest = hashlib.sha256(settings.model_profile_encryption_key.encode("utf-8")).digest()
            self._fernet = Fernet(base64.urlsafe_b64encode(digest))

    def _require_encryption(self):
        if not self._fernet:
            raise HTTPException(status_code=500, detail="MODEL_PROFILE_ENCRYPTION_KEY is not configured")

    def _encrypt(self, value: str) -> str:
        self._require_encryption()
        return self._fernet.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt_api_key(self, value: str) -> str:
        self._require_encryption()
        return self._fernet.decrypt(value.encode("utf-8")).decode("utf-8")

    def get_record_api_key(self, record: ModelProfileRecord) -> str:
        if record.provider == "ollama":
            return OLLAMA_API_KEY_PLACEHOLDER
        return self.decrypt_api_key(record.api_key_encrypted)

    def _store_api_key(self, provider: str, value: str) -> str:
        if provider == "ollama":
            return OLLAMA_API_KEY_PLACEHOLDER
        return self._encrypt(value)

    @staticmethod
    def mask_api_key(api_key: str) -> str:
        if len(api_key) <= 8:
            return "*" * len(api_key)
        return f"{api_key[:4]}****{api_key[-4:]}"

    @classmethod
    def _api_key_hint(cls, provider: str, api_key: str) -> str:
        if provider == "ollama":
            return ""
        return cls.mask_api_key(api_key)

    @staticmethod
    def to_response(record: ModelProfileRecord, api_key_hint: str) -> ModelProfileResponse:
        return ModelProfileResponse(
            id=record.id,
            name=record.name,
            provider=record.provider,
            base_url=record.base_url,
            model_name=record.model_name,
            api_key_hint=api_key_hint,
            is_default=record.is_default,
            is_active=record.is_active,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )

    @staticmethod
    def _to_record(row: ModelProfileDB) -> ModelProfileRecord:
        return ModelProfileRecord(
            id=row.id,
            user_id=row.user_id,
            name=row.name,
            provider=row.provider,
            base_url=row.base_url,
            model_name=row.model_name,
            api_key_encrypted=row.api_key_encrypted,
            is_default=row.is_default,
            is_active=row.is_active,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def list_profiles(self, user_id: str) -> list[ModelProfileResponse]:
        with session_scope() as db:
            rows = db.scalars(
                select(ModelProfileDB).where(ModelProfileDB.user_id == user_id).order_by(desc(ModelProfileDB.updated_at))
            ).all()
        return [
            self.to_response(record, self._api_key_hint(record.provider, self.get_record_api_key(record)))
            for record in (self._to_record(row) for row in rows)
        ]

    def clear_default(self, user_id: str):
        with session_scope() as db:
            rows = db.scalars(select(ModelProfileDB).where(ModelProfileDB.user_id == user_id)).all()
            for row in rows:
                row.is_default = False

    def create_profile(self, user_id: str, payload: ModelProfileCreateRequest) -> ModelProfileResponse:
        with session_scope() as db:
            if payload.is_default:
                rows = db.scalars(select(ModelProfileDB).where(ModelProfileDB.user_id == user_id)).all()
                for row in rows:
                    row.is_default = False

            record = ModelProfileDB(
                user_id=user_id,
                name=payload.name.strip(),
                provider=payload.provider,
                base_url=payload.base_url.strip(),
                model_name=payload.model_name.strip(),
                api_key_encrypted=self._store_api_key(payload.provider, payload.api_key.strip()),
                is_default=payload.is_default,
                is_active=payload.is_active,
            )
            db.add(record)
            db.flush()
            return self.to_response(
                self._to_record(record),
                self._api_key_hint(payload.provider, payload.api_key.strip()),
            )

    def get_profile_record(self, user_id: str, profile_id: str) -> ModelProfileRecord:
        with session_scope() as db:
            row = db.scalar(
                select(ModelProfileDB).where(ModelProfileDB.id == profile_id, ModelProfileDB.user_id == user_id)
            )
            if not row:
                raise HTTPException(status_code=404, detail="Model profile not found")
            return self._to_record(row)

    def update_profile(
        self,
        user_id: str,
        profile_id: str,
        payload: ModelProfileUpdateRequest,
    ) -> ModelProfileResponse:
        current = self.get_profile_record(user_id, profile_id)
        with session_scope() as db:
            row = db.scalar(
                select(ModelProfileDB).where(ModelProfileDB.id == profile_id, ModelProfileDB.user_id == user_id)
            )
            if not row:
                raise HTTPException(status_code=404, detail="Model profile not found")

            if payload.is_default:
                rows = db.scalars(select(ModelProfileDB).where(ModelProfileDB.user_id == user_id)).all()
                for item in rows:
                    item.is_default = False

            if payload.name is not None:
                row.name = payload.name.strip()
            if payload.provider is not None:
                row.provider = payload.provider
            if payload.base_url is not None:
                row.base_url = payload.base_url.strip()
            if payload.model_name is not None:
                row.model_name = payload.model_name.strip()
            if payload.api_key is not None:
                row.api_key_encrypted = self._store_api_key(row.provider, payload.api_key.strip())
            if payload.is_default is not None:
                row.is_default = payload.is_default
            if payload.is_active is not None:
                row.is_active = payload.is_active

            db.flush()
            record = self._to_record(row)
            api_key = payload.api_key.strip() if payload.api_key else self.get_record_api_key(record)
            return self.to_response(record, self._api_key_hint(record.provider, api_key))

    def delete_profile(self, user_id: str, profile_id: str) -> ModelProfileRecord:
        with session_scope() as db:
            row = db.scalar(
                select(ModelProfileDB).where(ModelProfileDB.id == profile_id, ModelProfileDB.user_id == user_id)
            )
            if not row:
                raise HTTPException(status_code=404, detail="Model profile not found")
            current = self._to_record(row)
            db.delete(row)
            return current

    def set_default_profile(self, user_id: str, profile_id: str) -> ModelProfileResponse:
        with session_scope() as db:
            rows = db.scalars(select(ModelProfileDB).where(ModelProfileDB.user_id == user_id)).all()
            target: ModelProfileDB | None = None
            for row in rows:
                row.is_default = row.id == profile_id
                if row.id == profile_id:
                    target = row

            if not target:
                raise HTTPException(status_code=404, detail="Model profile not found")

            db.flush()
            record = self._to_record(target)
            return self.to_response(record, self._api_key_hint(record.provider, self.get_record_api_key(record)))

    def get_default_profile(self, user_id: str) -> Optional[ModelProfileRecord]:
        with session_scope() as db:
            row = db.scalar(
                select(ModelProfileDB).where(
                    ModelProfileDB.user_id == user_id,
                    ModelProfileDB.is_default.is_(True),
                    ModelProfileDB.is_active.is_(True),
                )
            )
            return self._to_record(row) if row else None

    def get_latest_active_profile(self, user_id: str) -> Optional[ModelProfileRecord]:
        with session_scope() as db:
            row = db.scalar(
                select(ModelProfileDB)
                .where(ModelProfileDB.user_id == user_id, ModelProfileDB.is_active.is_(True))
                .order_by(desc(ModelProfileDB.updated_at))
            )
            return self._to_record(row) if row else None
