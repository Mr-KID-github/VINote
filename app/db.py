from contextlib import contextmanager

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def _create_engine():
    connect_args: dict[str, object] = {}
    if settings.database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    return create_engine(
        settings.database_url,
        future=True,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)


def init_db():
    from app import db_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_note_share_columns()
    _ensure_note_workspace_columns()
    _ensure_vilab_server_connection_table()
    _ensure_generation_jobs_table()
    _ensure_meeting_sessions_table()


def _ensure_note_share_columns():
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("notes")}
    statements: list[str] = []

    if "share_token" not in columns:
        statements.append("ALTER TABLE notes ADD COLUMN share_token VARCHAR(64)")
    if "share_enabled" not in columns:
        statements.append("ALTER TABLE notes ADD COLUMN share_enabled BOOLEAN NOT NULL DEFAULT 0")
    if "share_created_at" not in columns:
        statements.append("ALTER TABLE notes ADD COLUMN share_created_at TIMESTAMP")

    with engine.begin() as connection:
        for statement in statements:
            connection.exec_driver_sql(statement)
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_notes_share_token ON notes (share_token)"
        )


def _ensure_note_workspace_columns():
    inspector = inspect(engine)
    if "notes" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("notes")}
    statements: list[str] = []

    if "scope" not in columns:
        statements.append("ALTER TABLE notes ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT 'personal'")
    if "team_id" not in columns:
        statements.append("ALTER TABLE notes ADD COLUMN team_id VARCHAR(36)")
    if "structured_json" not in columns:
        statements.append("ALTER TABLE notes ADD COLUMN structured_json TEXT")

    with engine.begin() as connection:
        for statement in statements:
            connection.exec_driver_sql(statement)
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_notes_team_id ON notes (team_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_notes_scope_created_at ON notes (scope, created_at)"
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_vilab_server_connection_table():
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS vilab_server_connections (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                mode VARCHAR(16) NOT NULL DEFAULT 'local',
                base_url VARCHAR(500) NOT NULL,
                api_key_encrypted TEXT NOT NULL DEFAULT '',
                status VARCHAR(32) NOT NULL DEFAULT 'untested',
                version VARCHAR(100),
                latency_ms INTEGER,
                checked_at TIMESTAMP,
                created_at TIMESTAMP,
                updated_at TIMESTAMP,
                UNIQUE(user_id)
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_vilab_server_connections_user_id ON vilab_server_connections (user_id)"
        )


def _ensure_generation_jobs_table():
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS generation_jobs (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                upstream_run_id VARCHAR(64) NOT NULL UNIQUE,
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                source_type VARCHAR(32) NOT NULL DEFAULT 'audio',
                title VARCHAR(255),
                scope VARCHAR(16) NOT NULL DEFAULT 'personal',
                team_id VARCHAR(36),
                metadata_json TEXT,
                error_json TEXT,
                result_json TEXT,
                note_id VARCHAR(36),
                finalized_at TIMESTAMP,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_generation_jobs_user_id ON generation_jobs (user_id)"
        )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_generation_jobs_upstream_run_id ON generation_jobs (upstream_run_id)"
        )

    columns = {column["name"] for column in inspect(engine).get_columns("generation_jobs")}
    additions = {
        "metadata_json": "ALTER TABLE generation_jobs ADD COLUMN metadata_json TEXT",
        "scope": "ALTER TABLE generation_jobs ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT 'personal'",
        "team_id": "ALTER TABLE generation_jobs ADD COLUMN team_id VARCHAR(36)",
        "error_json": "ALTER TABLE generation_jobs ADD COLUMN error_json TEXT",
        "result_json": "ALTER TABLE generation_jobs ADD COLUMN result_json TEXT",
        "note_id": "ALTER TABLE generation_jobs ADD COLUMN note_id VARCHAR(36)",
        "finalized_at": "ALTER TABLE generation_jobs ADD COLUMN finalized_at TIMESTAMP",
        "created_at": "ALTER TABLE generation_jobs ADD COLUMN created_at TIMESTAMP",
        "updated_at": "ALTER TABLE generation_jobs ADD COLUMN updated_at TIMESTAMP",
    }
    with engine.begin() as connection:
        for column, statement in additions.items():
            if column not in columns:
                connection.exec_driver_sql(statement)
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_generation_jobs_note_id ON generation_jobs (note_id)"
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_generation_jobs_team_id ON generation_jobs (team_id)"
        )


def _ensure_meeting_sessions_table():
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS meeting_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'created',
                connection_id VARCHAR(36),
                upstream_session_id VARCHAR(64),
                generation_job_id VARCHAR(36),
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_meeting_sessions_user_id ON meeting_sessions (user_id)"
        )

    columns = {column["name"] for column in inspect(engine).get_columns("meeting_sessions")}
    additions = {
        "connection_id": "ALTER TABLE meeting_sessions ADD COLUMN connection_id VARCHAR(36)",
        "upstream_session_id": "ALTER TABLE meeting_sessions ADD COLUMN upstream_session_id VARCHAR(64)",
        "generation_job_id": "ALTER TABLE meeting_sessions ADD COLUMN generation_job_id VARCHAR(36)",
        "created_at": "ALTER TABLE meeting_sessions ADD COLUMN created_at TIMESTAMP",
        "updated_at": "ALTER TABLE meeting_sessions ADD COLUMN updated_at TIMESTAMP",
    }
    with engine.begin() as connection:
        for column, statement in additions.items():
            if column not in columns:
                connection.exec_driver_sql(statement)
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_meeting_sessions_generation_job_id ON meeting_sessions (generation_job_id)"
        )
        connection.exec_driver_sql(
            "UPDATE meeting_sessions SET status = 'closed' WHERE status IN ('connecting', 'connected', 'active')"
        )
        connection.exec_driver_sql(
            "UPDATE meeting_sessions SET status = 'completion_failed' WHERE status = 'finalizing' AND generation_job_id IS NULL"
        )


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
