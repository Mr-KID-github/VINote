from fastapi.testclient import TestClient

from app import create_app


def test_unauthenticated_upload_generation_returns_401_not_env_fallback_500(tmp_path):
    client = TestClient(create_app())
    audio = tmp_path / "clip.wav"
    audio.write_bytes(b"RIFF....WAVEfmt ")

    with audio.open("rb") as handle:
        response = client.post(
            "/api/generate_from_upload",
            files={"file": ("clip.wav", handle, "audio/wav")},
            data={"source_type": "audio"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"
