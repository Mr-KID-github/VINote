"""VILab's native HTTP file transcription API (not OpenAI audio)."""
import subprocess
import tempfile
from pathlib import Path

import httpx

from app.models.transcript import TranscriptResult, TranscriptSegment
from app.transcribers.base import Transcriber


class VILabTranscriber(Transcriber):
    def __init__(self, base_url: str, api_key: str, model: str | None = None, language: str | None = None, cloud_user_id: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.language = language
        self.cloud_user_id = cloud_user_id

    def transcribe(self, file_path: str) -> TranscriptResult:
        # Native streaming providers accept 16 kHz mono PCM WAV, including HTTP uploads.
        with tempfile.TemporaryDirectory(prefix="vinote-stt-") as folder:
            normalized = str(Path(folder) / "audio.wav")
            try:
                subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", file_path,
                                "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", normalized],
                               check=True, capture_output=True, timeout=600)
            except (subprocess.SubprocessError, OSError):
                raise RuntimeError("无法转换音频，请检查 ffmpeg 和输入文件") from None
            return self._transcribe_normalized(normalized)

    def _transcribe_normalized(self, file_path: str) -> TranscriptResult:
        # Streaming ASR may consume the upload at real-time speed.
        duration = float(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", file_path,
        ], text=True, timeout=30).strip())
        timeout = httpx.Timeout(max(600, duration * 1.5 + 120), connect=10)
        fields = {}
        if self.model:
            fields["model"] = self.model
        if self.language:
            fields["language"] = self.language
        if self.cloud_user_id:
            from app.services.vilab_cloud_service import VILabCloudService

            with Path(file_path).open("rb") as audio:
                payload = VILabCloudService().request(self.cloud_user_id, "POST", "/v1/asr/transcriptions",
                    files={"file": (Path(file_path).name, audio, "application/octet-stream")}, data=fields, timeout=timeout)
            return self._result(payload, file_path)
        with Path(file_path).open("rb") as audio:
            try:
                response = httpx.post(
                    f"{self.base_url}/v1/asr/transcriptions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files={"file": (Path(file_path).name, audio, "application/octet-stream")},
                    data=fields, timeout=timeout,
                )
            except httpx.RequestError:
                raise RuntimeError("VILab STT connection failed or timed out") from None
        if not response.is_success:
            # Do not echo upstream bodies: they may contain credentials.
            raise RuntimeError(f"VILab STT returned HTTP {response.status_code}")
        return self._result(response.json(), file_path)

    def _result(self, payload, file_path):
        text = str(payload.get("text") or "").strip()
        if not text:
            raise RuntimeError("VILab STT returned an empty transcript")
        duration = float(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", file_path,
        ], text=True, timeout=30).strip())
        # VILab returns whole-file text, not sentence-level timestamps.
        return TranscriptResult(
            language=payload.get("language") or self.language,
            full_text=text,
            segments=[TranscriptSegment(start=0, end=duration, text=text, raw_text=text)],
            metadata={"provider": "vliab-server", "timestamp_granularity": "file"},
        )
