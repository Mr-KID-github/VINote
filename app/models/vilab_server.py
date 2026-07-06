from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


VILabServerMode = Literal["local", "remote"]
ConnectionStatus = Literal["connected", "disconnected", "failed", "untested"]


class VILabServerConnectionRequest(BaseModel):
    mode: VILabServerMode = "local"
    base_url: str = Field(min_length=1, max_length=500)
    api_key: Optional[str] = Field(default=None, max_length=500)


class VILabServerConnectionResponse(BaseModel):
    mode: VILabServerMode
    base_url: str
    api_key_hint: str = ""
    status: ConnectionStatus = "untested"
    version: Optional[str] = None
    latency_ms: Optional[int] = None
    checked_at: Optional[datetime] = None
    using_env_fallback: bool = False


class VILabServerConnectionTestResponse(BaseModel):
    ok: bool
    status: ConnectionStatus
    base_url: str
    latency_ms: int = 0
    version: Optional[str] = None
    error_message: str = ""
    models: list[dict[str, Any]] = Field(default_factory=list)


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
