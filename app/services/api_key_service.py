from fastapi import HTTPException, status

from app.models.api_key import APIKeyCreateRequest, APIKeyCreateResponse, APIKeyResponse
from app.services.api_key_repository import APIKeyRepository


class APIKeyService:
    def __init__(self, repository: APIKeyRepository | None = None):
        self.repository = repository or APIKeyRepository()

    def list_keys(self, user_id: str) -> list[APIKeyResponse]:
        return self.repository.list_keys(user_id)

    def create_key(self, user_id: str, payload: APIKeyCreateRequest) -> APIKeyCreateResponse:
        return self.repository.create_key(user_id, payload.name)

    def revoke_key(self, user_id: str, key_id: str) -> None:
        if not self.repository.revoke_key(user_id, key_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
