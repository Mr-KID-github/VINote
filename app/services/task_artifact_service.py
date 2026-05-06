"""
Task artifact storage for note generation jobs.
"""
import json
import shutil
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models.audio import AudioDownloadResult
from app.models.note import NoteResult
from app.models.transcript import TranscriptResult, TranscriptSegment


class TaskArtifactService:
    def __init__(self, output_dir: Path | None = None):
        self.output_dir = output_dir or settings.output_dir

    def create_task_dir(self, task_id: str) -> Path:
        task_dir = self.output_dir / task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        return task_dir

    def save_task_owner(self, task_dir: Path, user_id: str | None) -> None:
        if user_id:
            self.write_text(task_dir / ".owner_user_id", user_id)

    def get_task_owner(self, task_id: str) -> str | None:
        task_dir = self.find_task_dir(task_id)
        if not task_dir:
            return None

        owner_file = task_dir / ".owner_user_id"
        if not owner_file.exists():
            return None
        owner = owner_file.read_text(encoding="utf-8").strip()
        return owner or None

    def finalize_task_dir(self, task_dir: Path, title: str, task_id: str) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_title = self.sanitize_filename(title)
        new_dir_name = f"{timestamp}_{safe_title}"
        final_dir = self.output_dir / new_dir_name
        counter = 1

        while final_dir.exists():
            final_dir = self.output_dir / f"{new_dir_name}_{counter}"
            counter += 1

        task_dir.rename(final_dir)
        self.write_text(final_dir / ".task_id", task_id)
        return final_dir

    @staticmethod
    def sanitize_filename(name: str) -> str:
        invalid_chars = '<>:"/\\|?*'
        sanitized = "".join(char for char in name if char not in invalid_chars).strip()
        sanitized = sanitized or "note"
        return sanitized[:50] if len(sanitized) > 50 else sanitized

    @staticmethod
    def write_json(file_path: Path, payload: dict) -> None:
        file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def write_text(file_path: Path, content: str) -> None:
        file_path.write_text(content, encoding="utf-8")

    def load_audio_meta(self, task_dir: Path) -> Optional[AudioDownloadResult]:
        cache_file = task_dir / "audio_meta.json"
        if not cache_file.exists():
            return None
        return AudioDownloadResult(**json.loads(cache_file.read_text(encoding="utf-8")))

    def save_audio_meta(self, task_dir: Path, audio_meta: AudioDownloadResult) -> None:
        self.write_json(task_dir / "audio_meta.json", asdict(audio_meta))

    def load_transcript(self, task_dir: Path) -> Optional[TranscriptResult]:
        cache_file = task_dir / "transcript.json"
        if not cache_file.exists():
            return None

        data = json.loads(cache_file.read_text(encoding="utf-8"))
        segments = [TranscriptSegment(**segment) for segment in data.get("segments", [])]
        return TranscriptResult(
            language=data.get("language"),
            full_text=data.get("full_text", ""),
            segments=segments,
        )

    def save_transcript(self, task_dir: Path, transcript: TranscriptResult) -> None:
        self.write_json(task_dir / "transcript.json", asdict(transcript))

    def save_markdown(self, task_dir: Path, markdown: str) -> None:
        self.write_text(task_dir / "note.md", markdown)

    def stage_media_file(self, task_dir: Path, source_path: str, *, target_stem: str) -> Path:
        source = Path(source_path).resolve()
        if not source.exists() or not source.is_file():
            raise FileNotFoundError(f"Media file does not exist: {source_path}")

        media_dir = task_dir / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        target_path = media_dir / f"{target_stem}{source.suffix.lower()}"
        if source != target_path:
            shutil.copy2(source, target_path)
        return target_path

    def update_status(self, task_dir: Path, status: str, message: str = "") -> None:
        status_file = task_dir / "status.json"
        payload = {"status": status, "message": message}
        temp_file = status_file.with_suffix(".tmp")
        self.write_json(temp_file, payload)
        temp_file.replace(status_file)

    def save_result(self, task_dir: Path, result: NoteResult) -> None:
        self.write_json(
            task_dir / "result.json",
            {
                "markdown": result.markdown,
                "title": result.audio_meta.title,
                "duration": result.audio_meta.duration,
                "platform": result.audio_meta.platform,
                "video_id": result.audio_meta.video_id,
                "cover_url": result.audio_meta.cover_url,
                "summary_mode": result.summary_mode,
                "output_path": result.output_dir,
            },
        )

    def find_task_dir(self, task_id: str) -> Optional[Path]:
        direct_dir = self.output_dir / task_id
        if direct_dir.exists() and (direct_dir / "status.json").exists():
            return direct_dir

        for item in self.output_dir.iterdir():
            if not item.is_dir():
                continue

            mapping_file = item / ".task_id"
            if mapping_file.exists() and mapping_file.read_text(encoding="utf-8").strip() == task_id:
                return item

        return None

    def get_status(self, task_id: str) -> dict:
        task_dir = self.find_task_dir(task_id) or (self.output_dir / task_id)
        status_file = task_dir / "status.json"
        if not status_file.exists():
            return {"status": "not_found", "message": "Task not found"}
        return json.loads(status_file.read_text(encoding="utf-8"))

    def get_result(self, task_id: str) -> Optional[dict]:
        task_dir = self.find_task_dir(task_id) or (self.output_dir / task_id)
        result_file = task_dir / "result.json"
        if not result_file.exists():
            return None
        return json.loads(result_file.read_text(encoding="utf-8"))
