import json
from pathlib import Path

import httpx

from app.models.transcript import TranscriptResult, TranscriptSegment
from app.services.note_service import NoteService
from app.services.vilab_server_client import VILabServerClient


def test_vilab_server_client_posts_video_url_run_with_identity_headers():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = dict(request.headers)
        seen["body"] = request.content.decode()
        return httpx.Response(202, json={"id": "run-1", "status": "pending"})

    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="secret",
        client_id="client-1",
        desktop_id="desktop-1",
        transport=httpx.MockTransport(handler),
    )

    payload = client.create_video_url_run(video_url="https://example.com/video", user_id="user-1")

    assert payload["id"] == "run-1"
    assert seen["headers"]["authorization"] == "Bearer secret"
    assert seen["headers"]["x-vilab-client-id"] == "client-1"
    assert "sourceType=video_url" in seen["body"]
    assert "videoUrl=https%3A%2F%2Fexample.com%2Fvideo" in seen["body"]
    assert "desktopId=desktop-1" in seen["body"]


def test_note_service_status_maps_server_result_without_local_pipeline():
    responses = {
        "GET /v1/notes/runs/run-1": {
            "id": "run-1",
            "status": "success",
            "progress": {"message": "done"},
            "summaryMode": "default",
            "result": {
                "title": "Server note",
                "markdown": "# Note",
                "duration": 12.0,
                "summaryMode": "default",
                "transcript": {
                    "language": "en",
                    "fullText": "hello",
                    "segments": [{"start": 0, "end": 1, "text": "hello"}],
                },
            },
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        key = f"{request.method} {request.url.path}"
        return httpx.Response(200, json=responses[key])

    service = NoteService(
        vilab_client=VILabServerClient(
            base_url="http://vilab.test",
            api_key="secret",
            client_id="client-1",
            transport=httpx.MockTransport(handler),
        )
    )

    status = service.get_status("run-1")
    result = service.get_result("run-1")

    assert status["status"] == "success"
    assert result["title"] == "Server note"
    assert result["markdown"] == "# Note"
    assert result["video_id"] == "run-1"


def test_vilab_server_client_serializes_transcript_text_to_server():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.content.decode()
        return httpx.Response(202, json={"id": "run-2", "status": "pending"})

    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="secret",
        client_id="client-1",
        transport=httpx.MockTransport(handler),
    )
    transcript = TranscriptResult(
        language="en",
        full_text="hello",
        segments=[TranscriptSegment(start=0, end=1, text="hello")],
    )

    payload = client.create_transcript_run(transcript=transcript, title="Transcript")

    assert payload["id"] == "run-2"
    assert "sourceType=transcript" in seen["body"]
    assert "transcriptText=" in seen["body"]
