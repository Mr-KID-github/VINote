from contextlib import contextmanager

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.vilab_server import VILabServerConnectionRequest
from app.services.secret_cipher import SecretCipher
from app.services.vilab_server_client import VILabServerClientError
from app.services.vilab_server_connection_repository import VILabServerConnectionRepository
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
    def __init__(self, *, base_url, api_key, client_id=None, desktop_id=None, scenario="ok", calls=None, models=None, **_):
        self.base_url = base_url
        self.api_key = api_key
        self.client_id = client_id
        self.desktop_id = desktop_id
        self.scenario = scenario
        self.calls = calls if calls is not None else []
        self.models = models if models is not None else [
            {"id": "asr-1", "modelType": "asr"},
            {"id": "llm-1", "modelType": "llm"},
        ]

    def health(self):
        self.calls.append(("health", self.base_url, self.api_key, self.client_id))
        if self.scenario == "unreachable":
            raise RuntimeError("connection refused")
        return {"status": "ok", "version": "0.4.0"}

    def list_models(self):
        self.calls.append(("models", self.base_url, self.api_key, self.client_id))
        if self.scenario == "auth":
            raise VILabServerClientError("Unauthorized VILab Server API key", status_code=401)
        return {"data": self.models}


def test_draft_connection_test_does_not_persist_status():
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
    assert repo.saved_results == []


def test_saved_connection_test_persists_connected_status():
    class Record:
        mode = "local"
        base_url = "http://saved-server"
        api_key_encrypted = "saved-key"

    repo = FakeConnectionRepository()
    repo.record = Record()
    service = VILabServerConnectionService(repository=repo, client_factory=FakeClient)

    result = service.test_connection("user-1")

    assert result.ok is True
    assert repo.saved_results[-1][1] == "connected"


def test_draft_connection_test_reuses_saved_key_when_key_is_omitted():
    class Record:
        mode = "local"
        base_url = "http://saved-server"
        api_key_encrypted = "saved-key"

    repo = FakeConnectionRepository()
    repo.record = Record()
    calls = []
    service = VILabServerConnectionService(
        repository=repo,
        client_factory=lambda **kwargs: FakeClient(**kwargs, calls=calls),
    )

    service.test_connection(
        "user-1",
        VILabServerConnectionRequest(base_url="http://draft-server"),
    )

    assert calls[0][1:3] == ("http://draft-server", "saved-key")
    assert repo.saved_results == []


def test_draft_connection_test_allows_server_without_api_key():
    calls = []
    service = VILabServerConnectionService(
        repository=FakeConnectionRepository(),
        client_factory=lambda **kwargs: FakeClient(**kwargs, calls=calls),
    )

    service.test_connection("user-1", VILabServerConnectionRequest(base_url="http://server"))

    assert calls[0][2] == ""


def test_draft_failure_does_not_mutate_saved_status():
    repo = FakeConnectionRepository()
    service = VILabServerConnectionService(
        repository=repo,
        client_factory=lambda **kwargs: FakeClient(**kwargs, scenario="unreachable"),
    )

    with pytest.raises(HTTPException):
        service.test_connection("user-1", VILabServerConnectionRequest(base_url="http://missing"))

    assert repo.saved_results == []


def test_saved_failure_persists_failed_status():
    class Record:
        mode = "local"
        base_url = "http://saved-server"
        api_key_encrypted = "saved-key"

    repo = FakeConnectionRepository()
    repo.record = Record()
    service = VILabServerConnectionService(
        repository=repo,
        client_factory=lambda **kwargs: FakeClient(**kwargs, scenario="unreachable"),
    )

    with pytest.raises(HTTPException):
        service.test_connection("user-1")

    assert repo.saved_results[-1][1] == "failed"


def test_connection_test_invalid_key_returns_clear_502_auth_error():
    service = VILabServerConnectionService(
        repository=FakeConnectionRepository(),
        client_factory=lambda **kwargs: FakeClient(**kwargs, scenario="auth"),
    )

    with pytest.raises(HTTPException) as exc:
        service.test_connection("user-1", VILabServerConnectionRequest(base_url="http://server", api_key="bad"))

    assert exc.value.status_code == 502
    assert "rejected the connection (401)" in exc.value.detail
    assert "Unauthorized" in exc.value.detail


@pytest.mark.parametrize(
    "base_url",
    [
        "ftp://server",
        "server.local",
        "http://user:password@server",
        "https://server/api",
        "https://server?token=secret",
        "https://server#fragment",
    ],
)
def test_connection_rejects_unsafe_or_non_root_base_urls(base_url):
    with pytest.raises(ValidationError):
        VILabServerConnectionRequest(base_url=base_url)


