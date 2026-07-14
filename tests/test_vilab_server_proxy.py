import json

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


def test_vilab_server_client_omits_authorization_when_key_is_empty():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = dict(request.headers)
        return httpx.Response(200, json={"data": []})

    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="",
        client_id="client-1",
        desktop_id="desktop-1",
        transport=httpx.MockTransport(handler),
    )

    client.list_models()

    assert "authorization" not in seen["headers"]
    assert seen["headers"]["x-vilab-client-id"] == "client-1"


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
    assert "transcript=hello" in seen["body"]


def test_vilab_server_client_requests_postprocessed_audio_transcript(tmp_path):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.content.decode("latin-1")
        return httpx.Response(202, json={"id": "run-audio", "status": "pending"})

    audio = tmp_path / "meeting.wav"
    audio.write_bytes(b"RIFF-test-audio")
    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="secret",
        client_id="client-1",
        transport=httpx.MockTransport(handler),
    )

    payload = client.create_upload_run(
        file_path=audio,
        source_type="audio",
        pipeline="meeting_minutes",
    )

    assert payload["id"] == "run-audio"
    assert 'name="transcriptMode"' in seen["body"]
    assert "postprocessed" in seen["body"]


def test_vilab_server_client_ignores_system_proxy_and_can_load_initial_public_api_key(tmp_path, monkeypatch):
    initial_key = tmp_path / "initial-api-key.json"
    initial_key.write_text(json.dumps({"apiKey": "public-key-from-file"}), encoding="utf-8")
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:7890")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
    monkeypatch.setenv("VILAB_SERVER_INITIAL_API_KEY_FILE", str(initial_key))
    monkeypatch.setattr("app.services.vilab_server_client.settings.vilab_server_api_key", "")

    client = VILabServerClient(
        base_url="http://vilab.test",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"data": []})),
    )
    built = client._client()
    try:
        assert client.api_key == "public-key-from-file"
        assert built.trust_env is False
    finally:
        built.close()


def test_initial_api_key_has_no_implicit_developer_paths(monkeypatch):
    monkeypatch.delenv("VILAB_SERVER_INITIAL_API_KEY_FILE", raising=False)

    assert VILabServerClient._initial_api_key_candidates() == []


def test_vilab_server_client_cancels_note_run():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["path"] = request.url.path
        return httpx.Response(200, json={"id": "run-1", "status": "cancelled"})

    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="secret",
        client_id="client-1",
        transport=httpx.MockTransport(handler),
    )

    response = client.cancel_run("run-1")

    assert response["status"] == "cancelled"
    assert seen == {"method": "POST", "path": "/v1/notes/runs/run-1/cancel"}


def test_note_service_pipeline_trace_returns_ui_evidence_without_credentials():
    responses = {
        "/v1/notes/runs/note-run": {
            "status": "success",
            "result": {
                "source": {
                    "speakerTranscriptRunId": "speaker-run",
                    "summaryRunId": "summary-run",
                    "authorization": "must-not-leak",
                }
            },
        },
        "/v1/speaker-transcripts/runs/speaker-run": {
            "status": "success",
            "result": {
                "rawText": "Helo",
                "rawTurns": [{"speakerId": "speaker_01", "startMs": 1000, "endMs": 2000, "text": "Helo"}],
                "finalText": "Hello",
                "cleanedTurns": [{"speakerId": "speaker_01", "startMs": 1000, "endMs": 2000, "text": "Hello"}],
                "turns": [{"speakerId": "speaker_01", "startMs": 1000, "endMs": 2000, "text": "Hello"}],
                "rawDiarization": [
                    {"speakerId": "speaker_01", "startMs": 1000, "endMs": 2000}
                ],
                "alignment": {"method": "diarize_then_asr_chunks"},
                "resolvedModels": {
                    "asrModel": "sensevoice-small",
                    "diarizationModel": "nvidia-sortformer-4spk-v2.1",
                    "postprocessProviderId": "silicon",
                    "postprocessModel": "Qwen/Qwen2.5-7B-Instruct",
                    "apiKey": "must-not-leak",
                },
                "postprocess": {"requestedMode": "postprocessed", "status": "completed"},
            },
        },
        "/v1/summaries/runs/summary-run": {
            "status": "success",
            "result": {
                "engine": "cloud",
                "fallbackUsed": False,
                "provider": {"id": "silicon", "authorization": "must-not-leak"},
            },
        },
    }

    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="secret",
        client_id="client-1",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=responses[request.url.path])),
    )

    trace = NoteService(vilab_client=client).get_pipeline_trace("note-run")

    assert trace["stageRunIds"] == {
        "speakerTranscript": "speaker-run",
        "summary": "summary-run",
        "note": "note-run",
    }
    assert trace["transcript"]["turns"][0]["speakerId"] == "speaker_01"
    assert trace["transcript"]["rawText"] == "Helo"
    assert trace["transcript"]["rawTurns"][0]["text"] == "Helo"
    assert trace["transcript"]["finalText"] == "Hello"
    assert trace["transcript"]["cleanedTurns"][0]["text"] == "Hello"
    assert trace["transcript"]["postprocess"]["status"] == "completed"
    assert trace["transcript"]["speakerSegments"][0]["speakerId"] == "speaker_01"
    assert trace["transcript"]["resolvedModels"]["asr"] == "sensevoice-small"
    assert trace["transcript"]["resolvedModels"]["diarization"] == "nvidia-sortformer-4spk-v2.1"
    assert trace["summary"]["provider"] == {"id": "silicon"}
    assert "must-not-leak" not in json.dumps(trace)


def test_note_service_pipeline_trace_keeps_missing_child_ui_safe():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/notes/runs/note-run":
            return httpx.Response(
                200,
                json={
                    "status": "success",
                    "childRuns": [{"kind": "speaker_transcript", "id": "speaker-run"}],
                    "result": {},
                },
            )
        return httpx.Response(503, text="upstream secret diagnostic")

    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="secret",
        client_id="client-1",
        transport=httpx.MockTransport(handler),
    )

    trace = NoteService(vilab_client=client).get_pipeline_trace("note-run")

    assert trace["transcript"] == {"status": "unavailable", "turns": [], "speakerSegments": []}
    assert trace["summary"] is None
    assert "upstream secret diagnostic" not in json.dumps(trace)


def test_note_service_pipeline_trace_keeps_unavailable_parent_ui_safe():
    client = VILabServerClient(
        base_url="http://vilab.test",
        api_key="secret",
        client_id="client-1",
        transport=httpx.MockTransport(lambda request: httpx.Response(503, text="private upstream failure")),
    )

    trace = NoteService(vilab_client=client).get_pipeline_trace("note-run")

    assert trace == {
        "stageRunIds": {"note": "note-run"},
        "transcript": None,
        "summary": None,
        "note": {"status": "unavailable"},
    }
