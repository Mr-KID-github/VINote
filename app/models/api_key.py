from datetime import datetime

from pydantic import BaseModel, Field


class APIKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class APIKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    last_used_at: datetime | None = None
    created_at: datetime
    revoked_at: datetime | None = None


class APIKeyCreateResponse(APIKeyResponse):
    api_key: str


class APIKeyRecord(BaseModel):
    id: str
    user_id: str
    name: str
    key_prefix: str
    key_hash: str
    last_used_at: datetime | None = None
    created_at: datetime
    revoked_at: datetime | None = None
