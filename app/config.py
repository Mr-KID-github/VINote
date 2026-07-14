"""
VINote configuration.
"""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE_PATH = BASE_DIR / "data" / "vinote.db"


@dataclass
class Settings:
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8900"))
    cors_allow_origins: str = os.getenv(
        "CORS_ALLOW_ORIGINS",
        ",".join(
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:3100",
                "http://127.0.0.1:3100",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://tauri.localhost",
                "https://tauri.localhost",
                "tauri://localhost",
            ]
        ),
    )

    data_dir: Path = BASE_DIR / os.getenv("DATA_DIR", "data")
    output_dir: Path = BASE_DIR / os.getenv("OUTPUT_DIR", "output")

    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}")
    app_jwt_secret: str = os.getenv("APP_JWT_SECRET", "change-me-to-a-long-random-secret")
    access_token_expire_seconds: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_SECONDS", "604800"))
    auth_cookie_name: str = os.getenv("AUTH_COOKIE_NAME", "vinote_session")
    auth_cookie_secure: bool = os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"
    auth_cookie_samesite: str = os.getenv("AUTH_COOKIE_SAMESITE", "lax")
    auth_cookie_domain: str = os.getenv("AUTH_COOKIE_DOMAIN", "")
    share_base_url: str = os.getenv("SHARE_BASE_URL", "").strip()

    vilab_server_base_url: str = os.getenv("VILAB_SERVER_BASE_URL", "http://127.0.0.1:9876").strip()
    vilab_server_api_key: str = os.getenv("VILAB_SERVER_API_KEY", "").strip()
    vilab_server_client_id: str = os.getenv("VILAB_SERVER_CLIENT_ID", "").strip()
    vilab_server_desktop_id: str = os.getenv("VILAB_SERVER_DESKTOP_ID", "").strip()
    vilab_server_timeout_seconds: int = int(os.getenv("VILAB_SERVER_TIMEOUT_SECONDS", "300"))
    upload_max_bytes: int = int(os.getenv("UPLOAD_MAX_BYTES", str(4 * 1024 * 1024 * 1024)))

    secret_encryption_key: str = os.getenv("SECRET_ENCRYPTION_KEY", "")

    def __post_init__(self):
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def cors_allow_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


settings = Settings()
