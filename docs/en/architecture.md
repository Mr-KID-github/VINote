---
title: Architecture
description: Current VINote runtime architecture and ownership boundaries.
---

# Architecture

VINote is currently organized around one primary loop:

1. Sign in with an app-owned account.
2. Submit a video URL.
3. Let the backend download, transcribe, and summarize.
4. Save the generated Markdown note.
5. Continue editing the note in the frontend.

## Runtime Topology

```text
Frontend (React + Cookie Auth)
        |
        v
FastAPI Routers
        |
        v
Application Services
  |- AuthService
  |- NoteService
  |- ModelProfileService
  |- APIKeyService
  |- Repositories
        |
        +--> PostgreSQL
        +--> yt-dlp / ffmpeg / ffprobe
        +--> Whisper / Faster-Whisper / Groq / SenseVoice
        +--> OpenAI-compatible / Anthropic-compatible / Azure OpenAI / Ollama
        +--> output/ task artifacts
```

## Authentication And Ownership

- VINote manages app-owned user accounts and stores data in PostgreSQL.
- The backend issues JWTs and sends them to browsers through an HttpOnly cookie.
- External clients use user-created API keys or the `.env` fallback key to access `/api/v1`.
- User API keys return their full value only once when created; the database stores only hashes.
- Provider API keys are stored only on the backend; the frontend receives masked hints.
