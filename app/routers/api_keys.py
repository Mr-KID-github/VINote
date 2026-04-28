from fastapi import APIRouter, Depends, Response, status

from app.models.api_key import APIKeyCreateRequest, APIKeyCreateResponse, APIKeyResponse
from app.models.auth import AuthenticatedUser
from app.services.api_key_service import APIKeyService
from app.services.auth_service import get_current_user

router = APIRouter(tags=["api-keys"])
_service = APIKeyService()


@router.get("/api-keys", response_model=list[APIKeyResponse])
def list_api_keys(user: AuthenticatedUser = Depends(get_current_user)):
    return _service.list_keys(user.user_id)


@router.post("/api-keys", response_model=APIKeyCreateResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(payload: APIKeyCreateRequest, user: AuthenticatedUser = Depends(get_current_user)):
    return _service.create_key(user.user_id, payload)


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(key_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    _service.revoke_key(user.user_id, key_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
