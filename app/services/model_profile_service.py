from typing import Optional

from fastapi import HTTPException

from app.config import settings
from app.models.model_profile import (
    OLLAMA_API_KEY_PLACEHOLDER,
    OLLAMA_DEFAULT_BASE_URL,
    ModelProfileCreateRequest,
    ModelProfileRecord,
    ModelProfileResponse,
    ModelProfileTestRequest,
    ModelProfileTestResponse,
    ModelProfileUpdateRequest,
    OllamaModelResponse,
    ProviderType,
    ResolvedLLMConfig,
)
from app.services.model_profile_connection_service import ModelProfileConnectionService
from app.services.model_profile_repository import ModelProfileRepository


class ModelProfileService:
    def __init__(
        self,
        repository: ModelProfileRepository | None = None,
        connection_service: ModelProfileConnectionService | None = None,
    ):
        self.repository = repository or ModelProfileRepository()
        self.connection_service = connection_service or ModelProfileConnectionService()

    def list_profiles(self, user_id: str) -> list[ModelProfileResponse]:
        return self.repository.list_profiles(user_id)

    def create_profile(
        self,
        user_id: str,
        payload: ModelProfileCreateRequest,
    ) -> ModelProfileResponse:
        return self.repository.create_profile(user_id, self._normalize_create_payload(payload))

    def update_profile(
        self,
        user_id: str,
        profile_id: str,
        payload: ModelProfileUpdateRequest,
    ) -> ModelProfileResponse:
        current = self.repository.get_profile_record(user_id, profile_id)
        return self.repository.update_profile(
            user_id,
            profile_id,
            self._normalize_update_payload(current, payload),
        )

    def delete_profile(self, user_id: str, profile_id: str) -> None:
        current = self.repository.delete_profile(user_id, profile_id)
        if current.is_default:
            remaining = self.repository.get_latest_active_profile(user_id)
            if remaining:
                self.repository.set_default_profile(user_id, remaining.id)

    def set_default_profile(self, user_id: str, profile_id: str) -> ModelProfileResponse:
        return self.repository.set_default_profile(user_id, profile_id)

    def resolve_llm_config(
        self,
        *,
        user_id: Optional[str],
        model_profile_id: Optional[str],
        model_name: Optional[str],
        api_key: Optional[str],
        base_url: Optional[str],
    ) -> Optional[ResolvedLLMConfig]:
        if model_profile_id:
            if not user_id:
                raise HTTPException(status_code=401, detail="Authentication required for model profiles")
            record = self.repository.get_profile_record(user_id, model_profile_id)
            if not record.is_active:
                raise HTTPException(status_code=400, detail="Selected model profile is inactive")
            return ResolvedLLMConfig(
                provider=record.provider,
                base_url=record.base_url,
                model_name=record.model_name,
                api_key=self.repository.get_record_api_key(record),
            )

        if user_id:
            default_profile = self.repository.get_default_profile(user_id)
            if default_profile:
                return ResolvedLLMConfig(
                    provider=default_profile.provider,
                    base_url=default_profile.base_url,
                    model_name=default_profile.model_name,
                    api_key=self.repository.get_record_api_key(default_profile),
                )

        if model_name or api_key or base_url:
            return ResolvedLLMConfig(
                provider=settings.llm_provider,
                base_url=base_url or settings.llm_base_url,
                model_name=model_name or settings.llm_model,
                api_key=api_key or settings.llm_api_key,
            )

        return None

    def test_connection(self, payload: ModelProfileTestRequest) -> ModelProfileTestResponse:
        return self.connection_service.test_connection(self._normalize_test_payload(payload))

    def test_saved_profile(self, user_id: str, profile_id: str) -> ModelProfileTestResponse:
        record = self.repository.get_profile_record(user_id, profile_id)
        return self.connection_service.test_connection(
            ModelProfileTestRequest(
                provider=record.provider,
                base_url=record.base_url,
                model_name=record.model_name,
                api_key=self.repository.get_record_api_key(record),
            )
        )

    def list_ollama_models(self, base_url: Optional[str] = None) -> list[OllamaModelResponse]:
        return self.connection_service.list_ollama_models(base_url or OLLAMA_DEFAULT_BASE_URL)

    @staticmethod
    def _clean_optional(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None

    def _normalize_connection_fields(
        self,
        *,
        provider: ProviderType,
        base_url: Optional[str],
        api_key: Optional[str],
    ) -> tuple[str, str]:
        base_url = self._clean_optional(base_url)
        api_key = self._clean_optional(api_key)

        if provider == "ollama":
            return (
                base_url or OLLAMA_DEFAULT_BASE_URL,
                api_key or OLLAMA_API_KEY_PLACEHOLDER,
            )

        if not base_url:
            raise HTTPException(status_code=400, detail=f"base_url is required for provider `{provider}`")
        if not api_key:
            raise HTTPException(status_code=400, detail=f"api_key is required for provider `{provider}`")
        return base_url, api_key

    def _normalize_create_payload(self, payload: ModelProfileCreateRequest) -> ModelProfileCreateRequest:
        base_url, api_key = self._normalize_connection_fields(
            provider=payload.provider,
            base_url=payload.base_url,
            api_key=payload.api_key,
        )
        return payload.model_copy(update={"base_url": base_url, "api_key": api_key})

    def _normalize_update_payload(
        self,
        current: ModelProfileRecord,
        payload: ModelProfileUpdateRequest,
    ) -> ModelProfileUpdateRequest:
        provider = payload.provider or current.provider
        provider_changed = payload.provider is not None and payload.provider != current.provider
        base_url = payload.base_url
        if base_url is None and not provider_changed:
            base_url = current.base_url

        api_key = payload.api_key
        if api_key is None and not provider_changed:
            api_key = self.repository.get_record_api_key(current)
        base_url, api_key = self._normalize_connection_fields(
            provider=provider,
            base_url=base_url,
            api_key=api_key,
        )

        updates: dict[str, object] = {"base_url": base_url}
        if provider_changed or payload.api_key is not None or provider == "ollama":
            updates["api_key"] = api_key
        return payload.model_copy(update=updates)

    def _normalize_test_payload(self, payload: ModelProfileTestRequest) -> ModelProfileTestRequest:
        base_url, api_key = self._normalize_connection_fields(
            provider=payload.provider,
            base_url=payload.base_url,
            api_key=payload.api_key,
        )
        return payload.model_copy(update={"base_url": base_url, "api_key": api_key})
