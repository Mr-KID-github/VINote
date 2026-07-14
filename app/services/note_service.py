"""Server-backed note generation adapter."""
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
    def __init__(self, vilab_client: VILabServerClient | None = None, connection_service: VILabServerConnectionService | None = None):
        self._injected_client = vilab_client
        self.connection_service = connection_service or VILabServerConnectionService()

    def _client(self, user_id: str | None = None) -> VILabServerClient:
        return self._injected_client or self.connection_service.resolve_client(user_id)

    def ensure_ready_for_source(self, source_type: str, user_id: str | None = None) -> dict:
        return self.connection_service.ensure_pipeline_ready(user_id, source_type)

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

    def generate(self, video_url: str, task_id: str, style: str = "detailed", summary_mode: str = "default", extras: Optional[str] = None, output_language: str | None = None, user_id: Optional[str] = None) -> NoteResult:
        del task_id
        run = self.submit_video_url(video_url=video_url, style=style, summary_mode=summary_mode, extras=extras, output_language=output_language, user_id=user_id)
        return self._wait_for_result(run["id"])

    def generate_from_file(self, file_path: str, task_id: str, title: Optional[str] = None, style: str = "meeting", summary_mode: str = "default", extras: Optional[str] = None, output_language: str | None = None, user_id: Optional[str] = None, source_type: str = "audio") -> NoteResult:
        del task_id
        run = self.submit_file(file_path=file_path, source_type=source_type, title=title, style=style, summary_mode=summary_mode, extras=extras, output_language=output_language, user_id=user_id)
        return self._wait_for_result(run["id"])

    def generate_from_transcript(self, transcript: TranscriptResult, task_id: str, title: str | None = None, style: str = "meeting", summary_mode: str = "default", extras: Optional[str] = None, output_language: str | None = None, user_id: Optional[str] = None) -> NoteResult:
        del task_id
        run = self.submit_transcript(transcript=transcript, title=title, style=style, summary_mode=summary_mode, extras=extras, output_language=output_language, user_id=user_id)
        return self._wait_for_result(run["id"])

    def get_status(self, task_id: str, user_id: str | None = None) -> dict:
        run = self._client(user_id).get_run(task_id)
        status, message = _map_vilab_run_status(run)
        return {
            "status": status,
            "message": message,
            "run": run,
            "metadata": _public_run_metadata(run),
            "error": _public_run_error(run),
        }

    def get_result(self, task_id: str, user_id: str | None = None) -> Optional[dict]:
        run = self._client(user_id).get_run(task_id)
        if run.get("status") not in {"completed", "success"} or not run.get("result"):
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

    def get_structured_result(self, run: dict) -> dict:
        result = dict(run.get("result") or {})
        summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
        stage_runs = {
            str(child.get("kind")): str(child.get("id"))
            for child in run.get("childRuns") or []
            if isinstance(child, dict) and child.get("kind") and child.get("id")
        }
        return {
            "title": result.get("title") or summary.get("title"),
            "markdown": result.get("markdown") or "",
            "summary": summary,
            "source": result.get("source") or {},
            "style": result.get("style") or run.get("style"),
            "summaryMode": result.get("summaryMode") or run.get("summaryMode"),
            "outputLanguage": result.get("outputLanguage") or run.get("outputLanguage"),
            "stageRunIds": stage_runs,
            "diagnostics": {
                "resolvedModels": _sanitize_diagnostics(run.get("resolvedModels")),
                "timings": _sanitize_diagnostics(run.get("timings")),
            },
        }

    def get_artifact(self, task_id: str, asset_path: str, user_id: str | None = None) -> tuple[bytes, str]:
        return self._client(user_id).get_artifact(task_id, asset_path)

    def get_pipeline_trace(self, run_id: str, user_id: str | None = None) -> dict:
        client = self._client(user_id)
        try:
            parent = client.get_run(run_id)
        except Exception:
            return {
                "stageRunIds": {"note": run_id},
                "transcript": None,
                "summary": None,
                "note": {"status": "unavailable"},
            }
        children = {
            str(child.get("kind")).replace("-", "_"): str(child.get("id"))
            for child in parent.get("childRuns") or []
            if isinstance(child, dict) and child.get("kind") and child.get("id")
        }
        parent_result = parent.get("result") if isinstance(parent.get("result"), dict) else {}
        source = parent_result.get("source") if isinstance(parent_result.get("source"), dict) else {}

        def fetch(child_id: str | None, method):
            if not child_id:
                return None
            try:
                return method(child_id)
            except Exception:
                return {"status": "unavailable"}

        speaker_id = children.get("speaker_transcript") or source.get("speakerTranscriptRunId")
        summary_id = children.get("summary") or source.get("summaryRunId")
        speaker = fetch(speaker_id, client.get_speaker_transcript_run)
        summary = fetch(summary_id, client.get_summary_run)
        return {
            "stageRunIds": {
                "speakerTranscript": speaker_id,
                "summary": summary_id,
                "note": run_id,
            },
            "transcript": _speaker_trace(speaker),
            "summary": _summary_trace(summary),
            "note": _note_trace(parent),
        }

    def cancel(self, task_id: str, user_id: str | None = None) -> dict:
        return self._client(user_id).cancel_run(task_id)

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


