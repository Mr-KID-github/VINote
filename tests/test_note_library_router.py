import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.db_models import TeamDB, TeamMemberDB
from app.models.auth import AuthenticatedUser
from app.models.audio import AudioDownloadResult
from app.models.note_library import NoteCreateRequest
from app.routers import note_library
from app.services.auth_service import get_current_user
from app.services.note_repository import NoteRepository
from app.services.task_artifact_service import TaskArtifactService


class NoteLibraryRouterTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "notes-router.db"
        self.media_dir = Path(self.temp_dir.name) / "media"
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir = Path(self.temp_dir.name) / "output"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(
            f"sqlite:///{self.db_path.as_posix()}",
            future=True,
            connect_args={"check_same_thread": False},
        )
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            class_=Session,
        )
        Base.metadata.create_all(self.engine)
        self.repository = NoteRepository()
        self.artifact_service = TaskArtifactService(output_dir=self.output_dir)

        self.app = FastAPI()
        self.app.include_router(note_library.router, prefix="/api")
        self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-1")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    @contextmanager
    def _session_scope(self):
        db = self.session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def test_get_note_media_streams_task_audio(self):
        media_file = self.media_dir / "episode.mp3"
        media_file.write_bytes(b"fake-audio")
        task_dir = self.artifact_service.create_task_dir("task-audio")
        self.artifact_service.update_status(task_dir, "success", "ready")
        self.artifact_service.save_audio_meta(
            task_dir,
            AudioDownloadResult(
                file_path=str(media_file),
                title="Episode",
                duration=42.0,
                video_id="episode-1",
                platform="podcast",
            ),
        )

        with patch("app.services.note_repository.session_scope", self._session_scope), patch.object(
            note_library,
            "_artifact_service",
            self.artifact_service,
        ):
            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(
                    title="Audio note",
                    content="body",
                    video_url="https://www.xiaoyuzhoufm.com/episode/demo",
                    task_id="task-audio",
                ),
            )

            response = self.client.get(f"/api/notes/{note.id}/media")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"fake-audio")
        self.assertEqual(response.headers["content-type"], "audio/mpeg")

    def test_get_note_media_serves_declared_original_instead_of_derived_audio(self):
        source_file = self.media_dir / "recording.m4a"
        source_file.write_bytes(b"exact-original")
        task_dir = self.artifact_service.create_task_dir("task-original")
        original = self.artifact_service.stage_source_media(task_dir, str(source_file), media_kind="audio")
        (task_dir / "media" / "recording.vilab.wav").write_bytes(b"derived-normalized")
        self.artifact_service.update_status(task_dir, "success", "ready")

        with patch("app.services.note_repository.session_scope", self._session_scope), patch.object(
            note_library, "_artifact_service", self.artifact_service
        ):
            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(
                    title="Original audio note",
                    content="body",
                    source_type="audio",
                    task_id="task-original",
                ),
            )
            response = self.client.get(f"/api/notes/{note.id}/media")
            range_response = self.client.get(
                f"/api/notes/{note.id}/media", headers={"Range": "bytes=0-4"}
            )

        self.assertEqual(original.read_bytes(), b"exact-original")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"exact-original")
        self.assertTrue(response.headers["content-type"].startswith("audio/"))
        self.assertEqual(range_response.status_code, 206)
        self.assertEqual(range_response.content, b"exact")
        self.assertEqual(range_response.headers["content-range"], "bytes 0-4/14")

    def test_get_note_media_prefers_staged_video_artifact(self):
        media_file = self.media_dir / "episode.mp3"
        media_file.write_bytes(b"fake-audio")
        task_dir = self.artifact_service.create_task_dir("task-video")
        self.artifact_service.update_status(task_dir, "success", "ready")
        staged_video = self.artifact_service.stage_media_file(task_dir, str(media_file), target_stem="source_video")
        staged_video = staged_video.with_suffix(".mp4")
        staged_video.write_bytes(b"fake-video")
        self.artifact_service.save_audio_meta(
            task_dir,
            AudioDownloadResult(
                file_path=str(media_file),
                title="Episode",
                duration=42.0,
                video_id="episode-1",
                platform="youtube",
            ),
        )

        with patch("app.services.note_repository.session_scope", self._session_scope), patch.object(
            note_library,
            "_artifact_service",
            self.artifact_service,
        ):
            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(
                    title="Video note",
                    content="body",
                    video_url="https://www.youtube.com/watch?v=demo",
                    task_id="task-video",
                ),
            )

            response = self.client.get(f"/api/notes/{note.id}/media")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"fake-video")
        self.assertEqual(response.headers["content-type"], "video/mp4")

    def test_get_note_media_returns_404_without_task_id(self):
        with patch("app.services.note_repository.session_scope", self._session_scope), patch.object(
            note_library,
            "_artifact_service",
            self.artifact_service,
        ):
            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="No media", content="body"),
            )

            response = self.client.get(f"/api/notes/{note.id}/media")

        self.assertEqual(response.status_code, 404)

    def test_get_note_pipeline_resolves_private_upstream_run_after_note_access(self):
        trace = {
            "stageRunIds": {"speakerTranscript": "speaker-run", "summary": "summary-run", "note": "note-run"},
            "transcript": {"turns": []},
            "summary": {"fallbackUsed": False},
            "note": {"status": "success"},
        }
        jobs = SimpleNamespace(get_accessible=lambda task_id, user_id: SimpleNamespace(upstream_run_id="note-run"))
        service = SimpleNamespace(get_pipeline_trace=lambda run_id, user_id=None: trace)

        with patch("app.services.note_repository.session_scope", self._session_scope), patch.object(
            note_library, "_jobs", jobs
        ), patch.object(note_library, "_note_service", service):
            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Pipeline note", content="body", task_id="local-job"),
            )
            response = self.client.get(f"/api/notes/{note.id}/pipeline")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {**trace, "speakerAliases": {}})

    def test_speaker_aliases_persist_and_overlay_pipeline_turns(self):
        jobs = SimpleNamespace(get_accessible=lambda *_args: SimpleNamespace(upstream_run_id="note-run"))
        service = SimpleNamespace(
            get_pipeline_trace=lambda *_args, **_kwargs: {
                "stageRunIds": {"note": "note-run"},
                "transcript": {"turns": [{"speakerId": "speaker_01", "text": "Hello"}]},
                "summary": None,
                "note": {"status": "success"},
            }
        )

        with patch("app.services.note_repository.session_scope", self._session_scope), patch.object(
            note_library, "_jobs", jobs
        ), patch.object(note_library, "_note_service", service):
            note = self.repository.create_note(
                "user-1", NoteCreateRequest(title="Named speakers", content="body", task_id="local-job")
            )
            saved = self.client.patch(
                f"/api/notes/{note.id}/speakers", json={"aliases": {"speaker_01": "Susan Wang"}}
            )
            merged = self.client.patch(
                f"/api/notes/{note.id}/speakers", json={"aliases": {"speaker_02": "Daniel"}}
            )
            removed = self.client.patch(
                f"/api/notes/{note.id}/speakers", json={"aliases": {"speaker_02": ""}}
            )
            pipeline = self.client.get(f"/api/notes/{note.id}/pipeline")

        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json(), {"aliases": {"speaker_01": "Susan Wang"}})
        self.assertEqual(merged.json(), {"aliases": {"speaker_01": "Susan Wang", "speaker_02": "Daniel"}})
        self.assertEqual(removed.json(), {"aliases": {"speaker_01": "Susan Wang"}})
        self.assertEqual(pipeline.json()["speakerAliases"], {"speaker_01": "Susan Wang"})
        self.assertEqual(pipeline.json()["transcript"]["turns"][0]["speakerLabel"], "Susan Wang")

    def test_speaker_aliases_validate_input_and_enforce_note_access(self):
        with patch("app.services.note_repository.session_scope", self._session_scope):
            note = self.repository.create_note("user-1", NoteCreateRequest(title="Private", content="body"))
            invalid = self.client.patch(
                f"/api/notes/{note.id}/speakers", json={"aliases": {"../speaker": "Invalid"}}
            )
            self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-2")
            forbidden = self.client.patch(
                f"/api/notes/{note.id}/speakers", json={"aliases": {"speaker_01": "Hidden"}}
            )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(forbidden.status_code, 404)

    def test_get_note_pipeline_returns_empty_shape_without_generation_job(self):
        with patch("app.services.note_repository.session_scope", self._session_scope), patch.object(
            note_library, "_jobs", SimpleNamespace(get_accessible=lambda *_args: None)
        ):
            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Old note", content="body", task_id="missing-job"),
            )
            response = self.client.get(f"/api/notes/{note.id}/pipeline")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"stageRunIds": {}, "transcript": None, "summary": None, "note": None},
        )

    def test_get_note_pipeline_does_not_reveal_inaccessible_note(self):
        self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-2")
        with patch("app.services.note_repository.session_scope", self._session_scope):
            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Private pipeline", content="body", task_id="private-job"),
            )
            response = self.client.get(f"/api/notes/{note.id}/pipeline")

        self.assertEqual(response.status_code, 404)

    def test_team_member_can_access_team_note(self):
        self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-2")

        with patch("app.services.note_repository.session_scope", self._session_scope):
            with self._session_scope() as db:
                team = TeamDB(id="team-1", name="Core", owner_id="user-1")
                db.add(team)
                db.add_all(
                    [
                        TeamMemberDB(team_id="team-1", user_id="user-1", role="owner"),
                        TeamMemberDB(team_id="team-1", user_id="user-2", role="member"),
                    ]
                )

            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(
                    title="Team note",
                    content="shared body",
                    scope="team",
                    team_id="team-1",
                ),
            )

            list_response = self.client.get("/api/notes?scope=team&team_id=team-1")
            self.assertEqual(list_response.status_code, 200)
            data = list_response.json()
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["id"], note.id)
            self.assertEqual(data[0]["scope"], "team")
            self.assertEqual(data[0]["team_name"], "Core")

            detail_response = self.client.get(f"/api/notes/{note.id}")
            self.assertEqual(detail_response.status_code, 200)
            self.assertEqual(detail_response.json()["id"], note.id)

    def test_non_member_cannot_create_or_open_team_note(self):
        self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-2")

        with patch("app.services.note_repository.session_scope", self._session_scope):
            with self._session_scope() as db:
                db.add(TeamDB(id="team-1", name="Core", owner_id="user-1"))
                db.add(TeamMemberDB(team_id="team-1", user_id="user-1", role="owner"))

            create_response = self.client.post(
                "/api/notes",
                json={
                    "title": "Unauthorized team note",
                    "content": "body",
                    "scope": "team",
                    "team_id": "team-1",
                },
            )
            self.assertEqual(create_response.status_code, 400)
            self.assertEqual(create_response.json()["detail"], "Team not found or access denied")

            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Private team note", content="body", scope="team", team_id="team-1"),
            )

            list_response = self.client.get("/api/notes?scope=team&team_id=team-1")
            self.assertEqual(list_response.status_code, 200)
            self.assertEqual(list_response.json(), [])

            detail_response = self.client.get(f"/api/notes/{note.id}")
            self.assertEqual(detail_response.status_code, 404)

    def test_personal_and_team_lists_are_isolated(self):
        with patch("app.services.note_repository.session_scope", self._session_scope):
            with self._session_scope() as db:
                db.add(TeamDB(id="team-1", name="Core", owner_id="user-1"))
                db.add(TeamMemberDB(team_id="team-1", user_id="user-1", role="owner"))

            personal_note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Personal note", content="personal body"),
            )
            team_note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Team note", content="team body", scope="team", team_id="team-1"),
            )

            personal_response = self.client.get("/api/notes?scope=personal")
            team_response = self.client.get("/api/notes?scope=team&team_id=team-1")

            self.assertEqual(personal_response.status_code, 200)
            self.assertEqual([item["id"] for item in personal_response.json()], [personal_note.id])
            self.assertEqual(team_response.status_code, 200)
            self.assertEqual([item["id"] for item in team_response.json()], [team_note.id])

    def test_team_member_can_update_and_delete_team_note(self):
        self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-2")

        with patch("app.services.note_repository.session_scope", self._session_scope):
            with self._session_scope() as db:
                db.add(TeamDB(id="team-1", name="Core", owner_id="user-1"))
                db.add_all(
                    [
                        TeamMemberDB(team_id="team-1", user_id="user-1", role="owner"),
                        TeamMemberDB(team_id="team-1", user_id="user-2", role="member"),
                    ]
                )

            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Team draft", content="before", scope="team", team_id="team-1"),
            )

            update_response = self.client.patch(
                f"/api/notes/{note.id}",
                json={"title": "Updated team note", "content": "after"},
            )
            self.assertEqual(update_response.status_code, 200)
            self.assertEqual(update_response.json()["title"], "Updated team note")
            self.assertEqual(update_response.json()["content"], "after")

            delete_response = self.client.delete(f"/api/notes/{note.id}")
            self.assertEqual(delete_response.status_code, 204)

            detail_response = self.client.get(f"/api/notes/{note.id}")
            self.assertEqual(detail_response.status_code, 404)

    def test_removed_member_loses_team_note_access(self):
        self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-2")

        with patch("app.services.note_repository.session_scope", self._session_scope):
            with self._session_scope() as db:
                db.add(TeamDB(id="team-1", name="Core", owner_id="user-1"))
                db.add_all(
                    [
                        TeamMemberDB(id="member-1", team_id="team-1", user_id="user-1", role="owner"),
                        TeamMemberDB(id="member-2", team_id="team-1", user_id="user-2", role="member"),
                    ]
                )

            note = self.repository.create_note(
                "user-1",
                NoteCreateRequest(title="Shared note", content="body", scope="team", team_id="team-1"),
            )
            before_response = self.client.get(f"/api/notes/{note.id}")
            self.assertEqual(before_response.status_code, 200)

            with self._session_scope() as db:
                membership = db.get(TeamMemberDB, "member-2")
                db.delete(membership)

            after_response = self.client.get(f"/api/notes/{note.id}")
            self.assertEqual(after_response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
