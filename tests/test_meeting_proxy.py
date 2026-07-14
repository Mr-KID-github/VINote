import asyncio
from contextlib import contextmanager
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app import db as db_module
from app.models.auth import UserResponse
from app.routers import meeting
from app.services.auth_service import create_access_token
from app.services.meeting_session_repository import MeetingSessionRepository
from app.services.generation_job_repository import GenerationJobRepository
from app.services.realtime_meeting_proxy import (
    AudioFrameValidator,
    MAX_PCM_FRAME_BYTES,
    RelayProtocolError,
    connect_upstream_speaker_session,
    localize_upstream_event,
    upstream_speaker_transcript_url,
    validate_client_control,
)
from app.services.vilab_server_client import VILabServerClient
from app.services.task_artifact_service import TaskArtifactService


def _repository_on_temp_database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'meeting.db'}", future=True)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)

    @contextmanager
    def scoped_session():
        db = sessions()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    monkeypatch.setattr("app.services.meeting_session_repository.session_scope", scoped_session)
    monkeypatch.setattr("app.services.generation_job_repository.session_scope", scoped_session)
    return MeetingSessionRepository()


def _app(repository, monkeypatch):
    app = FastAPI()
    app.include_router(meeting.router, prefix="/api")
    monkeypatch.setattr(meeting, "_sessions", repository)
    return app


def _vla2_frame(sequence: int, payload: bytes, flags: int) -> bytes:
    return (
        b"VLA2"
        + bytes([2, 1, flags, 0])
        + sequence.to_bytes(8, "little")
        + len(payload).to_bytes(4, "little")
        + payload
    )


def test_meeting_session_is_owner_scoped_and_uses_connection_leases(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    created = repository.create("user-a")
    assert repository.get_owned(created.id, "user-b") is None

    first = repository.claim_realtime(created.id, "user-a")
    assert first
    assert repository.claim_realtime(created.id, "user-a") is None
    assert repository.update_connection(created.id, "user-a", first, status="closed")

    second = repository.claim_realtime(created.id, "user-a")
    assert second and second != first
    assert not repository.update_connection(created.id, "user-a", first, status="closed")
    assert repository.get_owned(created.id, "user-a").status == "connecting"


def test_meeting_session_migration_adds_lease_columns_and_recovers_active_rows(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}", future=True)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE meeting_sessions (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, status VARCHAR(32) NOT NULL)"
        )
        connection.exec_driver_sql(
            "INSERT INTO meeting_sessions (id, user_id, status) VALUES ('session-1', 'user-a', 'active')"
        )
        connection.exec_driver_sql(
            "INSERT INTO meeting_sessions (id, user_id, status) VALUES ('session-2', 'user-a', 'finalizing')"
        )
    monkeypatch.setattr(db_module, "engine", engine)

    db_module._ensure_meeting_sessions_table()

    columns = {column["name"] for column in inspect(engine).get_columns("meeting_sessions")}
    assert {"connection_id", "upstream_session_id", "generation_job_id"}.issubset(columns)
    with engine.connect() as connection:
        status = connection.exec_driver_sql(
            "SELECT status FROM meeting_sessions WHERE id = 'session-1'"
        ).scalar_one()
    assert status == "closed"
    with engine.connect() as connection:
        interrupted = connection.exec_driver_sql(
            "SELECT status FROM meeting_sessions WHERE id = 'session-2'"
        ).scalar_one()
    assert interrupted == "completion_failed"


