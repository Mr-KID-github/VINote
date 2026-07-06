from fastapi import APIRouter, Depends, Response, status

from app.models.auth import AuthenticatedUser
from app.models.vilab_server import VILabServerConnectionRequest
from app.services.auth_service import get_current_user
from app.services.vilab_server_connection_service import VILabServerConnectionService

router = APIRouter(prefix="/vilab-server", tags=["vilab-server"])
_service = VILabServerConnectionService()


@router.get("/connection")
def get_connection(user: AuthenticatedUser = Depends(get_current_user)):
    return _service.get_connection(user.user_id)


@router.put("/connection")
def save_connection(payload: VILabServerConnectionRequest, user: AuthenticatedUser = Depends(get_current_user)):
    return _service.save_connection(user.user_id, payload)


@router.post("/connection/test")
def test_connection(payload: VILabServerConnectionRequest | None = None, user: AuthenticatedUser = Depends(get_current_user)):
    return _service.test_connection(user.user_id, payload)


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(user: AuthenticatedUser = Depends(get_current_user)):
    _service.delete_connection(user.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/models")
def list_models(user: AuthenticatedUser = Depends(get_current_user)):
    return _service.list_models(user.user_id)