def test_repository_encrypts_key_masks_response_and_preserves_omitted_key(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    @contextmanager
    def test_session_scope():
        session = session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    monkeypatch.setattr(
        "app.services.vilab_server_connection_repository.session_scope",
        test_session_scope,
    )
    repository = VILabServerConnectionRepository(SecretCipher("test-encryption-key"))

    response = repository.upsert(
        "user-1",
        VILabServerConnectionRequest(base_url="https://server", api_key="sk-secret-value"),
    )
    first_record = repository.get_record("user-1")

    assert first_record is not None
    assert first_record.api_key_encrypted != "sk-secret-value"
    assert "sk-secret-value" not in response.model_dump_json()
    assert response.api_key_hint == "sk-s••••alue"

    repository.upsert(
        "user-1",
        VILabServerConnectionRequest(base_url="https://new-server"),
    )
    preserved_record = repository.get_record("user-1")

    assert preserved_record is not None
    assert preserved_record.api_key_encrypted == first_record.api_key_encrypted
    assert repository.decrypt_api_key(preserved_record) == "sk-secret-value"


def test_resolve_client_uses_saved_connection_for_user():
    class Record:
        mode = "local"
        base_url = "http://saved-server"
        api_key_encrypted = "saved-key"

    repo = FakeConnectionRepository()
    repo.record = Record()
    service = VILabServerConnectionService(repository=repo, client_factory=FakeClient)

    client = service.resolve_client("user-1")

    assert client.base_url == "http://saved-server"
    assert client.api_key == "saved-key"
    assert client.client_id == "user-1"


def test_model_readiness_requires_ready_asr_diarization_and_llm():
    models = [
        {"id": "asr-active", "modelType": "asr", "runtimeStatus": "active"},
        {"id": "diarization-healthy", "modelType": "diarization", "runtimeStatus": "healthy"},
        {"id": "llm-available", "modelType": "llm", "runtimeStatus": "available"},
    ]
    service = VILabServerConnectionService(
        repository=FakeConnectionRepository(),
        client_factory=lambda **kwargs: FakeClient(**kwargs, models=models),
    )

    payload = service.list_models("user-1")

    assert payload["readiness"]["audioMeeting"] == {
        "ready": True,
        "missing": [],
        "selectedModels": {
            "asr": "asr-active",
            "diarization": "diarization-healthy",
            "llm": "llm-available",
        },
    }
    assert payload["readiness"]["transcriptNote"]["ready"] is True


def test_model_readiness_rejects_installed_error_unknown_and_missing_models():
    models = [
        {"id": "asr-installed", "modelType": "asr", "runtimeStatus": "installed"},
        {"id": "diarization-error", "modelType": "diarization", "runtimeStatus": "error"},
        {"id": "llm-unknown", "modelType": "llm"},
    ]
    service = VILabServerConnectionService(
        repository=FakeConnectionRepository(),
        client_factory=lambda **kwargs: FakeClient(**kwargs, models=models),
    )

    payload = service.list_models("user-1")

    assert payload["readiness"]["audioMeeting"] == {
        "ready": False,
        "missing": ["asr", "diarization", "llm"],
        "selectedModels": {},
    }
    assert payload["readiness"]["transcriptNote"]["missing"] == ["llm"]


def test_connection_test_returns_readiness_without_persisting_draft_result():
    models = [
        {"id": "asr-ready", "modelType": "asr", "runtimeStatus": "ready"},
        {"id": "llm-loaded", "modelType": "llm", "runtimeStatus": "loaded"},
    ]
    repo = FakeConnectionRepository()
    service = VILabServerConnectionService(
        repository=repo,
        client_factory=lambda **kwargs: FakeClient(**kwargs, models=models),
    )

    result = service.test_connection(
        "user-1",
        VILabServerConnectionRequest(base_url="http://draft-server"),
    )

    assert result.readiness is not None
    assert result.readiness["audioMeeting"]["missing"] == ["diarization"]
    assert result.readiness["transcriptNote"]["ready"] is True
    assert repo.saved_results == []


def test_pipeline_readiness_guard_returns_actionable_409():
    models = [
        {"id": "asr-active", "modelType": "asr", "runtimeStatus": "active"},
        {"id": "llm-available", "modelType": "llm", "runtimeStatus": "available"},
    ]
    service = VILabServerConnectionService(
        repository=FakeConnectionRepository(),
        client_factory=lambda **kwargs: FakeClient(**kwargs, models=models),
    )

    with pytest.raises(HTTPException) as exc:
        service.ensure_pipeline_ready("user-1", "audio")

    assert exc.value.status_code == 409
    assert "Missing ready models: diarization" in exc.value.detail
    assert "VILab Server Admin" in exc.value.detail
    assert service.ensure_pipeline_ready("user-1", "transcript")["transcriptNote"]["ready"] is True