def test_meeting_session_http_returns_only_local_identity(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    app = _app(repository, monkeypatch)
    client = TestClient(app)

    assert client.post("/api/meeting/sessions").status_code == 401
    client.cookies.set("vinote_session", create_access_token(UserResponse(id="user-a", email="a@example.com")))
    created = client.post("/api/meeting/sessions")
    assert created.status_code == 201
    payload = created.json()
    assert payload["session_id"] in payload["websocket_url"]
    assert "upstream" not in str(payload)

    hidden = repository.get_owned(payload["session_id"], "user-a")
    assert hidden is not None
    client.cookies.set("vinote_session", create_access_token(UserResponse(id="user-b", email="b@example.com")))
    assert client.get(f"/api/meeting/sessions/{payload['session_id']}").status_code == 404


def test_upstream_connection_uses_server_headers_and_optional_authorization():
    captures = []

    async def connector(url, **kwargs):
        captures.append((url, kwargs))
        return object()

    with_key = VILabServerClient(
        base_url="https://vilab.example/base",
        api_key="server-secret-key",
        client_id="owner-local-id",
        desktop_id="desktop-local-id",
    )
    without_key = VILabServerClient(
        base_url="http://127.0.0.1:9877",
        api_key="",
        client_id="owner-local-id",
        desktop_id="desktop-local-id",
    )
    asyncio.run(connect_upstream_speaker_session(with_key, connector=connector))
    asyncio.run(connect_upstream_speaker_session(without_key, connector=connector))

    first_url, first = captures[0]
    assert first_url == "wss://vilab.example/base/v1/speaker-transcripts/sessions"
    assert "server-secret-key" not in first_url
    assert first["additional_headers"]["Authorization"] == "Bearer server-secret-key"
    assert first["max_queue"] == 16
    assert "Authorization" not in captures[1][1]["additional_headers"]
    assert upstream_speaker_transcript_url("http://127.0.0.1:9877") == "ws://127.0.0.1:9877/v1/speaker-transcripts/sessions"


def test_control_validation_strips_untrusted_options_and_rejects_overrides():
    sanitized = validate_client_control(json.dumps({
        "type": "session.start",
        "audio": {"encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1},
        "language": " zh-CN ",
    }), started=False)
    assert sanitized == {
        "type": "session.start",
        "audio": {"encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1},
        "emitPartialSegments": True,
        "language": "zh-CN",
    }

    for field in ("model", "asrModel", "diarizationModel", "knownSpeakerIds", "exactSpeakers"):
        payload = {
            "type": "session.start",
            "audio": {"encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1},
            field: "untrusted",
        }
        try:
            validate_client_control(json.dumps(payload), started=False)
            raise AssertionError(f"expected {field} rejection")
        except RelayProtocolError as exc:
            assert exc.code == "capability_unavailable"


def test_pcm_validator_enforces_sequence_frame_size_and_total_duration():
    validator = AudioFrameValidator()
    validator.validate(_vla2_frame(0, b"\x00\x00", 0x01))
    validator.validate(_vla2_frame(1, b"", 0x02))
    try:
        validator.validate(_vla2_frame(2, b"", 0))
        raise AssertionError("expected frame-after-LAST rejection")
    except RelayProtocolError as exc:
        assert exc.code == "audio_sequence_error"

    try:
        AudioFrameValidator().validate(_vla2_frame(0, b"\x00", 0x01))
        raise AssertionError("expected partial sample rejection")
    except RelayProtocolError as exc:
        assert exc.code == "invalid_audio_format"

    duration = AudioFrameValidator()
    payload = b"\x00" * MAX_PCM_FRAME_BYTES
    for sequence in range(300):
        duration.validate(_vla2_frame(sequence, payload, 0x01 if sequence == 0 else 0))
    try:
        duration.validate(_vla2_frame(300, b"\x00\x00", 0))
        raise AssertionError("expected duration rejection")
    except RelayProtocolError as exc:
        assert exc.code == "audio_duration_exceeded"


def test_upstream_events_are_localized_and_never_expose_upstream_session_id():
    localized, upstream_id, terminal = localize_upstream_event(
        json.dumps({"type": "session.accepted", "sessionId": "upstream-secret"}),
        "local-session",
    )
    assert upstream_id == "upstream-secret"
    assert json.loads(localized)["sessionId"] == "local-session"
    assert "upstream-secret" not in localized
    assert terminal is False


def test_authenticated_websocket_relays_sanitized_control_pcm_and_local_ids(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    session = repository.create("user-a")

    class FakeConnections:
        def resolve_client(self, user_id):
            assert user_id == "user-a"
            return object()

    class FakeUpstream:
        def __init__(self):
            self.queue = asyncio.Queue()
            self.sent = []

        async def send(self, message):
            self.sent.append(message)
            if isinstance(message, str) and json.loads(message)["type"] == "session.start":
                await self.queue.put(json.dumps({"type": "session.accepted", "sessionId": "upstream-secret"}))
                await self.queue.put(json.dumps({"type": "session.started", "sessionId": "upstream-secret"}))
            elif isinstance(message, bytes) and message[6] & 0x02:
                await self.queue.put(json.dumps({"type": "speaker_transcript.completed", "sessionId": "upstream-secret"}))

        async def recv(self):
            return await self.queue.get()

        async def close(self):
            return None

    upstream = FakeUpstream()

    async def connect(_client):
        return upstream

    monkeypatch.setattr(meeting, "_sessions", repository)
    monkeypatch.setattr(meeting, "_connections", FakeConnections())
    monkeypatch.setattr(meeting, "connect_upstream_speaker_session", connect)
    app = FastAPI()
    app.include_router(meeting.router, prefix="/api")
    client = TestClient(app)
    client.cookies.set("vinote_session", create_access_token(UserResponse(id="user-a", email="a@example.com")))

    with client.websocket_connect(f"/api/meeting/sessions/{session.id}/realtime") as websocket:
        websocket.send_json({
            "type": "session.start",
            "audio": {"encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1},
            "language": "zh-CN",
        })
        accepted = websocket.receive_json()
        started = websocket.receive_json()
        assert accepted["sessionId"] == session.id
        assert started["sessionId"] == session.id
        assert "upstream-secret" not in str((accepted, started))
        websocket.send_bytes(_vla2_frame(0, b"\x00\x00", 0x01))
        websocket.send_bytes(_vla2_frame(1, b"", 0x02))
        assert websocket.receive_json() == {"type": "speaker_transcript.completed", "sessionId": session.id}

    forwarded_start = json.loads(upstream.sent[0])
    assert forwarded_start["language"] == "zh-CN"
    assert set(forwarded_start) == {"type", "audio", "emitPartialSegments", "language"}
    assert upstream.sent[1] == _vla2_frame(0, b"\x00\x00", 0x01)
    assert upstream.sent[2] == _vla2_frame(1, b"", 0x02)
    stored = repository.get_owned(session.id, "user-a")
    assert stored.status == "closed"
    assert stored.upstream_session_id == "upstream-secret"


def test_disconnect_cancels_upstream_and_reconnects_with_a_fresh_lease(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    session = repository.create("user-a")

    class FakeConnections:
        def resolve_client(self, _user_id):
            return object()

    class FakeUpstream:
        def __init__(self, index):
            self.index = index
            self.queue = asyncio.Queue()
            self.sent = []

        async def send(self, message):
            self.sent.append(message)
            if isinstance(message, str) and json.loads(message).get("type") == "session.start":
                await self.queue.put(json.dumps({"type": "session.accepted", "sessionId": f"upstream-{self.index}"}))
                await self.queue.put(json.dumps({"type": "session.started", "sessionId": f"upstream-{self.index}"}))

        async def recv(self):
            return await self.queue.get()

        async def close(self):
            return None

    upstreams = []

    async def connect(_client):
        upstream = FakeUpstream(len(upstreams) + 1)
        upstreams.append(upstream)
        return upstream

    monkeypatch.setattr(meeting, "_sessions", repository)
    monkeypatch.setattr(meeting, "_connections", FakeConnections())
    monkeypatch.setattr(meeting, "connect_upstream_speaker_session", connect)
    app = FastAPI()
    app.include_router(meeting.router, prefix="/api")
    client = TestClient(app)
    client.cookies.set("vinote_session", create_access_token(UserResponse(id="user-a", email="a@example.com")))
    start = {
        "type": "session.start",
        "audio": {"encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1},
    }

    for index in (1, 2):
        with client.websocket_connect(f"/api/meeting/sessions/{session.id}/realtime") as websocket:
            websocket.send_json(start)
            assert websocket.receive_json()["sessionId"] == session.id
            assert websocket.receive_json()["type"] == "session.started"
        assert json.loads(upstreams[index - 1].sent[-1]) == {
            "type": "session.cancel",
            "reason": "client_disconnect",
        }

    assert len(upstreams) == 2
    stored = repository.get_owned(session.id, "user-a")
    assert stored.status == "closed"
    assert stored.upstream_session_id == "upstream-2"


def test_live_failure_hands_exact_original_audio_to_one_offline_job(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    jobs = GenerationJobRepository()
    artifacts = TaskArtifactService(tmp_path / "output")
    session = repository.create("user-a")
    connection_id = repository.claim_realtime(session.id, "user-a")
    assert connection_id
    assert repository.update_connection(session.id, "user-a", connection_id, status="failed")

    class FakeNotes:
        def __init__(self):
            self.calls = []
            self.cancelled = []

        def ensure_ready_for_source(self, source_type, user_id=None):
            assert source_type == "audio"
            assert user_id == "user-a"

        def submit_file(self, **kwargs):
            self.calls.append(kwargs)
            assert Path(kwargs["file_path"]).read_bytes() == b"exact-original-recording"
            run_id = "upstream-private-run" if len(self.calls) == 1 else "upstream-retry-run"
            return {"id": run_id, "status": "queued"}

        def cancel(self, run_id, user_id=None):
            self.cancelled.append((run_id, user_id))

    notes = FakeNotes()
    monkeypatch.setattr(meeting, "_sessions", repository)
    monkeypatch.setattr(meeting, "_jobs", jobs)
    monkeypatch.setattr(meeting, "_notes", notes)
    monkeypatch.setattr(meeting, "_artifacts", artifacts)
    app = FastAPI()
    app.include_router(meeting.router, prefix="/api")
    client = TestClient(app)
    client.cookies.set("vinote_session", create_access_token(UserResponse(id="user-a", email="a@example.com")))

    first = client.post(
        f"/api/meeting/sessions/{session.id}/complete",
        files={"file": ("meeting.webm", b"exact-original-recording", "audio/webm")},
        data={"title": "Recorded meeting", "scope": "personal"},
    )
    assert first.status_code == 202
    payload = first.json()
    assert payload["task_id"] != "upstream-private-run"
    stored = jobs.get_owned(payload["task_id"], "user-a")
    assert stored and stored.upstream_run_id == "upstream-private-run"
    linked = repository.get_owned(session.id, "user-a")
    assert linked and linked.generation_job_id == payload["task_id"]
    assert linked.status == "offline_processing"
    source = artifacts.find_task_dir(payload["task_id"]) / "media" / "source_audio.webm"
    assert source.read_bytes() == b"exact-original-recording"
    assert artifacts.resolve_source_media(artifacts.find_task_dir(payload["task_id"])) == source.resolve()

    duplicate = client.post(
        f"/api/meeting/sessions/{session.id}/complete",
        files={"file": ("meeting.webm", b"must-not-replace-original", "audio/webm")},
        data={"title": "Duplicate"},
    )
    assert duplicate.status_code == 202
    assert duplicate.json()["task_id"] == payload["task_id"]
    assert source.read_bytes() == b"exact-original-recording"
    assert len(notes.calls) == 1
    assert notes.cancelled == []

    jobs.update_snapshot(
        payload["task_id"],
        "user-a",
        status="failed",
        metadata={"upstreamStatus": "failed"},
        error={"category": "provider", "message": "transcription failed"},
    )
    retry = client.post(
        f"/api/meeting/sessions/{session.id}/complete",
        files={"file": ("meeting.webm", b"exact-original-recording", "audio/webm")},
        data={"title": "Recorded meeting", "scope": "personal"},
    )
    assert retry.status_code == 202
    assert retry.json()["task_id"] != payload["task_id"]
    retried = jobs.get_owned(retry.json()["task_id"], "user-a")
    assert retried and retried.upstream_run_id == "upstream-retry-run"
    assert len(notes.calls) == 2


def test_offline_link_failure_cancels_upstream_cleans_media_and_allows_retry(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    artifacts = TaskArtifactService(tmp_path / "output")
    session = repository.create("user-a")

    class FakeNotes:
        def __init__(self):
            self.cancelled = []

        def ensure_ready_for_source(self, _source_type, user_id=None):
            assert user_id == "user-a"

        def submit_file(self, **_kwargs):
            return {"id": "upstream-to-cancel", "status": "queued"}

        def cancel(self, run_id, user_id=None):
            self.cancelled.append((run_id, user_id))

    class FailingJobs:
        def get_owned(self, *_args):
            return None

        def create_for_meeting_session(self, **_kwargs):
            raise RuntimeError("database unavailable")

    notes = FakeNotes()
    monkeypatch.setattr(meeting, "_sessions", repository)
    monkeypatch.setattr(meeting, "_jobs", FailingJobs())
    monkeypatch.setattr(meeting, "_notes", notes)
    monkeypatch.setattr(meeting, "_artifacts", artifacts)
    app = FastAPI()
    app.include_router(meeting.router, prefix="/api")
    client = TestClient(app)
    client.cookies.set("vinote_session", create_access_token(UserResponse(id="user-a", email="a@example.com")))

    failed = client.post(
        f"/api/meeting/sessions/{session.id}/complete",
        files={"file": ("meeting.webm", b"original", "audio/webm")},
    )
    assert failed.status_code == 502
    assert notes.cancelled == [("upstream-to-cancel", "user-a")]
    assert repository.get_owned(session.id, "user-a").status == "completion_failed"
    assert list((tmp_path / "output").glob("*")) == []
    assert repository.claim_completion(session.id, "user-a") is True


def test_websocket_rejects_missing_auth_and_audio_before_started(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    session = repository.create("user-a")
    app = FastAPI()
    monkeypatch.setattr(meeting, "_sessions", repository)
    app.include_router(meeting.router, prefix="/api")
    client = TestClient(app)

    try:
        with client.websocket_connect(f"/api/meeting/sessions/{session.id}/realtime"):
            raise AssertionError("expected authentication rejection")
    except WebSocketDisconnect as exc:
        assert exc.code == 4401

    class FakeConnections:
        def resolve_client(self, _user_id):
            return object()

    class WaitingUpstream:
        def __init__(self):
            self.sent = []

        async def send(self, message):
            self.sent.append(message)

        async def recv(self):
            await asyncio.Event().wait()

        async def close(self):
            return None

    upstream = WaitingUpstream()

    async def connect(_client):
        return upstream

    monkeypatch.setattr(meeting, "_connections", FakeConnections())
    monkeypatch.setattr(meeting, "connect_upstream_speaker_session", connect)
    client.cookies.set("vinote_session", create_access_token(UserResponse(id="user-a", email="a@example.com")))
    with client.websocket_connect(f"/api/meeting/sessions/{session.id}/realtime") as websocket:
        websocket.send_bytes(_vla2_frame(0, b"\x00\x00", 0x01))
        error = websocket.receive_json()
        assert error["code"] == "audio_before_session_start"
        assert error["sessionId"] == session.id
    assert upstream.sent == []
