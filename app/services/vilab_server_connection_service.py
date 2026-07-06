import time
from typing import Any

from fastapi import HTTPException

from app.config import settings
from app.models.vilab_server import (
    VILabServerConnectionRequest,
    VILabServerConnectionResponse,
    VILabServerConnectionTestResponse,
)
from app.services.vilab_server_client import VILabServerClient, VILabServerClientError
from app.services.vilab_server_connection_repository import VILabServerConnectionRepository


class VILabServerConnectionService:
    def __init__(self, repository: VILabServerConnectionRepository | None = None, client_factory=None):
        self.repository = repository or VILabServerConnectionRepository()
        self.client_factory = client_factory or (lambda **kwargs: VILabServerClient(**kwargs))

    def get_connection(self, user_id: str) -> VILabServerConnectionResponse:
        saved = self.repository.get_response(user_id)
        if saved:
            return saved
        if settings.vilab_server_base_url:
            return VILabServerConnectionResponse(
                mode="local" if "127.0.0.1" in settings.vilab_server_base_url or "localhost" in settings.vilab_server_base_url else "remote",
                base_url=settings.vilab_server_base_url,
                api_key_hint="" if not settings.vilab_server_api_key else "••••",
                status="untested",
                using_env_fallback=True,
            )
        raise HTTPException(status_code=404, detail="No VILab Server connection configured")

    def save_connection(self, user_id: str, payload: VILabServerConnectionRequest) -> VILabServerConnectionResponse:
        return self.repository.upsert(user_id, payload)

    def delete_connection(self, user_id: str):
        self.repository.delete(user_id)

    def resolve_client(self, user_id: str | None = None) -> VILabServerClient:
        if user_id:
            record = self.repository.get_record(user_id)
            if record:
                return self.client_factory(
                    base_url=record.base_url,
                    api_key=self.repository.decrypt_api_key(record),
                    client_id=user_id,
                    desktop_id=settings.vilab_server_desktop_id or user_id,
                )
        return self.client_factory(
            base_url=settings.vilab_server_base_url,
            api_key=settings.vilab_server_api_key,
            client_id=settings.vilab_server_client_id or (user_id or None),
            desktop_id=settings.vilab_server_desktop_id or (user_id or None),
        )

    def test_connection(self, user_id: str, payload: VILabServerConnectionRequest | None = None) -> VILabServerConnectionTestResponse:
        if payload is not None:
            base_url = payload.base_url.strip().rstrip("/")
            api_key = (payload.api_key or "").strip()
            mode = payload.mode
        else:
            record = self.repository.get_record(user_id)
            if record:
                base_url = record.base_url
                api_key = self.repository.decrypt_api_key(record)
                mode = record.mode
            else:
                base_url = settings.vilab_server_base_url
                api_key = settings.vilab_server_api_key
                mode = "local"
        del mode

        start = time.perf_counter()
        try:
            client = self.client_factory(base_url=base_url, api_key=api_key, client_id=user_id, desktop_id=settings.vilab_server_desktop_id or user_id)
            health = client.health()
            models_payload = client.list_models()
            latency_ms = int((time.perf_counter() - start) * 1000)
            models = _extract_models(models_payload)
            version = _extract_version(health)
            self.repository.save_test_result(user_id, status="connected", version=version, latency_ms=latency_ms)
            return VILabServerConnectionTestResponse(
                ok=True,
                status="connected",
                base_url=base_url,
                latency_ms=latency_ms,
                version=version,
                models=models,
            )
        except VILabServerClientError as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            self.repository.save_test_result(user_id, status="failed", version=None, latency_ms=latency_ms)
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            self.repository.save_test_result(user_id, status="failed", version=None, latency_ms=latency_ms)
            raise HTTPException(status_code=502, detail=f"Unable to connect to VILab Server: {exc}") from exc

    def list_models(self, user_id: str) -> dict[str, Any]:
        try:
            return self.resolve_client(user_id).list_models()
        except VILabServerClientError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc


def _extract_version(health: dict[str, Any]) -> str | None:
    value = health.get("version") or health.get("serverVersion") or health.get("service_version")
    return str(value) if value is not None else None


def _extract_models(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data", []) if isinstance(payload, dict) else []
    return data if isinstance(data, list) else []
