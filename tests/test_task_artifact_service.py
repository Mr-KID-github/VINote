import tempfile
import unittest
from pathlib import Path

from app.models.audio import AudioDownloadResult
from app.models.note import NoteResult
from app.models.transcript import TranscriptResult, TranscriptSegment
from app.services.task_artifact_service import TaskArtifactService


class TaskArtifactServiceTest(unittest.TestCase):
    def test_status_and_result_round_trip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = TaskArtifactService(Path(temp_dir))
            task_dir = service.create_task_dir("task-123")
            service.save_task_owner(task_dir, "user-1")
            service.update_status(task_dir, "downloading", "Downloading audio...")

            final_dir = service.finalize_task_dir(task_dir, 'Demo:Title*?', "task-123")
            transcript = TranscriptResult(
                language="zh",
                full_text="hello world",
                segments=[TranscriptSegment(start=0.0, end=1.0, text="hello world")],
            )
            audio_meta = AudioDownloadResult(
                file_path="demo.mp3",
                title="Demo Title",
                duration=12.5,
                video_id="video-1",
                platform="youtube",
                cover_url=None,
                raw_info={},
            )
            result = NoteResult(
                markdown="# Demo",
                transcript=transcript,
                audio_meta=audio_meta,
                output_dir=str(final_dir),
            )

            service.save_transcript(final_dir, transcript)
            service.save_result(final_dir, result)
            service.update_status(final_dir, "success", "Done")

            loaded_transcript = service.load_transcript(final_dir)
            self.assertIsNotNone(loaded_transcript)
            self.assertEqual(loaded_transcript.full_text, "hello world")

            status_payload = service.get_status("task-123")
            result_payload = service.get_result("task-123")

            self.assertEqual(status_payload["status"], "success")
            self.assertEqual(status_payload["message"], "Done")
            self.assertEqual(result_payload["title"], "Demo Title")
            self.assertEqual(result_payload["output_path"], str(final_dir))
            self.assertIn("DemoTitle", final_dir.name)
            self.assertEqual(service.get_task_owner("task-123"), "user-1")

    def test_stage_media_file_copies_into_media_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = TaskArtifactService(Path(temp_dir))
            task_dir = service.create_task_dir("task-stage")
            source_file = Path(temp_dir) / "source.mp4"
            source_file.write_bytes(b"video")

            staged = service.stage_media_file(task_dir, str(source_file), target_stem="source_video")

            self.assertTrue(staged.exists())
            self.assertEqual(staged.parent.name, "media")
            self.assertEqual(staged.read_bytes(), b"video")


if __name__ == "__main__":
    unittest.main()
