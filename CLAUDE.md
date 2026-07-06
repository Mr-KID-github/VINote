# CLAUDE.md

This file gives coding-agent guidance for VINote.

## Project Overview

VINote is a FastAPI + React workspace for creating, saving, editing, and sharing Markdown notes. VINote does not run the media pipeline locally. Download, ASR, LLM summarization, screenshots, and note artifacts are delegated to VILab Server.

## Commands

```bash
pip install -r requirements.txt
python main.py
uvicorn main:app --host 0.0.0.0 --port 8900 --reload
cd frontend && npm run web:dev
cd frontend && npm run dev
```

## Configuration

Copy `.env.example` to `.env`.

- `VILAB_SERVER_BASE_URL`: local or remote VILab Server URL
- `VILAB_SERVER_API_KEY`: API key for server-backed note generation
- `SECRET_ENCRYPTION_KEY`: encrypts stored user-level VILab Server credentials
- `DATABASE_URL`: application database
- `APP_JWT_SECRET` and `AUTH_COOKIE_*`: browser session auth

## Architecture

VINote owns:

- auth, users, preferences, teams, saved notes, and sharing
- browser and Tauri UI
- VILab Server connection configuration
- proxying generation requests, status, results, and artifacts

VILab Server owns:

- media download
- ASR
- LLM/model/provider selection
- summarization strategies
- screenshots and generated artifacts

Primary flow:

```text
input -> VINote API -> VILab Server run -> VINote status/result proxy -> saved note
```

## Key Files

- `main.py`: backend entry point
- `app/__init__.py`: FastAPI app factory and router registration
- `app/routers/note.py`: generation request, task polling, artifact proxy
- `app/routers/vilab_server.py`: VILab Server connection APIs
- `app/services/note_service.py`: server-backed generation adapter
- `app/services/vilab_server_client.py`: VILab Server HTTP client
- `app/services/vilab_server_connection_service.py`: connection resolution and testing
- `frontend/src/pages/NoteGenerator.tsx`: note-generation UI
- `frontend/src/components/Settings/VILabServerSettingsPanel.tsx`: server connection UI
