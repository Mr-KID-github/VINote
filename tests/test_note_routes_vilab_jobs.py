from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.db_models import NoteDB, TeamMemberDB
from app.models.auth import AuthenticatedUser
from app.routers import note as note_router
from app.services.auth_service import get_current_user
from app.services.generation_job_repository import GenerationJobRepository
from app.services.task_artifact_service import TaskArtifactService


def _database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'routes.db'}", future=True)
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

    monkeypatch.setattr("app.services.generation_job_repository.session_scope", scoped_session)
    return GenerationJobRepository(), sessions


def _app():
    app = FastAPI()
    app.include_router(note_router.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-a")
    return app


class CompletedService:
    def __init__(self):
        self.ready = []
        self.audio_submissions = []
        self.transcript_submissions = []

    def ensure_ready_for_source(self, source_type, user_id=None):
        self.ready.append((source_type, user_id))
        return {}

    def submit_file(self, **kwargs):
        self.audio_submissions.append(kwargs)
        return {"id": "upstream-audio", "status": "queued"}

    def submit_transcript(self, **kwargs):
        self.transcript_submissions.append(kwargs)
        return {"id": "upstream-transcript", "status": "queued"}

    def get_status(self, run_id, user_id=None):
        return {
            "status": "success",
            "message": "Done",
            "metadata": {"upstreamStatus": "completed"},
            "run": {
                "id": run_id,
                "status": "completed",
                "summaryMode": "default",
                "childRuns": [
                    {"kind": "speaker_transcript", "id": "speaker-child"},
                    {"kind": "summary", "id": "summary-child"},
                ],
                "result": {
                    "title": "Generated meeting",
                    "markdown": "# Minutes",
                    "summary": {"title": "Generated meeting"},
                    "source": {"speakerTranscriptRunId": "speaker-child"},
                },
            },
        }

    def get_result(self, run_id, user_id=None):
        return {
            "title": "Generated meeting",
            "markdown": "# Minutes",
            "duration": 3,
            "platform": "audio",
            "video_id": run_id,
            "summary_mode": "default",
        }

    def get_structured_result(self, run):
        return {
            "title": run["result"]["title"],
            "markdown": run["result"]["markdown"],
            "summary": run["result"]["summary"],
            "source": run["result"]["source"],
            "stageRunIds": {child["kind"]: child["id"] for child in run["childRuns"]},
        }

    def cancel(self, *_args, **_kwargs):
        return {"status": "cancelled"}


def test_audio_upload_preserves_bytes_and_repeated_polls_create_one_note(tmp_path, monkeypatch):
    repository, sessions = _database(tmp_path, monkeypatch)
    service = CompletedService()
    data_dir = tmp_path / "data"
    monkeypatch.setattr(note_router, "_job_repository", repository)
    monkeypatch.setattr(note_router, "_note_service", service)
    monkeypatch.setattr(note_router.settings, "data_dir", data_dir)
    monkeypatch.setattr(note_router.settings, "upload_max_bytes", 1024)
    artifacts = TaskArtifactService(tmp_path / "output")
    monkeypatch.setattr(note_router, "_artifacts", artifacts)

    with TestClient(_app()) as client:
        upload = client.post(
            "/api/generate_from_upload",
            files={"file": ("meeting.wav", b"original-audio", "audio/wav")},
            data={"source_type": "audio", "title": "Meeting"},
        )
        assert upload.status_code == 200
        task_id = upload.json()["task_id"]
        first = client.get(f"/api/task/{task_id}")
        second = client.get(f"/api/task/{task_id}")

    assert service.ready == [("audio", "user-a")]
    staged = Path(service.audio_submissions[0]["file_path"])
    assert staged.read_bytes() == b"original-audio"
    source_media = artifacts.resolve_source_media(artifacts.find_task_dir(task_id))
    assert source_media is not None
    assert source_media.read_bytes() == b"original-audio"
    assert first.json()["note_id"] == second.json()["note_id"]
    assert first.json()["result"]["task_id"] == task_id
    assert "upstream-audio" not in str(first.json())
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(NoteDB)) == 1
        note = db.scalar(select(NoteDB))
        assert note.task_id == task_id
        assert note.content == "# Minutes"
        assert "speaker-child" in note.structured_json


