# Repository Guidelines

## Architecture Overview

VINote is a full-stack note workspace with three moving parts:

- Backend: FastAPI API for auth, saved notes, sharing, team workspaces, VILab Server connection management, and note-generation proxying.
- Frontend: Vite + React + TypeScript app for authentication, generation requests, personal/team note browsing, editing, settings, and Tauri desktop use.
- VILab Server: the separate service that owns media download, ASR, model/provider settings, summarization, screenshots, and generated artifacts.

VINote should not reintroduce local pipeline logic. Model/provider/ASR settings belong on VILab Server.

## Project Structure

- `app/routers/`: FastAPI routes. `note.py` submits generation runs and proxies task status/artifacts. `vilab_server.py` manages the configured server connection. `note_library.py`, `share.py`, `teams.py`, `preferences.py`, and `auth.py` own VINote application data.
- `app/services/`: application services. `note_service.py` adapts VINote requests to VILab Server. `vilab_server_client.py` and `vilab_server_connection_service.py` handle server calls and user-level connection resolution.
- `app/models/`: request, response, and domain models.
- `frontend/src/`: React UI, Zustand stores, and API helpers.
- `frontend/src-tauri/`: Tauri 2 desktop shell.
- `supabase/`: local Supabase config and SQL migrations.
- `scripts/`: diagnostics and development helpers.
- `tests/`: backend tests.
- `docs/`: VitePress docs.
- `data/`: local app data and uploaded files.
- `output/`: saved/proxied task artifacts and generated Markdown notes.

## Runtime Flow

1. User signs in through FastAPI auth endpoints.
2. Frontend submits a video URL, local media upload, meeting recording, or transcript upload to VINote.
3. `NoteService` sends the request to the configured VILab Server.
4. Frontend polls VINote task endpoints, which proxy VILab Server run status/results.
5. VINote saves the final note row and keeps access to returned artifacts/media.

## Build, Run, and Dev Commands

- Backend install: `pip install -r requirements.txt`
- Backend dev server: `uvicorn main:app --host 0.0.0.0 --port 8900 --reload`
- Backend direct run: `python main.py`
- Root desktop + backend shortcut: `npm run dev`
- Root backend-only shortcut: `npm run api:dev`
- Root desktop-client-only shortcut: `npm run client:dev`
- Root browser frontend shortcut: `npm run web:dev`
- Frontend install: `cd frontend && npm install`
- Frontend web dev server only: `cd frontend && npm run web:dev`
- Tauri desktop hot-reload dev: `cd frontend && npm run dev`
- Frontend build: `cd frontend && npm run build`

Default local ports:

- Backend API/docs: `http://127.0.0.1:8900`
- Frontend dev server: `http://localhost:3100`
- Backend MCP endpoint: `http://127.0.0.1:8900/mcp`

## Environment

Backend settings live in root `.env` and are loaded by `app/config.py`.

Important variables:

- `VILAB_SERVER_BASE_URL`: local or remote VILab Server URL
- `VILAB_SERVER_API_KEY`: API key for server-backed note generation
- `VILAB_SERVER_CLIENT_ID`, `VILAB_SERVER_DESKTOP_ID`: optional stable client IDs
- `VILAB_SERVER_TIMEOUT_SECONDS`: VILab Server request timeout
- `SECRET_ENCRYPTION_KEY`: required to store user-level VILab Server credentials
- `DATABASE_URL`: backend database
- `APP_JWT_SECRET`, `AUTH_COOKIE_*`: backend-issued session cookie settings
- `SHARE_BASE_URL`: optional override for generated public share links
- `CORS_ALLOW_ORIGINS`: browser/Tauri origins allowed to call the backend

Frontend Vite settings live in `frontend/.env.local`:

- `VITE_API_BASE_URL`
- `VITE_DOCS_BASE_URL`

## Testing

Recommended checks after code changes:

- Backend unit tests: `pytest tests`
- Frontend tests: `cd frontend && npm test`
- Frontend type/build check: `cd frontend && npm run build`
- Reverse-proxy smoke check: `python scripts/check_reverse_proxy.py --host 127.0.0.1 --backend-port 8900 --frontend-port 3100 --docs-port 3101`

## Coding Notes

- Keep model/provider/ASR settings server-side.
- Keep VINote focused on auth, note storage, user/team state, UI, and VILab Server proxying.
- Do not commit generated artifacts from `data/`, `output/`, frontend build output, or local Supabase temp files unless explicitly requested.
