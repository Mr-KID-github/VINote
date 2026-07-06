import pytest
from fastapi import HTTPException

from app.models.vilab_server import VILabServerConnectionRequest
from app.services.note_service import NoteService
from app.services.secret_cipher import SecretCipher
from app.services.vilab_server_client import VILabServerClientError
from app.services.vilab_server_connection_service import VILabServerConnectionService


class FakeConnectionRepository:
    def __init__(self):
        self.record = None
        self.saved_results = []

    def get_response(self, user_id):
        return None

    def get_record(self, user_id):
        return self.record

    def upsert(self, user_id, payload):
        raise NotImplementedError

    def save_test_result(self, user_id, *, status, version, latency_ms):
        self.saved_results.append((user_id, status, version, latency_ms))

    def delete(self, user_id):
        self.record = None

    def decrypt_api_key(self, record):
        return record.api_key_encrypted


class FakeClient:
    def __init__(self, *, base_url, api_key, client_id=None, desktop_id=None, scenario="ok", calls=None, **_):
        self.base_url = base_url
        self.api_key = api_key
        self.client_id = client_id
        self.desktop_id = desktop_id
        self.scenario = scenario
        self.calls = calls if calls is not None else []

    def health(self):
        self.calls.append(("health", self.base_url, self.api_key, self.client_id))
        if self.scenario == "unreachable":
            raise RuntimeError("connection refused")
        return {"status": "ok", "version": "0.4.0"}

    def list_models(self):
        self.calls.append(("models", self.base_url, self.api_key, self.client_id))
        if self.scenario == "auth":
            raise VILabServerClientError("Unauthorized VILab Server API key")
        return {"data": [{"id": "asr-1", "modelType": "asr"}, {"id": "llm-1", "modelType": "llm"}]}

    def create_video_url_run(self, **kwargs):
        self.calls.append(("create", self.base_url, self.api_key, self.client_id, kwargs))
        return {"id": "run-1", "status": "pending"}


def test_connection_test_succeeds_when_health_and_models_succeed():
    repo = FakeConnectionRepository()
    calls = []
    service = VILabServerConnectionService(
        repository=repo,
        client_factory=lambda **kwargs: FakeClient(**kwargs, calls=calls),
    )

    result = service.test_connection(
        "user-1",
        VILabServerConnectionRequest(mode="local", base_url="http://127.0.0.1:9876", api_key="secret"),
    )

    assert result.ok is True
    assert result.status == "connected"
    assert result.version == "0.4.0"
    assert [call[0] for call in calls] == ["health", "models"]
    assert repo.saved_results[-1][1] == "connected"


def test_connection_test_invalid_key_returns_clear_502_auth_error():
    service = VILabServerConnectionService(
        repository=FakeConnectionRepository(),
        client_factory=lambda **kwargs: FakeClient(**kwargs, scenario="auth"),
    )

    with pytest.raises(HTTPException) as exc:
        service.test_connection("user-1", VILabServerConnectionRequest(base_url="http://server", api_key="bad"))

    assert exc.value.status_code == 502
    assert "Unauthorized" in exc.value.detail


def test_connection_test_unreachable_server_returns_502_connection_error():
    service = VILabServerConnectionService(
        repository=FakeConnectionRepository(),
        client_factory=lambda **kwargs: FakeClient(**kwargs, scenario="unreachable"),
    )

    with pytest.raises(HTTPException) as exc:
        service.test_connection("user-1", VILabServerConnectionRequest(base_url="http://missing", api_key="secret"))

    assert exc.value.status_code == 502
    assert "Unable to connect" in exc.value.detail


def test_saved_api_key_is_encrypted_and_masked_hint_only():
    cipher = SecretCipher("test-encryption-key")
    encrypted = cipher.encrypt("sk-secret-value")

    assert encrypted != "sk-secret-value"
    assert cipher.decrypt(encrypted) == "sk-secret-value"


def test_note_generation_uses_saved_connection_client_for_user():
    calls = []

    class Record:
        base_url = "http://saved-server"
        api_key_encrypted = "saved-key"

    repo = FakeConnectionRepository()
    repo.record = Record()
    connection_service = VILabServerConnectionService(
        repository=repo,
        client_factory=lambda **kwargs: FakeClient(**kwargs, calls=calls),
    )
    service = NoteService(connection_service=connection_service)

    service.submit_video_url(video_url="https://example.com/v", user_id="user-1")

    assert calls[-1][0] == "create"
    assert calls[-1][1] == "http://saved-server"
    assert calls[-1][2] == "saved-key"
    assert calls[-1][3] == "user-1"
