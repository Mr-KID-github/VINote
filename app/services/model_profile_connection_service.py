import logging
import time

import httpx
from fastapi import HTTPException

from app.config import settings
from app.llm.anthropic_compat import post_anthropic_compatible
from app.models.model_profile import (
    OLLAMA_API_KEY_PLACEHOLDER,
    OLLAMA_DEFAULT_BASE_URL,
    ModelProfileTestRequest,
    ModelProfileTestResponse,
    OllamaModelResponse,
)

logger = logging.getLogger(__name__)


class ModelProfileConnectionService:
    @staticmethod
    def _build_openai_url(base_url: str) -> str:
        base = base_url.rstrip("/")
        return base if base.endswith("/chat/completions") else f"{base}/chat/completions"

    @staticmethod
    def _build_anthropic_url(base_url: str) -> str:
        base = base_url.rstrip("/")
        if base.endswith("/v1/messages"):
            return base
        if base.endswith("/messages"):
            return base
        if base.endswith("/v1"):
            return f"{base}/messages"
        return f"{base}/v1/messages"

    @staticmethod
    def _build_azure_url(base_url: str, model_name: str) -> str:
        base = base_url.rstrip("/")
        if "chat/completions" in base:
            if "api-version=" in base:
                return base
            separator = "&" if "?" in base else "?"
            return f"{base}{separator}api-version={settings.azure_openai_api_version}"
        return (
            f"{base}/openai/deployments/{model_name}"
            f"/chat/completions?api-version={settings.azure_openai_api_version}"
        )

    @staticmethod
    def _build_ollama_tags_url(base_url: str) -> str:
        base = base_url.rstrip("/")
        if base.endswith("/v1"):
            base = base[: -len("/v1")]
        return f"{base}/api/tags"

    def list_ollama_models(self, base_url: str) -> list[OllamaModelResponse]:
        try:
            response = httpx.get(
                self._build_ollama_tags_url(base_url),
                timeout=5.0,
                trust_env=False,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text or f"HTTP {exc.response.status_code}"
            raise HTTPException(status_code=502, detail=f"Ollama model list failed: {detail}") from exc
        except Exception as exc:
            logger.warning("Ollama model list failed", exc_info=True)
            raise HTTPException(status_code=502, detail=f"Ollama model list failed: {exc}") from exc

        models: list[OllamaModelResponse] = []
        for item in payload.get("models", []):
            details = item.get("details") or {}
            name = str(item.get("name") or item.get("model") or "")
            model = str(item.get("model") or name)
            if not name:
                continue
            models.append(
                OllamaModelResponse(
                    name=name,
                    model=model,
                    modified_at=item.get("modified_at"),
                    size=item.get("size"),
                    parameter_size=str(details.get("parameter_size") or ""),
                    quantization_level=str(details.get("quantization_level") or ""),
                )
            )
        return models

    def test_connection(self, payload: ModelProfileTestRequest) -> ModelProfileTestResponse:
        start = time.perf_counter()
        ok = False
        error_message = ""
        base_url = payload.base_url or (OLLAMA_DEFAULT_BASE_URL if payload.provider == "ollama" else "")
        api_key = payload.api_key or (OLLAMA_API_KEY_PLACEHOLDER if payload.provider == "ollama" else "")

        try:
            if payload.provider in {"openai-compatible", "groq-openai-compatible", "ollama"}:
                headers = {"Content-Type": "application/json"}
                if payload.provider != "ollama":
                    headers["Authorization"] = f"Bearer {api_key}"
                request_options = {"timeout": 20.0}
                if payload.provider == "ollama":
                    request_options["trust_env"] = False
                response = httpx.post(
                    self._build_openai_url(base_url),
                    headers=headers,
                    json={
                        "model": payload.model_name,
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 1,
                    },
                    **request_options,
                )
                response.raise_for_status()
                ok = True
            elif payload.provider == "anthropic-compatible":
                response = post_anthropic_compatible(
                    url=self._build_anthropic_url(base_url),
                    api_key=api_key,
                    json_body={
                        "model": payload.model_name,
                        "messages": [{"role": "user", "content": [{"type": "text", "text": "ping"}]}],
                        "max_tokens": 1,
                    },
                    timeout=20.0,
                )
                ok = True
            elif payload.provider == "azure-openai":
                response = httpx.post(
                    self._build_azure_url(base_url, payload.model_name),
                    headers={
                        "Content-Type": "application/json",
                        "api-key": api_key,
                    },
                    json={
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 1,
                    },
                    timeout=20.0,
                )
                response.raise_for_status()
                ok = True
            else:
                raise HTTPException(status_code=400, detail="Unsupported provider")
        except HTTPException as exc:
            error_message = str(exc.detail)
        except httpx.HTTPStatusError as exc:
            error_message = exc.response.text or f"HTTP {exc.response.status_code}"
        except Exception as exc:
            logger.warning("Model profile connection test failed", exc_info=True)
            error_message = str(exc)

        return ModelProfileTestResponse(
            ok=ok,
            provider=payload.provider,
            model=payload.model_name,
            latency_ms=int((time.perf_counter() - start) * 1000),
            error_message=error_message,
        )
