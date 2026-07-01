import tempfile
import unittest
from pathlib import Path

from app.models.audio import AudioDownloadResult
from app.models.transcript import TranscriptResult, TranscriptSegment
from app.services.note_service import NoteService
from app.services.task_artifact_service import TaskArtifactService


class FakeDownloader:
    def __init__(self, audio_path: str):
        self.audio_path = audio_path
        self.download_calls: list[tuple[str, str]] = []

    def download(self, video_url: str, output_dir: str) -> AudioDownloadResult:
        self.download_calls.append((video_url, output_dir))
        return AudioDownloadResult(
            file_path=self.audio_path,
            title="Demo Note",
            duration=42.0,
            video_id="video-123",
            platform="youtube",
            cover_url=None,
            raw_info={},
        )


class FakeTranscriptionService:
    def __init__(self):
        self.calls: list[dict] = []

    def get_audio_duration(self, file_path: str) -> float:
        return 42.0

    def transcribe(self, *, audio_path, load_cached, save_transcript, update_status=None, user_id=None, stt_profile_id=None):
        self.calls.append({
            "audio_path": audio_path,
            "user_id": user_id,
            "stt_profile_id": stt_profile_id,
        })
        cached = load_cached()
        if cached:
            return cached

        transcript = TranscriptResult(
            language="zh",
            full_text="segment body",
            segments=[TranscriptSegment(start=0.0, end=2.0, text="segment body")],
        )
        save_transcript(transcript)
        return transcript


class FakeSummarizer:
    def __init__(self):
        self.calls: list[dict] = []

    def summarize(
        self,
        title,
        segments,
        style="detailed",
        summary_mode="default",
        extras=None,
        output_language="zh-CN",
        progress_callback=None,
    ):
        self.calls.append(
            {
                "title": title,
                "segments": segments,
                "style": style,
                "summary_mode": summary_mode,
                "extras": extras,
                "output_language": output_language,
            }
        )
        return f"# {title}\n\n## Key moment\n\n{segments[0].text} [00:01]\n\n[[Screenshot:00:01]]"


class FakeLLMService:
    def __init__(self):
        self.calls: list[dict] = []
        self.summarizer = FakeSummarizer()

    def resolve_config(self, **kwargs):
        class Config:
            model_name = "fake-model"

        return Config()

    def create_summarizer(self, **kwargs):
        self.calls.append(kwargs)
        return self.summarizer


class FakeScreenshotService:
    def __init__(self):
        self.calls: list[tuple[str, str, str, str, str, str | None]] = []

    def prepare_local_video(self, *, video_url: str, task_dir: Path, task_id: str):
        video_path = task_dir / "media" / "source_video.mp4"
        video_path.parent.mkdir(parents=True, exist_ok=True)
        video_path.write_text("fake video", encoding="utf-8")
        return video_path, f"/api/task/{task_id}/artifacts/media/{video_path.name}"

    def inject_screenshots(
        self,
        *,
        video_url: str,
        markdown: str,
        task_dir: Path,
        task_id: str,
        media_url: str,
        local_video_path: Path | None = None,
    ) -> str:
        self.calls.append((video_url, markdown, str(task_dir), task_id, media_url, str(local_video_path) if local_video_path else None))
        return markdown.replace(
            "[[Screenshot:00:01]]",
            f"[![Screenshot 00:01](/api/task/{task_id}/artifacts/screenshots/frame_1.png)]({media_url}?t=1)",
        )


class NoteServiceTest(unittest.TestCase):
    def test_generate_uses_split_services_and_persists_artifacts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_file = Path(temp_dir) / "audio.mp3"
            audio_file.write_text("fake audio", encoding="utf-8")

            downloader = FakeDownloader(str(audio_file))
            transcription_service = FakeTranscriptionService()
            llm_service = FakeLLMService()
            screenshot_service = FakeScreenshotService()
            artifact_service = TaskArtifactService(Path(temp_dir) / "output")

            service = NoteService(
                downloader=downloader,
                transcription_service=transcription_service,
                llm_service=llm_service,
                artifact_service=artifact_service,
                screenshot_service=screenshot_service,
            )

            result = service.generate(
                video_url="https://example.com/video",
                task_id="task-1",
                style="detailed",
                summary_mode="accurate",
                output_language="en",
                user_id="user-1",
                stt_profile_id="stt-profile-1",
            )

            self.assertEqual(len(downloader.download_calls), 1)
            self.assertEqual(len(transcription_service.calls), 1)
            self.assertEqual(transcription_service.calls[0]["stt_profile_id"], "stt-profile-1")
            self.assertEqual(transcription_service.calls[0]["user_id"], "user-1")
            self.assertEqual(len(llm_service.calls), 1)
            self.assertEqual(llm_service.summarizer.calls[0]["output_language"], "en")
            self.assertEqual(llm_service.summarizer.calls[0]["summary_mode"], "accurate")
            self.assertEqual(len(screenshot_service.calls), 1)
            self.assertTrue(result.output_dir)
            self.assertIn("![Screenshot 00:01]", result.markdown)
            self.assertIn("/api/task/task-1/artifacts/media/source_video.mp4", result.markdown)

            saved_status = service.get_status("task-1")
            saved_result = service.get_result("task-1")

            self.assertEqual(saved_status["status"], "success")
            self.assertEqual(saved_result["title"], "Demo Note")
            self.assertEqual(saved_result["summary_mode"], "accurate")
            self.assertTrue(Path(saved_result["output_path"]).exists())


if __name__ == "__main__":
    unittest.main()
