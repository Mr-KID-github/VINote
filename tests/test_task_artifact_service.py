import tempfile
import unittest
import json
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
            service.update_status(task_dir, "downloading", "Downloading audio...")

            final_dir = service.finalize_task_dir(task_dir, 'Demo:Title*?', "task-123")
            transcript = TranscriptResult(
                language="zh",
                full_text="hello world",
                segments=[TranscriptSegment(start=0.0, end=1.0, text="hello world")],
                metadata={"provider": "local"},
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
            self.assertEqual(loaded_transcript.metadata, {"provider": "local"})

            status_payload = service.get_status("task-123")
            result_payload = service.get_result("task-123")

            self.assertEqual(status_payload["status"], "success")
            self.assertEqual(status_payload["message"], "Done")
            self.assertEqual(result_payload["title"], "Demo Title")
            self.assertEqual(result_payload["output_path"], str(final_dir))
            self.assertIn("DemoTitle", final_dir.name)

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

    def test_source_media_manifest_preserves_exact_bytes_and_rejects_escape(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = TaskArtifactService(Path(temp_dir) / "output")
            task_dir = service.create_task_dir("task-source")
            source_file = Path(temp_dir) / "meeting.webm"
            original_bytes = b"\x1aE\xdf\xa3original-recorder-bytes"
            source_file.write_bytes(original_bytes)

            staged = service.stage_source_media(task_dir, str(source_file), media_kind="audio")
            manifest = json.loads((task_dir / "source_media.json").read_text(encoding="utf-8"))

            self.assertEqual(staged.read_bytes(), original_bytes)
            self.assertEqual(manifest["relative_path"], "media/source_audio.webm")
            self.assertEqual(manifest["media_kind"], "audio")
            self.assertEqual(manifest["size_bytes"], len(original_bytes))
            self.assertEqual(service.resolve_source_media(task_dir), staged.resolve())

            staged.write_bytes(b"tampered")
            self.assertIsNone(service.resolve_source_media(task_dir))
            staged.write_bytes(original_bytes)

            escaped = Path(temp_dir) / "outside.webm"
            escaped.write_bytes(b"outside")
            (task_dir / "source_media.json").write_text(
                json.dumps({"relative_path": "../../outside.webm"}),
                encoding="utf-8",
            )
            self.assertIsNone(service.resolve_source_media(task_dir))


if __name__ == "__main__":
    unittest.main()