def _map_vilab_run_status(run: dict) -> tuple[str, str]:
    upstream_status = str(run.get("status") or "").strip().lower()
    progress = run.get("progress") if isinstance(run.get("progress"), dict) else {}
    message = str(progress.get("message") or "")
    if upstream_status in {"completed", "success"}:
        return "success", message or "Note generation completed"
    if upstream_status in {"failed", "cancelled", "canceled", "error"}:
        error = _public_run_error(run)
        return "failed", str((error or {}).get("message") or message or "Note generation failed")
    stage = str(progress.get("stage") or "").lower()
    if "speaker" in stage or "transcript" in stage or "diar" in stage or "asr" in stage:
        return "transcribing", message
    if "summary" in stage or "note" in stage or "format" in stage:
        return "summarizing", message
    return ("pending" if upstream_status in {"", "queued", "pending"} else "processing"), message


def _public_run_metadata(run: dict) -> dict:
    progress = run.get("progress") if isinstance(run.get("progress"), dict) else {}
    children = run.get("childRuns") if isinstance(run.get("childRuns"), list) else []
    child_stages = [
        {
            "kind": str(child.get("kind") or ""),
            "status": str(child.get("status") or ""),
        }
        for child in children
        if isinstance(child, dict)
    ]
    metadata = {
        "upstreamStatus": str(run.get("status") or "unknown"),
        "progress": {
            key: progress[key]
            for key in ("stage", "message", "current", "total", "percent")
            if key in progress
        },
        "childStages": child_stages,
        "resolvedModels": _sanitize_diagnostics(run.get("resolvedModels")),
        "timings": _sanitize_diagnostics(run.get("timings")),
    }
    return {key: value for key, value in metadata.items() if value not in (None, {}, [])}


def _public_run_error(run: dict) -> dict | None:
    raw = run.get("error")
    if isinstance(raw, str):
        return {"message": raw}
    if not isinstance(raw, dict):
        return None
    allowed = ("code", "category", "message", "retryable", "stage", "requestId")
    error = {key: raw[key] for key in allowed if key in raw}
    return error or None


def _sanitize_diagnostics(value):
    blocked = ("key", "token", "secret", "authorization", "credential", "runid", "run_id", "requestid", "url")
    if isinstance(value, dict):
        return {
            str(key): sanitized
            for key, item in value.items()
            if not any(fragment in str(key).lower() for fragment in blocked)
            if (sanitized := _sanitize_diagnostics(item)) is not None
        }
    if isinstance(value, list):
        return [sanitized for item in value if (sanitized := _sanitize_diagnostics(item)) is not None]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return None


