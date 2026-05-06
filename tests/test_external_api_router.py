import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.models.api_key import APIKeyRecord
from app.routers import external_api
from app.services import external_api_auth_service


class FakeAPIKeyRepository:
    def __init__(self):
        self.record: APIKeyRecord | None = None

    def authenticate_key(self, api_key: str):
        if self.record and api_key == "user-api-key":
            return self.record
        return None


class ExternalAPIRouterTest(unittest.TestCase):
    def setUp(self):
        self.previous_key = settings.external_api_key
        self.previous_user_id = settings.external_api_user_id
        settings.external_api_key = "test-external-key"
        settings.external_api_user_id = ""
        self.api_key_repository = FakeAPIKeyRepository()
        self.repository_patch = patch.object(
            external_api_auth_service,
            "_api_key_repository",
            self.api_key_repository,
        )
        self.repository_patch.start()

        self.app = FastAPI()
        self.app.include_router(external_api.router, prefix="/api/v1")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.repository_patch.stop()
        settings.external_api_key = self.previous_key
        settings.external_api_user_id = self.previous_user_id

    def test_env_api_key_is_disabled_without_configured_key(self):
        settings.external_api_key = ""

        response = self.client.post(
            "/api/v1/generate",
            headers={"Authorization": "Bearer test-external-key"},
            json={"video_url": "https://example.com/video"},
        )

        self.assertEqual(response.status_code, 401)

    def test_generate_requires_valid_api_key(self):
        response = self.client.post(
            "/api/v1/generate",
            json={"video_url": "https://example.com/video"},
        )

        self.assertEqual(response.status_code, 401)

    def test_generate_accepts_bearer_api_key(self):
        with patch.object(external_api.note_router, "_run_task") as mock_run_task:
            response = self.client.post(
                "/api/v1/generate",
                headers={"Authorization": "Bearer test-external-key"},
                json={"video_url": "https://example.com/video"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "pending")
        self.assertEqual(mock_run_task.call_count, 1)
        self.assertIsNone(mock_run_task.call_args.kwargs["user_id"])

    def test_task_status_accepts_x_api_key(self):
        with patch.object(
            external_api.note_router,
            "get_task_status",
            return_value={"task_id": "task-1", "status": "success", "message": "", "result": None},
        ) as mock_status:
            response = self.client.get(
                "/api/v1/task/task-1",
                headers={"X-API-Key": "test-external-key"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["task_id"], "task-1")
        mock_status.assert_called_once_with("task-1")

    def test_profile_ids_require_external_user_id(self):
        with patch.object(external_api.note_router, "_run_task") as mock_run_task:
            response = self.client.post(
                "/api/v1/generate",
                headers={"Authorization": "Bearer test-external-key"},
                json={
                    "video_url": "https://example.com/video",
                    "model_profile_id": "profile-1",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(mock_run_task.call_count, 0)

    def test_external_user_id_is_passed_to_background_task(self):
        settings.external_api_user_id = "user-1"

        with patch.object(external_api.note_router, "_run_task") as mock_run_task:
            response = self.client.post(
                "/api/v1/generate",
                headers={"Authorization": "Bearer test-external-key"},
                json={"video_url": "https://example.com/video"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_run_task.call_args.kwargs["user_id"], "user-1")

    def test_user_api_key_user_id_is_passed_to_background_task(self):
        self.api_key_repository.record = APIKeyRecord(
            id="key-1",
            user_id="user-from-key",
            name="Automation",
            key_prefix="user-api-key"[:12],
            key_hash="hash",
            created_at=datetime.now(timezone.utc),
        )

        with patch.object(external_api.note_router, "_run_task") as mock_run_task:
            response = self.client.post(
                "/api/v1/generate",
                headers={"Authorization": "Bearer user-api-key"},
                json={"video_url": "https://example.com/video"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_run_task.call_args.kwargs["user_id"], "user-from-key")

    def test_user_api_key_can_only_read_own_task_status(self):
        self.api_key_repository.record = APIKeyRecord(
            id="key-1",
            user_id="user-from-key",
            name="Automation",
            key_prefix="user-api-key"[:12],
            key_hash="hash",
            created_at=datetime.now(timezone.utc),
        )

        with patch.object(
            external_api.note_router._note_service.artifact_service,
            "get_task_owner",
            return_value="another-user",
        ):
            response = self.client.get(
                "/api/v1/task/task-1",
                headers={"Authorization": "Bearer user-api-key"},
            )

        self.assertEqual(response.status_code, 404)

    def test_upload_accepts_audio_file_with_api_key(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            upload_path = Path(temp_dir) / "task_audio_demo.mp3"
            with (
                patch.object(external_api.note_router, "_build_upload_path", return_value=upload_path),
                patch.object(external_api.note_router, "_run_task_from_file") as mock_run_task,
            ):
                response = self.client.post(
                    "/api/v1/generate_from_upload",
                    headers={"Authorization": "Bearer test-external-key"},
                    files={"file": ("demo.mp3", b"fake-audio", "audio/mpeg")},
                    data={"source_type": "audio", "summary_mode": "default"},
                )

            self.assertEqual(response.status_code, 200)
            self.assertTrue(upload_path.exists())
            self.assertEqual(upload_path.read_bytes(), b"fake-audio")
            self.assertEqual(mock_run_task.call_count, 1)


if __name__ == "__main__":
    unittest.main()
