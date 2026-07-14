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
from app.services.vilab_pipeline_readiness import build_pipeline_readiness, readiness_for_source


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
        persist_result = payload is None
        if payload is not None:
            base_url = payload.base_url
            saved = self.repository.get_record(user_id)
            api_key = (
                self.repository.decrypt_api_key(saved)
                if payload.api_key is None and saved is not None
                else (payload.api_key or "").strip()
            )
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
            readiness = build_pipeline_readiness(models)
            version = _extract_version(health)
            if persist_result:
                self.repository.save_test_result(user_id, status="connected", version=version, latency_ms=latency_ms)
            return VILabServerConnectionTestResponse(
                ok=True,
                status="connected",
                base_url=base_url,
                latency_ms=latency_ms,
                version=version,
                models=models,
                readiness=readiness,
            )
        except VILabServerClientError as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            if persist_result:
                self.repository.save_test_result(user_id, status="failed", version=None, latency_ms=latency_ms)
            detail = (
                f"VILab Server rejected the connection ({exc.status_code}): {exc}"
                if exc.status_code in {401, 403}
                else str(exc)
            )
            raise HTTPException(status_code=502, detail=detail) from exc
        except Exception as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            if persist_result:
                self.repository.save_test_result(user_id, status="failed", version=None, latency_ms=latency_ms)
            raise HTTPException(status_code=502, detail=f"Unable to connect to VILab Server: {exc}") from exc

    def list_models(self, user_id: str) -> dict[str, Any]:
        try:
            return _with_readiness(self.resolve_client(user_id).list_models())
        except VILabServerClientError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    def ensure_pipeline_ready(self, user_id: str | None, source_type: str) -> dict[str, Any]:
        payload = self.list_models(user_id or "")
        readiness = payload["readiness"]
        target = readiness_for_source(readiness, source_type)
        if target.get("ready") is True:
            return readiness
        missing = [str(item) for item in target.get("missing", [])]
        missing_text = ", ".join(missing) if missing else "required models"
        workflow = "transcript note" if source_type == "transcript" else "audio meeting"
        raise HTTPException(
            status_code=409,
            detail=(
                f"VILab Server is connected but not ready for {workflow} generation. "
                f"Missing ready models: {missing_text}. "
                "Configure, download, and activate models in VILab Server Admin."
            ),
        )


def _extract_version(health: dict[str, Any]) -> str | None:
    value = health.get("version") or health.get("serverVersion") or health.get("service_version")
    return str(value) if value is not None else None


def _extract_models(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data", []) if isinstance(payload, dict) else []
    return data if isinstance(data, list) else []


def _with_readiness(payload: dict[str, Any]) -> dict[str, Any]:
    models = _extract_models(payload)
    response = dict(payload) if isinstance(payload, dict) else {"data": models}
    response["data"] = models
    response["readiness"] = build_pipeline_readiness(models)
    return response
