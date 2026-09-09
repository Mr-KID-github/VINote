import json
import time
from contextlib import contextmanager

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app.db_models import CloudAccountDB
from app.services import cloud_account_service as module


@pytest.fixture
def cloud(monkeypatch, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'accounts.db'}")
    Base.metadata.create_all(engine)
    @contextmanager
    def sessions():
        with Session(engine) as db:
            with db.begin():
                yield db
    monkeypatch.setattr(module, "session_scope", sessions)
    monkeypatch.setattr(module.settings, "cloud_auth_url", "https://vinote.supabase.co")
    monkeypatch.setattr(module.settings, "cloud_auth_public_key", "sb_publishable_test")
    monkeypatch.setattr(module.settings, "model_profile_encryption_key", "test-encryption")
    yield module.CloudAccountService(), sessions
    engine.dispose()


def test_login_stores_encrypted_personal_session_and_rejects_cross_account_link(cloud, monkeypatch):
    service, sessions = cloud
    def request(path, payload=None, token=None):
        if path == "verify":
            return {"access_token": "personal-token", "refresh_token": "refresh-secret", "expires_in": 3600}
        assert path == "user" and token == "personal-token"
        return {"id": "subject-a", "email": "a@example.com", "email_confirmed_at": "2026-09-09"}
    monkeypatch.setattr(module, "_request", request)
    result = service.verify_code("local-a", "a@example.com", "123456")
    assert result["authenticated"]
    assert "token" not in json.dumps(result)
    with sessions() as db:
        assert "personal-token" not in db.get(CloudAccountDB, "local-a").session_encrypted
    assert service.access_token("local-a") == "personal-token"
    with pytest.raises(HTTPException) as error:
        service.verify_code("local-b", "a@example.com", "123456")
    assert error.value.status_code == 409


def test_refresh_rotates_and_is_not_repeated(cloud, monkeypatch):
    service, sessions = cloud
    with sessions() as db:
        db.add(CloudAccountDB(user_id="local-a", issuer=module.settings.cloud_auth_url,
                             subject="a", email="a@example.com",
                             session_encrypted=module._cipher().encrypt(json.dumps({
                                 "access_token": "old", "refresh_token": "refresh-old", "expires_at": 0
                             }).encode()).decode()))
    calls = []
    def request(path, payload=None, token=None):
        calls.append(path)
        assert payload == {"refresh_token": "refresh-old"}
        return {"access_token": "new", "refresh_token": "refresh-new", "expires_at": time.time() + 3600}
    monkeypatch.setattr(module, "_request", request)
    assert service.access_token("local-a") == "new"
    assert service.access_token("local-a") == "new"
    assert len(calls) == 1
    monkeypatch.setattr(module.settings, "cloud_auth_url", "https://other.supabase.co")
    with pytest.raises(HTTPException):
        service.access_token("local-a")


def test_cloud_uses_user_token_not_shared_key(monkeypatch):
    from app.services.vilab_cloud_service import VILabCloudService
    import httpx
    monkeypatch.setattr(module.settings, "cloud_auth_url", "https://vinote.supabase.co")
    monkeypatch.setattr(module.settings, "vilab_server_url", "http://127.0.0.1:9878")
    monkeypatch.setattr(module.CloudAccountService, "access_token", lambda self, user: "personal-" + user)
    def request(method, url, **kwargs):
        assert kwargs["headers"]["Authorization"] == "Bearer personal-user-a"
        assert url == "http://127.0.0.1:9878/v1/models"
        return httpx.Response(200, json={"data": []})
    monkeypatch.setattr(httpx, "request", request)
    assert VILabCloudService().models("user-a") == []


def test_unified_login_preserves_existing_user_and_gets_model_token(cloud, monkeypatch):
    from app.db_models import UserDB
    service, sessions = cloud
    with sessions() as db:
        db.add(UserDB(id="existing-user", email="a@example.com", password_hash="unused"))
    def request(path, payload=None, token=None):
        if path == "verify":
            return {"access_token": "personal-token", "refresh_token": "refresh", "expires_in": 3600}
        return {"id": "verified-subject", "email": "a@example.com", "email_confirmed_at": "2026-09-09"}
    monkeypatch.setattr(module, "_request", request)
    user = service.login("a@example.com", "12345678")
    assert user.id == "existing-user"
    assert service.access_token(user.id) == "personal-token"
    assert "token" not in user.model_dump_json()
    assert service.login("a@example.com", "12345678").id == user.id


def test_unified_login_rejects_unverified_email(cloud, monkeypatch):
    service, sessions = cloud
    monkeypatch.setattr(module, "_request", lambda path, *args, **kwargs:
        {"access_token": "untrusted"} if path == "verify" else {"id": "a", "email": "a@example.com"})
    with pytest.raises(HTTPException) as error:
        service.login("a@example.com", "12345678")
    assert error.value.status_code == 403


def test_password_login_uses_supabase_password_grant(cloud, monkeypatch):
    service, _ = cloud
    calls = []
    def request(path, payload=None, token=None):
        calls.append((path, payload))
        return {"access_token": "token"}
    monkeypatch.setattr(module, "_request", request)
    monkeypatch.setattr(service, "finish_login", lambda session: "signed-in")
    assert service.password_login("a@example.com", "password") == "signed-in"
    assert calls == [("token?grant_type=password", {"email": "a@example.com", "password": "password"})]


def test_registration_sets_password_and_verifies_signup_code(cloud, monkeypatch):
    service, _ = cloud
    calls = []
    monkeypatch.setattr(module, "_request", lambda path, payload=None, token=None: calls.append((path, payload)) or {})
    monkeypatch.setattr(service, "finish_login", lambda session: "registered")
    service.register("a@example.com", "password")
    assert calls[0] == ("signup", {"email": "a@example.com", "password": "password"})
    assert service.confirm_registration("a@example.com", "12345678") == "registered"
    assert calls[1][1]["type"] == "signup"
