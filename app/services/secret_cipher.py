import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.config import settings


class SecretCipher:
    def __init__(self, key: str | None = None):
        self._fernet: Optional[Fernet] = None
        secret = key if key is not None else settings.model_profile_encryption_key
        if secret:
            digest = hashlib.sha256(secret.encode("utf-8")).digest()
            self._fernet = Fernet(base64.urlsafe_b64encode(digest))

    def _require_encryption(self):
        if not self._fernet:
            raise HTTPException(status_code=500, detail="MODEL_PROFILE_ENCRYPTION_KEY is not configured")

    def encrypt(self, value: str) -> str:
        self._require_encryption()
        return self._fernet.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt(self, value: str) -> str:
        self._require_encryption()
        return self._fernet.decrypt(value.encode("utf-8")).decode("utf-8")


class PlainSecretCipher(SecretCipher):
    def __init__(self):
        pass

    def encrypt(self, value: str) -> str:
        return f"plain:{value}"

    def decrypt(self, value: str) -> str:
        return value.removeprefix("plain:")


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:4]}••••{value[-4:]}"
