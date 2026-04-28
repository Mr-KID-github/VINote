import secrets
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.services.api_key_repository import APIKeyRepository

_bearer = HTTPBearer(auto_error=False)
_api_key_repository = APIKeyRepository()


@dataclass(slots=True)
class ExternalAPIPrincipal:
    user_id: str | None
    source: str


def require_external_api_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> ExternalAPIPrincipal:
    provided_keys: list[str] = []
    if credentials:
        provided_keys.append(credentials.credentials)
    header_key = request.headers.get("X-API-Key")
    if header_key:
        provided_keys.append(header_key)

    for api_key in provided_keys:
        record = _api_key_repository.authenticate_key(api_key)
        if record:
            return ExternalAPIPrincipal(user_id=record.user_id, source="user")

    configured_key = settings.external_api_key
    if configured_key and any(secrets.compare_digest(key, configured_key) for key in provided_keys):
        return ExternalAPIPrincipal(user_id=settings.external_api_user_id or None, source="env")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid external API key",
        headers={"WWW-Authenticate": "Bearer"},
    )
