import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.models.auth import AuthenticatedUser
from app.routers import api_keys
from app.services.api_key_repository import API_KEY_PREFIX, APIKeyRepository
from app.services.auth_service import get_current_user


class APIKeyRouterTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "api-keys.db"
        self.engine = create_engine(
            f"sqlite:///{self.db_path.as_posix()}",
            future=True,
            connect_args={"check_same_thread": False},
        )
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            class_=Session,
        )
        Base.metadata.create_all(self.engine)

        self.app = FastAPI()
        self.app.include_router(api_keys.router, prefix="/api")
        self.app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(user_id="user-1")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.temp_dir.cleanup()

    @contextmanager
    def _session_scope(self):
        db = self.session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def test_user_can_create_list_and_revoke_api_key(self):
        with patch("app.services.api_key_repository.session_scope", self._session_scope):
            create_response = self.client.post("/api/api-keys", json={"name": "Zapier"})
            self.assertEqual(create_response.status_code, 201)
            created = create_response.json()
            self.assertTrue(created["api_key"].startswith(API_KEY_PREFIX))
            self.assertEqual(created["name"], "Zapier")
            self.assertEqual(created["key_prefix"], created["api_key"][:12])

            list_response = self.client.get("/api/api-keys")
            self.assertEqual(list_response.status_code, 200)
            listed = list_response.json()
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["id"], created["id"])
            self.assertNotIn("api_key", listed[0])

            delete_response = self.client.delete(f"/api/api-keys/{created['id']}")
            self.assertEqual(delete_response.status_code, 204)

            after_delete_response = self.client.get("/api/api-keys")
            self.assertEqual(after_delete_response.status_code, 200)
            self.assertEqual(after_delete_response.json(), [])

    def test_repository_authenticates_only_active_key(self):
        repository = APIKeyRepository()
        with patch("app.services.api_key_repository.session_scope", self._session_scope):
            created = repository.create_key("user-1", "CLI")
            active_record = repository.authenticate_key(created.api_key)
            self.assertIsNotNone(active_record)
            self.assertEqual(active_record.user_id, "user-1")
            self.assertIsNotNone(active_record.last_used_at)

            repository.revoke_key("user-1", created.id)
            revoked_record = repository.authenticate_key(created.api_key)
            self.assertIsNone(revoked_record)


if __name__ == "__main__":
    unittest.main()
