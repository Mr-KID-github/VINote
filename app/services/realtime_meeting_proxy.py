import json
from urllib.parse import urlsplit, urlunsplit

from websockets.asyncio.client import connect

from app.services.vilab_server_client import VILabServerClient, VILabServerClientError


MAX_PCM_FRAME_BYTES = 32_000
MAX_SESSION_PCM_BYTES = 16_000 * 2 * 300


class RelayProtocolError(ValueError):
    def __init__(self, code: str, message: str, close_code: int):
        super().__init__(message)
        self.code = code
        self.close_code = close_code


class AudioFrameValidator:
    def __init__(self):
        self.next_sequence = 0
        self.total_pcm_bytes = 0
        self.finished = False

    def validate(self, frame: bytes) -> None:
        if self.finished:
            raise RelayProtocolError("audio_sequence_error", "Audio already finished", 1002)
        if len(frame) < 20 or frame[:4] != b"VLA2" or frame[4] != 2 or frame[5] != 1:
            raise RelayProtocolError("invalid_audio_frame", "Invalid VLA2 audio header", 1003)
        flags = frame[6]
        if flags & ~0x03 or frame[7] != 0:
            raise RelayProtocolError("invalid_audio_frame", "Invalid VLA2 flags or reserved byte", 1003)
        sequence = int.from_bytes(frame[8:16], "little")
        payload_length = int.from_bytes(frame[16:20], "little")
        if sequence != self.next_sequence or bool(flags & 0x01) != (sequence == 0):
            raise RelayProtocolError("audio_sequence_error", "Audio sequence/FIRST flag mismatch", 1002)
        if payload_length != len(frame) - 20 or payload_length > MAX_PCM_FRAME_BYTES:
            raise RelayProtocolError("audio_too_large", "Invalid or oversized PCM payload", 1009)
        if payload_length % 2:
            raise RelayProtocolError("invalid_audio_format", "PCM payload must contain complete s16 samples", 1003)
        if self.total_pcm_bytes + payload_length > MAX_SESSION_PCM_BYTES:
            raise RelayProtocolError("audio_duration_exceeded", "Audio duration exceeds the session limit", 1009)
        self.total_pcm_bytes += payload_length
        self.next_sequence += 1
        self.finished = bool(flags & 0x02)


def validate_client_control(text: str, *, started: bool) -> dict:
    try:
        value = json.loads(text)
    except Exception as exc:
        raise RelayProtocolError("invalid_message", "Control message must be JSON", 1003) from exc
    if not isinstance(value, dict):
        raise RelayProtocolError("invalid_message", "Control message must be an object", 1003)
    message_type = value.get("type")
    if not started and message_type != "session.start":
        raise RelayProtocolError("invalid_message", "First message must be session.start", 1002)
    if started and message_type not in {"audio.end", "session.cancel"}:
        raise RelayProtocolError("invalid_message", f"Unsupported control message: {message_type}", 1003)
    if message_type == "session.start":
        allowed = {"type", "audio", "language", "emitPartialSegments"}
        unsupported = sorted(set(value) - allowed)
        if unsupported:
            raise RelayProtocolError(
                "capability_unavailable",
                f"Unsupported realtime meeting options: {', '.join(unsupported)}",
                1008,
            )
        if value.get("audio") != {"encoding": "pcm_s16le", "sampleRate": 16000, "channels": 1}:
            raise RelayProtocolError("invalid_audio_format", "Meeting audio must be mono PCM s16le at 16 kHz", 1003)
        language = value.get("language")
        if language is not None and (not isinstance(language, str) or len(language) > 32):
            raise RelayProtocolError("invalid_message", "Invalid meeting language", 1003)
        sanitized = {
            "type": "session.start",
            "audio": value["audio"],
            "emitPartialSegments": bool(value.get("emitPartialSegments", True)),
        }
        if language and language.strip():
            sanitized["language"] = language.strip()
        return sanitized
    if message_type == "session.cancel":
        reason = value.get("reason")
        return {"type": "session.cancel", **({"reason": str(reason)[:128]} if reason else {})}
    return {"type": "audio.end"}


def upstream_speaker_transcript_url(base_url: str) -> str:
    parsed = urlsplit(base_url.rstrip("/"))
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise VILabServerClientError("VILab Server base URL must use http or https")
    scheme = "wss" if parsed.scheme == "https" else "ws"
    path = f"{parsed.path.rstrip('/')}/v1/speaker-transcripts/sessions"
    return urlunsplit((scheme, parsed.netloc, path, "", ""))


async def connect_upstream_speaker_session(client: VILabServerClient, *, connector=connect):
    headers = {
        "X-VILab-Client-Id": client.client_id,
        "X-VILab-Desktop-Id": client.desktop_id,
        "VILab-Contract-Version": "1.1",
    }
    if client.api_key:
        headers["Authorization"] = f"Bearer {client.api_key}"
    return await connector(
        upstream_speaker_transcript_url(client.base_url),
        additional_headers=headers,
        max_size=2 * 1024 * 1024,
        max_queue=16,
        ping_interval=20,
        ping_timeout=20,
    )


def localize_upstream_event(message: str, local_session_id: str) -> tuple[str, str | None, bool]:
    try:
        value = json.loads(message)
    except Exception as exc:
        raise RelayProtocolError("upstream_protocol_error", "Upstream event was not valid JSON", 1011) from exc
    if not isinstance(value, dict) or not isinstance(value.get("type"), str):
        raise RelayProtocolError("upstream_protocol_error", "Upstream event was not a typed object", 1011)
    upstream_session_id = value.get("sessionId") if isinstance(value.get("sessionId"), str) else None
    value["sessionId"] = local_session_id
    terminal = value["type"] in {"session.completed", "session.cancelled", "speaker_transcript.completed"} or (
        value["type"] == "error" and value.get("fatal") is True
    )
    return json.dumps(value, separators=(",", ":")), upstream_session_id, terminal