def _speaker_trace(run):
    if not isinstance(run, dict):
        return None
    if run.get("status") == "unavailable":
        return {"status": "unavailable", "turns": [], "speakerSegments": []}
    result = run.get("result") if isinstance(run.get("result"), dict) else {}
    plan = run.get("plan") if isinstance(run.get("plan"), dict) else {}
    execution = result.get("executionPlan") or run.get("executionPlan") or plan.get("executionPlan") or {}
    if not isinstance(execution, dict):
        execution = {}
    resolved = result.get("resolvedModels") if isinstance(result.get("resolvedModels"), dict) else {}
    raw = result.get("rawDiarization")
    speaker_segments = result.get("speakerSegments")
    if not isinstance(speaker_segments, list):
        if isinstance(raw, list):
            speaker_segments = raw
        elif isinstance(raw, dict) and isinstance(raw.get("segments"), list):
            speaker_segments = raw["segments"]
        else:
            speaker_segments = []
    turns = result.get("turns") if isinstance(result.get("turns"), list) else []
    raw_turns = result.get("rawTurns") if isinstance(result.get("rawTurns"), list) else []
    cleaned_turns = result.get("cleanedTurns") if isinstance(result.get("cleanedTurns"), list) else None
    speaker_count = result.get("speakerCount")
    if speaker_count is None:
        speaker_count = len({turn.get("speakerId") for turn in turns if isinstance(turn, dict) and turn.get("speakerId")})
    return {
        "status": run.get("status"),
        "rawText": result.get("rawText"),
        "rawTurns": _sanitize_diagnostics(raw_turns),
        "finalText": result.get("finalText") or result.get("rawText"),
        "cleanedTurns": _sanitize_diagnostics(cleaned_turns),
        "turns": _sanitize_diagnostics(turns),
        "speakerSegments": _sanitize_diagnostics(speaker_segments),
        "alignment": _sanitize_diagnostics(result.get("alignment")),
        "resolvedModels": {
            "asr": execution.get("asrModel") or resolved.get("asrModel") or result.get("asrModel"),
            "asrProvider": execution.get("asrProviderId") or resolved.get("asrProviderId") or result.get("asrProviderId"),
            "diarization": execution.get("diarizationModel") or resolved.get("diarizationModel") or result.get("diarizationModel"),
            "diarizationProvider": execution.get("diarizationProviderId") or resolved.get("diarizationProviderId") or result.get("diarizationProviderId"),
            "postprocess": resolved.get("postprocessModel"),
            "postprocessProvider": resolved.get("postprocessProviderId"),
        },
        "postprocess": _sanitize_diagnostics(result.get("postprocess")),
        "speakerCount": speaker_count,
        "timings": _sanitize_diagnostics(run.get("timings") or result.get("timings")),
    }


def _summary_trace(run):
    if not isinstance(run, dict):
        return None
    if run.get("status") == "unavailable":
        return {"status": "unavailable", "fallbackUsed": False}
    result = run.get("result") if isinstance(run.get("result"), dict) else {}
    provider = result.get("provider") if isinstance(result.get("provider"), dict) else {}
    return {
        "status": run.get("status"),
        "engine": result.get("engine"),
        "provider": _sanitize_diagnostics(provider),
        "fallbackUsed": bool(result.get("fallbackUsed") or provider.get("fallbackUsed")),
        "errorCategory": provider.get("errorCategory") or result.get("errorCategory"),
    }


def _note_trace(run):
    result = run.get("result") if isinstance(run.get("result"), dict) else {}
    source = result.get("source") if isinstance(result.get("source"), dict) else {}
    return {
        "status": run.get("status"),
        "source": _sanitize_diagnostics(source),
        "speakerTranscriptRunId": source.get("speakerTranscriptRunId"),
        "summaryRunId": source.get("summaryRunId"),
    }