def test_transcript_upload_uses_transcript_parent_input(tmp_path, monkeypatch):
    repository, _ = _database(tmp_path, monkeypatch)
    service = CompletedService()
    monkeypatch.setattr(note_router, "_job_repository", repository)
    monkeypatch.setattr(note_router, "_note_service", service)
    monkeypatch.setattr(note_router.settings, "data_dir", tmp_path / "data")
    monkeypatch.setattr(note_router.settings, "upload_max_bytes", 1024)

    with TestClient(_app()) as client:
        response = client.post(
            "/api/generate_from_upload",
            files={"file": ("meeting.txt", "First line\nSecond line".encode(), "text/plain")},
            data={"source_type": "transcript", "title": "Transcript"},
        )

    assert response.status_code == 200
    assert service.ready == [("transcript", "user-a")]
    assert service.audio_submissions == []
    transcript = service.transcript_submissions[0]["transcript"]
    assert transcript.full_text == "First line\nSecond line"


def test_readiness_failure_happens_before_upload_persistence(tmp_path, monkeypatch):
    repository, _ = _database(tmp_path, monkeypatch)

    class MissingReadiness(CompletedService):
        def ensure_ready_for_source(self, source_type, user_id=None):
            raise HTTPException(status_code=409, detail="Missing ready models: diarization")

    monkeypatch.setattr(note_router, "_job_repository", repository)
    monkeypatch.setattr(note_router, "_note_service", MissingReadiness())
    monkeypatch.setattr(note_router.settings, "data_dir", tmp_path / "data")

    with TestClient(_app()) as client:
        response = client.post(
            "/api/generate_from_upload",
            files={"file": ("meeting.wav", b"audio", "audio/wav")},
            data={"source_type": "audio"},
        )

    assert response.status_code == 409
    assert not (tmp_path / "data" / "uploads").exists()


def test_oversized_upload_removes_partial_file(tmp_path, monkeypatch):
    repository, _ = _database(tmp_path, monkeypatch)
    monkeypatch.setattr(note_router, "_job_repository", repository)
    monkeypatch.setattr(note_router, "_note_service", CompletedService())
    monkeypatch.setattr(note_router.settings, "data_dir", tmp_path / "data")
    monkeypatch.setattr(note_router.settings, "upload_max_bytes", 3)

    with TestClient(_app()) as client:
        response = client.post(
            "/api/generate_from_upload",
            files={"file": ("meeting.wav", b"too-large", "audio/wav")},
            data={"source_type": "audio"},
        )

    assert response.status_code == 413
    uploads = tmp_path / "data" / "uploads"
    assert not uploads.exists() or list(uploads.iterdir()) == []


def test_team_workspace_is_authorized_before_submission_and_preserved_on_note(tmp_path, monkeypatch):
    repository, sessions = _database(tmp_path, monkeypatch)
    service = CompletedService()

    class Teams:
        def is_team_member(self, user_id, team_id):
            return (user_id, team_id) == ("user-a", "team-1")

    with sessions() as db:
        db.add(TeamMemberDB(id="member-1", user_id="user-a", team_id="team-1", role="member"))
        db.commit()
    monkeypatch.setattr(note_router, "_job_repository", repository)
    monkeypatch.setattr(note_router, "_note_service", service)
    monkeypatch.setattr(note_router, "_team_repository", Teams())
    monkeypatch.setattr(note_router.settings, "data_dir", tmp_path / "data")
    monkeypatch.setattr(note_router.settings, "upload_max_bytes", 1024)

    with TestClient(_app()) as client:
        upload = client.post(
            "/api/generate_from_upload",
            files={"file": ("meeting.wav", b"audio", "audio/wav")},
            data={"source_type": "audio", "scope": "team", "team_id": "team-1"},
        )
        completed = client.get(f"/api/task/{upload.json()['task_id']}")

    assert upload.status_code == 200
    assert completed.status_code == 200
    with sessions() as db:
        note = db.scalar(select(NoteDB))
        assert note.scope == "team"
        assert note.team_id == "team-1"
