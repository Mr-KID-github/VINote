from contextlib import contextmanager

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app import db as db_module
from app.db_models import TeamDB, TeamMemberDB
from app.models.auth import AuthenticatedUser
from app.routers import note as note_router
from app.services.generation_job_repository import GenerationJobRepository
from app.services.note_service import NoteService


def _repository_on_temp_database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'jobs.db'}", future=True)
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
    return GenerationJobRepository()


def test_jobs_survive_repository_reload_and_enforce_owner_scope(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    created = repository.create(
        user_id="user-a",
        upstream_run_id="upstream-secret-run",
        status="pending",
        source_type="audio",
        title="Meeting",
    )

    reloaded = GenerationJobRepository().get_owned(created.id, "user-a")

    assert reloaded is not None
    assert reloaded.id != reloaded.upstream_run_id
    assert reloaded.upstream_run_id == "upstream-secret-run"
    assert GenerationJobRepository().get_owned(created.id, "user-b") is None


def test_generation_job_access_matches_personal_and_team_note_scope(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    personal = repository.create(
        user_id="user-a",
        upstream_run_id="personal-run",
        status="success",
        source_type="audio",
        title="Personal",
    )
    team = repository.create(
        user_id="user-a",
        upstream_run_id="team-run",
        status="success",
        source_type="audio",
        title="Team",
        scope="team",
        team_id="team-1",
    )

    from app.services import generation_job_repository as repository_module

    with repository_module.session_scope() as db:
        db.add(TeamDB(id="team-1", name="Core", owner_id="user-a"))
        db.add(TeamMemberDB(team_id="team-1", user_id="user-b", role="member"))

    assert repository.get_accessible(personal.id, "user-a") is not None
    assert repository.get_accessible(personal.id, "user-b") is None
    assert repository.get_accessible(team.id, "user-b") is not None
    assert repository.get_accessible(team.id, "user-c") is None


def test_generation_job_migration_upgrades_legacy_table(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}", future=True)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE generation_jobs (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                upstream_run_id VARCHAR(64) NOT NULL UNIQUE,
                status VARCHAR(32),
                source_type VARCHAR(32),
                title VARCHAR(255)
            )
            """
        )
    monkeypatch.setattr(db_module, "engine", engine)

    db_module._ensure_generation_jobs_table()

    columns = {column["name"] for column in inspect(engine).get_columns("generation_jobs")}
    assert {"metadata_json", "error_json", "result_json", "note_id", "finalized_at"}.issubset(columns)


def test_router_returns_local_id_and_keeps_upstream_id_internal(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    monkeypatch.setattr(note_router, "_job_repository", repository)

    response = note_router._create_local_job(
        {"id": "upstream-secret-run", "status": "queued"},
        AuthenticatedUser(user_id="user-a"),
        "audio",
        "Meeting",
    )

    assert response["task_id"] != "upstream-secret-run"
    assert "upstream-secret-run" not in str(response)
    assert repository.get_owned(response["task_id"], "user-a").upstream_run_id == "upstream-secret-run"


def test_poll_resumes_after_reload_and_persists_sanitized_partial_diagnostics(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    job = repository.create(
        user_id="user-a",
        upstream_run_id="upstream-run",
        status="pending",
        source_type="audio",
        title="Meeting",
    )

    class Service:
        def get_status(self, run_id, user_id=None):
            assert (run_id, user_id) == ("upstream-run", "user-a")
            return {
                "status": "transcribing",
                "message": "Diarizing audio",
                "metadata": {
                    "upstreamStatus": "running",
                    "childStages": [{"kind": "speaker_transcript", "status": "running"}],
                    "resolvedModels": {"diarization": "sortformer"},
                },
            }

    monkeypatch.setattr(note_router, "_job_repository", GenerationJobRepository())
    monkeypatch.setattr(note_router, "_note_service", Service())

    response = note_router.get_task_status(job.id, AuthenticatedUser(user_id="user-a"))
    stored = GenerationJobRepository().get_owned(job.id, "user-a")

    assert response.status == "transcribing"
    assert response.metadata["childStages"] == [{"kind": "speaker_transcript", "status": "running"}]
    assert "upstream-run" not in str(response.model_dump())
    assert stored.status == "transcribing"
    assert stored.metadata == response.metadata


def test_transient_poll_failure_keeps_last_durable_snapshot(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    job = repository.create(
        user_id="user-a",
        upstream_run_id="upstream-run",
        status="processing",
        source_type="audio",
        title=None,
        metadata={"upstreamStatus": "running"},
    )

    class Service:
        def get_status(self, *_args, **_kwargs):
            raise TimeoutError("poll timed out")

    monkeypatch.setattr(note_router, "_job_repository", repository)
    monkeypatch.setattr(note_router, "_note_service", Service())

    with pytest.raises(HTTPException) as exc:
        note_router.get_task_status(job.id, AuthenticatedUser(user_id="user-a"))

    assert exc.value.status_code == 502
    assert "retry polling" in exc.value.detail
    unchanged = repository.get_owned(job.id, "user-a")
    assert unchanged.status == "processing"
    assert unchanged.metadata == {"upstreamStatus": "running"}


def test_failed_run_persists_typed_timeout_error_without_upstream_id(tmp_path, monkeypatch):
    repository = _repository_on_temp_database(tmp_path, monkeypatch)
    job = repository.create(
        user_id="user-a",
        upstream_run_id="upstream-run",
        status="processing",
        source_type="audio",
        title=None,
    )

    class Service:
        def get_status(self, *_args, **_kwargs):
            return {
                "status": "failed",
                "message": "Summary provider timed out",
                "metadata": {"upstreamStatus": "failed"},
                "error": {
                    "code": "provider_timeout",
                    "category": "timeout",
                    "message": "Summary provider timed out",
                    "retryable": True,
                },
            }

    monkeypatch.setattr(note_router, "_job_repository", repository)
    monkeypatch.setattr(note_router, "_note_service", Service())

    response = note_router.get_task_status(job.id, AuthenticatedUser(user_id="user-a"))
    stored = repository.get_owned(job.id, "user-a")

    assert response.status == "failed"
    assert response.metadata["error"]["category"] == "timeout"
    assert stored.error["retryable"] is True
    assert "upstream-run" not in str(response.model_dump())


def test_note_service_sanitizes_child_ids_and_secret_like_diagnostics():
    class Client:
        def get_run(self, run_id):
            return {
                "id": run_id,
                "status": "running",
                "progress": {"stage": "speaker_transcript", "message": "Working"},
                "childRuns": [{"id": "child-secret-id", "kind": "speaker_transcript", "status": "running"}],
                "resolvedModels": {"asr": "sensevoice", "apiKey": "must-not-leak"},
                "timings": {"elapsedMs": 12, "requestId": "request-secret"},
            }

    status = NoteService(vilab_client=Client()).get_status("upstream-secret-id")

    assert status["status"] == "transcribing"
    assert status["metadata"]["childStages"] == [{"kind": "speaker_transcript", "status": "running"}]
    assert status["metadata"]["resolvedModels"] == {"asr": "sensevoice"}
    assert "secret" not in str(status["metadata"])


def test_local_persistence_failure_cancels_orphaned_upstream_run(monkeypatch):
    class Repository:
        def create(self, **_kwargs):
            raise RuntimeError("database unavailable")

    class Service:
        def __init__(self):
            self.cancelled = []

        def cancel(self, run_id, user_id=None):
            self.cancelled.append((run_id, user_id))

    service = Service()
    monkeypatch.setattr(note_router, "_job_repository", Repository())
    monkeypatch.setattr(note_router, "_note_service", service)

    with pytest.raises(RuntimeError):
        note_router._create_local_job(
            {"id": "upstream-run", "status": "queued"},
            AuthenticatedUser(user_id="user-a"),
            "audio",
            None,
        )

    assert service.cancelled == [("upstream-run", "user-a")]
