from fastapi.testclient import TestClient

from app import create_app


def test_legacy_model_and_stt_profile_endpoints_are_gone_with_deprecation_headers():
    client = TestClient(create_app())

    for path in ("/api/model-profiles", "/api/stt-profiles"):
        response = client.get(path)
        assert response.status_code == 410
        assert response.headers["Deprecation"] == "true"
        assert "Deprecated" in response.headers["X-VINote-Deprecated"] or "deprecated" in response.headers["X-VINote-Deprecated"]
        assert response.json()["replacement"] == "/api/vilab-server/connection"
