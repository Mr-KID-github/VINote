from datetime import datetime
from typing import Any, Literal, Optional
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator


VILabServerMode = Literal["local", "remote"]
ConnectionStatus = Literal["connected", "disconnected", "failed", "untested"]


class VILabServerConnectionRequest(BaseModel):
    mode: VILabServerMode = "local"
    base_url: str = Field(min_length=1, max_length=500)
    api_key: Optional[str] = Field(default=None, max_length=500)

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        normalized = value.strip().rstrip("/")
        parsed = urlsplit(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("base_url must be an absolute HTTP or HTTPS URL")
        if parsed.username or parsed.password:
            raise ValueError("base_url must not contain credentials")
        if parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
            raise ValueError("base_url must identify the VILab Server root")
        return normalized


class VILabServerConnectionResponse(BaseModel):
    mode: VILabServerMode
    base_url: str
    api_key_hint: str = ""
    status: ConnectionStatus = "untested"
    version: Optional[str] = None
    latency_ms: Optional[int] = None
    checked_at: Optional[datetime] = None
    using_env_fallback: bool = False
    readiness: Optional[dict[str, Any]] = None


class VILabServerConnectionTestResponse(BaseModel):
    ok: bool
    status: ConnectionStatus
    base_url: str
    latency_ms: int = 0
    version: Optional[str] = None
    error_message: str = ""
    models: list[dict[str, Any]] = Field(default_factory=list)
    readiness: Optional[dict[str, Any]] = None


class VILabServerConnectionRecord(BaseModel):
    id: str
    user_id: str
    mode: VILabServerMode
    base_url: str
    api_key_encrypted: str
    status: ConnectionStatus = "untested"
    version: Optional[str] = None
    latency_ms: Optional[int] = None
    checked_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
