"""Client for delegating VINote note generation to VILab Server.

VINote must not execute outsourced ASR/LLM/download/screenshot/summary logic locally.
It submits jobs to either a local or remote VILab Server; only the server URL changes.
"""
from __future__ import annotations

import json
import mimetypes
import os
import uuid
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

import httpx

from app.config import settings
from app.models.transcript import TranscriptResult


class VILabServerClientError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class VILabServerClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        client_id: str | None = None,
        desktop_id: str | None = None,
        timeout_seconds: float | None = None,
        transport: httpx.BaseTransport | None = None,
    ):
        self.base_url = (base_url or settings.vilab_server_base_url).rstrip("/")
        self.api_key = api_key if api_key is not None else self._resolve_default_api_key()
        self.client_id = client_id or settings.vilab_server_client_id or self._load_or_create_client_id()
        self.desktop_id = desktop_id or settings.vilab_server_desktop_id or self.client_id
        self.timeout_seconds = timeout_seconds or settings.vilab_server_timeout_seconds
        self._transport = transport

    def _headers(self) -> dict[str, str]:
        headers = {
            "X-VILab-Client-Id": self.client_id,
            "X-VILab-Desktop-Id": self.desktop_id,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @staticmethod
    def _resolve_default_api_key() -> str:
        if settings.vilab_server_api_key:
            return settings.vilab_server_api_key
        for candidate in VILabServerClient._initial_api_key_candidates():
            try:
                if not candidate.is_file():
                    continue
                payload = json.loads(candidate.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    for key in ("apiKey", "api_key", "key", "secret"):
                        value = payload.get(key)
                        if isinstance(value, str) and value.strip():
                            return value.strip()
            except Exception:
                continue
        return ""

    @staticmethod
    def _initial_api_key_candidates() -> list[Path]:
        configured = os.getenv("VILAB_SERVER_INITIAL_API_KEY_FILE", "").strip()
        candidates: list[Path] = []
        if configured:
            candidates.append(Path(configured))
        return candidates

    def _client(self) -> httpx.Client:
        return httpx.Client(
            base_url=self.base_url,
            timeout=self.timeout_seconds,
            transport=self._transport,
            trust_env=False,
        )

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        with self._client() as client:
            response = client.request(method, path, headers=self._headers(), **kwargs)
        if response.status_code >= 400:
            message = self._error_message(response)
            raise VILabServerClientError(message, status_code=response.status_code)
        return response

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                if isinstance(payload.get("detail"), str):
                    return payload["detail"]
                error = payload.get("error")
                if isinstance(error, dict) and isinstance(error.get("message"), str):
                    return error["message"]
                if isinstance(payload.get("message"), str):
                    return payload["message"]
        except Exception:
            pass
        return f"VILab Server request failed with HTTP {response.status_code}"

    def health(self) -> dict[str, Any]:
        try:
            response = self._request("GET", "/health")
        except VILabServerClientError:
            response = self._request("GET", "/healthz")
        return response.json()

    def list_models(self) -> dict[str, Any]:
        return self._request("GET", "/v1/models").json()

    def create_video_url_run(
        self,
        *,
        video_url: str,
        title: str | None = None,
        style: str | None = "detailed",
        summary_mode: str = "default",
        extras: str | None = None,
        output_language: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        data = self._base_form(
            source_type="video_url",
            pipeline="media_summary",
            title=title,
            style=style or "detailed",
            summary_mode=summary_mode,
            extras=extras,
            output_language=output_language,
            user_id=user_id,
        )
        data["videoUrl"] = video_url
        return self._request("POST", "/v1/notes/runs", data=data).json()

    def create_upload_run(
        self,
        *,
        file_path: Path,
        source_type: str,
        pipeline: str,
        title: str | None = None,
        style: str | None = None,
        summary_mode: str = "default",
        extras: str | None = None,
        output_language: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        data = self._base_form(
            source_type=source_type,
            pipeline=pipeline,
            title=title,
            style=style,
            summary_mode=summary_mode,
            extras=extras,
            output_language=output_language,
            user_id=user_id,
        )
        if source_type in {"audio", "meeting_recording"}:
            data["transcriptMode"] = "postprocessed"
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        with file_path.open("rb") as handle:
            files = {"file": (file_path.name, handle, content_type)}
            return self._request("POST", "/v1/notes/runs", data=data, files=files).json()

    def create_transcript_run(
        self,
        *,
        transcript: TranscriptResult,
        title: str | None = None,
        style: str | None = "meeting",
        summary_mode: str = "default",
        extras: str | None = None,
        output_language: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        data = self._base_form(
            source_type="transcript",
            pipeline="meeting_minutes" if (style or "meeting") == "meeting" else "media_summary",
            title=title,
            style=style,
            summary_mode=summary_mode,
            extras=extras,
            output_language=output_language,
            user_id=user_id,
        )
        transcript_payload = _transcript_payload(transcript)
        data["transcript"] = str(
            transcript_payload.get("full_text")
            or transcript_payload.get("fullText")
            or ""
        )
        return self._request("POST", "/v1/notes/runs", data=data).json()

    def get_run(self, run_id: str) -> dict[str, Any]:
        return self._request("GET", f"/v1/notes/runs/{run_id}").json()

    def get_speaker_transcript_run(self, run_id: str) -> dict[str, Any]:
        return self._request("GET", f"/v1/speaker-transcripts/runs/{run_id}").json()

    def get_summary_run(self, run_id: str) -> dict[str, Any]:
        return self._request("GET", f"/v1/summaries/runs/{run_id}").json()

    def cancel_run(self, run_id: str) -> dict[str, Any]:
        return self._request("POST", f"/v1/notes/runs/{run_id}/cancel").json()

    def get_artifact(self, run_id: str, path: str) -> tuple[bytes, str]:
        response = self._request("GET", f"/v1/notes/runs/{run_id}/artifacts/{path.lstrip('/')}")
        return response.content, response.headers.get("content-type", "application/octet-stream")

    def list_styles(self) -> dict[str, Any]:
        return self._request("GET", "/v1/notes/styles").json()

    def _base_form(
        self,
        *,
        source_type: str,
        pipeline: str,
        title: str | None,
        style: str | None,
        summary_mode: str,
        extras: str | None,
        output_language: str | None,
        user_id: str | None,
    ) -> dict[str, str]:
        data = {
            "sourceType": source_type,
            "pipeline": pipeline,
            "summaryMode": summary_mode,
            "outputLanguage": output_language or "auto",
            "retainArtifacts": "true",
            "desktopId": self.desktop_id,
        }
        if title:
            data["title"] = title
        if style:
            data["style"] = style
        if extras:
            data["extras"] = extras
        if user_id:
            data["userId"] = user_id
        return data

    @staticmethod
    def _load_or_create_client_id() -> str:
        path = settings.data_dir / "vilab_server_client_id"
        if path.exists():
            value = path.read_text(encoding="utf-8").strip()
            if value:
                return value
        value = f"vinote-desktop-{uuid.uuid4()}"
        path.write_text(value, encoding="utf-8")
        return value


def _transcript_payload(transcript: TranscriptResult) -> dict[str, Any]:
    if is_dataclass(transcript):
        return asdict(transcript)
    if hasattr(transcript, "model_dump"):
        return transcript.model_dump()
    if hasattr(transcript, "dict"):
        return transcript.dict()
    raise TypeError("Unsupported transcript object")
