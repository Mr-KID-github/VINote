import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import note
from app.services.task_artifact_service import TaskArtifactService


class GenerateFromUploadRouterTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.output_dir = Path(self.temp_dir.name) / "outputs"
        self.artifact_service = TaskArtifactService(output_dir=self.output_dir)
        self.app = FastAPI()
        self.app.include_router(note.router, prefix="/api")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_generate_from_upload_preserves_audio_before_background_processing(self):
        fake_note_service = SimpleNamespace(artifact_service=self.artifact_service)

        with patch.object(note, "_note_service", fake_note_service), patch.object(note, "_run_task_from_file") as run_task:
            response = self.client.post(
                "/api/generate_from_upload",
                data={
                    "title": "Meeting recording",
                    "style": "meeting",
                    "summary_mode": "default",
                    "source_type": "audio",
                    "output_language": "zh-CN",
                },
                files={"file": ("meeting.webm", b"audio-bytes", "audio/webm")},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "uploaded")
        task_id = payload["task_id"]
        task_dir = self.output_dir / task_id
        audio_path = task_dir / "media" / "source_audio.webm"
        self.assertEqual(audio_path.read_bytes(), b"audio-bytes")
        self.assertEqual(self.artifact_service.get_status(task_id)["status"], "uploaded")
        run_task.assert_called_once()
        _, kwargs = run_task.call_args
        self.assertEqual(kwargs["task_id"], task_id)
        self.assertEqual(kwargs["req"].file_path, str(audio_path))
        self.assertEqual(kwargs["req"].title, "Meeting recording")

    def test_generate_from_upload_rejects_non_audio_source_type(self):
        fake_note_service = SimpleNamespace(artifact_service=self.artifact_service)

        with patch.object(note, "_note_service", fake_note_service):
            response = self.client.post(
                "/api/generate_from_upload",
                data={"source_type": "video"},
                files={"file": ("meeting.webm", b"audio-bytes", "audio/webm")},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Only audio uploads", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
