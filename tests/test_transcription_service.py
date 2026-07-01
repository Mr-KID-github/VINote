import unittest
from unittest.mock import patch

from app.models.stt_profile import ResolvedSTTConfig
from app.models.transcript import TranscriptResult, TranscriptSegment
from app.services.transcription_service import TranscriptionService


class FakeSTTProfileService:
    def __init__(self):
        self.calls: list[tuple[str | None, str | None]] = []
        self.configs = {
            "profile-1": ResolvedSTTConfig(provider="whisper", model_name="base", device="cpu"),
            "profile-2": ResolvedSTTConfig(provider="faster-whisper", model_name="large-v3", device="cuda", compute_type="float16"),
        }

    def resolve_config(self, *, user_id: str | None, stt_profile_id: str | None):
        self.calls.append((user_id, stt_profile_id))
        return self.configs[stt_profile_id]


class FakeTranscriber:
    def __init__(self, marker: str):
        self.marker = marker

    def transcribe(self, file_path: str):
        return TranscriptResult(
            language="en",
            full_text=self.marker,
            segments=[TranscriptSegment(start=0.0, end=1.0, text=self.marker)],
        )


class TranscriptionServiceTest(unittest.TestCase):
    def test_transcribe_uses_selected_profile_per_task(self):
        fake_profile_service = FakeSTTProfileService()
        created_models: list[str] = []

        def fake_create_transcriber(config: ResolvedSTTConfig):
            marker = config.model_name or config.provider
            created_models.append(marker)
            return FakeTranscriber(marker)

        service = TranscriptionService(stt_profile_service=fake_profile_service)

        with patch("app.services.transcription_service.create_transcriber", side_effect=fake_create_transcriber), patch.object(
            service,
            "get_audio_duration",
            return_value=0.0,
        ):
            first = service.transcribe(
                audio_path="audio.mp3",
                load_cached=lambda: None,
                save_transcript=lambda result: None,
                user_id="user-1",
                stt_profile_id="profile-1",
            )
            second = service.transcribe(
                audio_path="audio.mp3",
                load_cached=lambda: None,
                save_transcript=lambda result: None,
                user_id="user-1",
                stt_profile_id="profile-2",
            )

        self.assertEqual(fake_profile_service.calls, [("user-1", "profile-1"), ("user-1", "profile-2")])
        self.assertEqual(created_models, ["base", "large-v3"])
        self.assertEqual(first.full_text, "base")
        self.assertEqual(second.full_text, "large-v3")


if __name__ == "__main__":
    unittest.main()
