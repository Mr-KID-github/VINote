from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


ProviderType = Literal[
    "openai-compatible",
    "anthropic-compatible",
    "azure-openai",
    "ollama",
    "groq-openai-compatible",
]

OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1"
OLLAMA_API_KEY_PLACEHOLDER = "ollama-local"


class ModelProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    provider: ProviderType
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=500)
    model_name: str = Field(min_length=1, max_length=200)
    api_key: Optional[str] = Field(default=None, min_length=1, max_length=500)
    is_default: bool = False
    is_active: bool = True


class ModelProfileUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    provider: Optional[ProviderType] = None
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=500)
    model_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    api_key: Optional[str] = Field(default=None, min_length=1, max_length=500)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class ModelProfileTestRequest(BaseModel):
    provider: ProviderType
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=500)
    model_name: str = Field(min_length=1, max_length=200)
    api_key: Optional[str] = Field(default=None, min_length=1, max_length=500)


class ModelProfileResponse(BaseModel):
    id: str
    name: str
    provider: ProviderType
    base_url: str
    model_name: str
    api_key_hint: str
    is_default: bool
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ModelProfileTestResponse(BaseModel):
    ok: bool
    provider: ProviderType
    model: str
    latency_ms: int
    error_message: str = ""


class OllamaModelResponse(BaseModel):
    name: str
    model: str
    modified_at: Optional[str] = None
    size: Optional[int] = None
    parameter_size: str = ""
    quantization_level: str = ""


class ResolvedLLMConfig(BaseModel):
    provider: ProviderType
    base_url: str
    model_name: str
    api_key: str


class ModelProfileRecord(BaseModel):
    id: str
    user_id: str
    name: str
    provider: ProviderType
    base_url: str
    model_name: str
    api_key_encrypted: str
    is_default: bool
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
