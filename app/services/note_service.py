"""Server-backed note generation adapter.

VINote no longer owns the outsourced ASR/LLM/download/screenshot/summary pipeline.
It submits jobs to local or remote VILab Server and maps server responses to the
legacy VINote API shapes while the frontend migrates.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Optional

from app.models.audio import AudioDownloadResult
from app.models.note import NoteResult
from app.models.transcript import TranscriptResult
from app.services.vilab_server_client import VILabServerClient
from app.services.vilab_server_connection_service import VILabServerConnectionService


class NoteService:
    def __init__(self, vilab_client: VILabServerClient | None = None, connection_service: VILabServerConnectionService | None = None, **_legacy_dependencies):
        self._injected_client = vilab_client
        self.connection_service = connection_service or VILabServerConnectionService()

    def _client(self, user_id: str | None = None) -> VILabServerClient:
        return self._injected_client or self.connection_service.resolve_client(user_id)

    def submit_video_url(
        self,
        *,
        video_url: str,
        title: str | None = None,
        style: str = "detailed",
        summary_mode: str = "default",
        extras: Optional[str] = None,
        output_language: str | None = None,
        user_id: Optional[str] = None,
    ) -> dict:
        return self._client(user_id).create_video_url_run(
            video_url=video_url,
            title=title,
            style=style,
            summary_mode=summary_mode,
            extras=extras,
            output_language=output_language,
            user_id=user_id,
        )

    def submit_file(
        self,
        *,
        file_path: str,
        source_type: str = "audio",
        pipeline: str | None = None,
        title: str | None = None,
        style: str = "meeting",
        summary_mode: str = "default",
        extras: Optional[str] = None,
        output_language: str | None = None,
        user_id: Optional[str] = None,
    ) -> dict:
        resolved_pipeline = pipeline or ("meeting_minutes" if style == "meeting" else "media_summary")
        return self._client(user_id).create_upload_run(
            file_path=Path(file_path),
            source_type=source_type,
            pipeline=resolved_pipeline,
            title=title,
            style=style,
            summary_mode=summary_mode,
            extras=extras,
            output_language=output_language,
            user_id=user_id,
        )

    def submit_transcript(
        self,
        *,
        transcript: TranscriptResult,
        title: str | None = None,
        style: str = "meeting",
        summary_mode: str = "default",
        extras: Optional[str] = None,
        output_language: str | None = None,
        user_id: Optional[str] = None,
    ) -> dict:
        return self._client(user_id).create_transcript_run(
            transcript=transcript,
            title=title,
            style=style,
            summary_mode=summary_mode,
            extras=extras,
            output_language=output_language,
            user_id=user_id,
        )

    # Legacy sync-style methods now delegate to VILab Server and poll briefly.
    # They never execute local ASR/LLM/download/screenshot pipeline logic.
    def generate(self, video_url: str, task_id: str, platform: str = "auto", style: str = "detailed", summary_mode: str = "default", extras: Optional[str] = None, output_language: str | None = None, model_profile_id: Optional[str] = None, stt_profile_id: Optional[str] = None, model_name: Optional[str] = None, api_key: Optional[str] = None, base_url: Optional[str] = None, user_id: Optional[str] = None) -> NoteResult:
        del task_id, platform, model_profile_id, stt_profile_id, model_name, api_key, base_url
        run = self.submit_video_url(video_url=video_url, style=style, summary_mode=summary_mode, extras=extras, output_language=output_language, user_id=user_id)
        return self._wait_for_result(run["id"])

    def generate_from_file(self, file_path: str, task_id: str, title: Optional[str] = None, style: str = "meeting", summary_mode: str = "default", extras: Optional[str] = None, output_language: str | None = None, model_profile_id: Optional[str] = None, stt_profile_id: Optional[str] = None, model_name: Optional[str] = None, api_key: Optional[str] = None, base_url: Optional[str] = None, user_id: Optional[str] = None, source_type: str = "audio") -> NoteResult:
        del task_id, model_profile_id, stt_profile_id, model_name, api_key, base_url
        run = self.submit_file(file_path=file_path, source_type=source_type, title=title, style=style, summary_mode=summary_mode, extras=extras, output_language=output_language, user_id=user_id)
        return self._wait_for_result(run["id"])

    def generate_from_transcript(self, transcript: TranscriptResult, task_id: str, title: str | None = None, style: str = "meeting", summary_mode: str = "default", extras: Optional[str] = None, output_language: str | None = None, model_profile_id: Optional[str] = None, stt_profile_id: Optional[str] = None, model_name: str | None = None, api_key: str | None = None, base_url: str | None = None, user_id: Optional[str] = None) -> NoteResult:
        del task_id, model_profile_id, stt_profile_id, model_name, api_key, base_url
        run = self.submit_transcript(transcript=transcript, title=title, style=style, summary_mode=summary_mode, extras=extras, output_language=output_language, user_id=user_id)
        return self._wait_for_result(run["id"])

    def get_status(self, task_id: str, user_id: str | None = None) -> dict:
        run = self._client(user_id).get_run(task_id)
        return {
            "status": run.get("status", "not_found"),
            "message": (run.get("progress") or {}).get("message", ""),
            "run": run,
        }

    def get_result(self, task_id: str, user_id: str | None = None) -> Optional[dict]:
        run = self._client(user_id).get_run(task_id)
        if run.get("status") != "success" or not run.get("result"):
            return None
        result = run["result"]
        return {
            "title": result.get("title", ""),
            "markdown": result.get("markdown", ""),
            "duration": result.get("duration", 0),
            "platform": result.get("sourceType") or run.get("sourceType") or "vilab-server",
            "video_id": task_id,
            "summary_mode": result.get("summaryMode") or run.get("summaryMode") or "default",
        }

    def get_artifact(self, task_id: str, asset_path: str, user_id: str | None = None) -> tuple[bytes, str]:
        return self._client(user_id).get_artifact(task_id, asset_path)

    def list_styles(self, user_id: str | None = None) -> dict:
        return self._client(user_id).list_styles()

    def _wait_for_result(self, run_id: str, timeout_seconds: float = 300.0) -> NoteResult:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            run = self._client().get_run(run_id)
            if run.get("status") == "success" and run.get("result"):
                result = run["result"]
                audio_meta = AudioDownloadResult(
                    file_path="",
                    title=result.get("title", ""),
                    duration=float(result.get("duration") or 0),
                    video_id=run_id,
                    platform="vilab-server",
                    cover_url=None,
                    raw_info={"vilab_run_id": run_id},
                )
                transcript_payload = result.get("transcript") or {"language": None, "full_text": "", "segments": []}
                transcript = _coerce_transcript(transcript_payload)
                return NoteResult(
                    markdown=result.get("markdown", ""),
                    transcript=transcript,
                    audio_meta=audio_meta,
                    summary_mode=result.get("summaryMode") or run.get("summaryMode") or "default",
                    output_dir=None,
                )
            if run.get("status") == "failed":
                raise RuntimeError(run.get("error") or (run.get("progress") or {}).get("message") or "VILab Server note generation failed")
            time.sleep(2)
        raise TimeoutError("Timed out waiting for VILab Server note generation")


def _coerce_transcript(payload: dict) -> TranscriptResult:
    from app.models.transcript import TranscriptSegment

    segments = [
        TranscriptSegment(
            start=float(item.get("start") or 0),
            end=float(item.get("end") or 0),
            text=str(item.get("text") or ""),
        )
        for item in payload.get("segments", [])
        if isinstance(item, dict)
    ]
    return TranscriptResult(
        language=payload.get("language"),
        full_text=payload.get("fullText") or payload.get("full_text") or "\n".join(segment.text for segment in segments),
        segments=segments,
    )
