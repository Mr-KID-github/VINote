---
title: Architecture
description: Current VINote runtime architecture and ownership boundaries.
---

# Architecture

VINote is currently organized around one primary loop:

1. Sign in with an app-owned account.
2. Submit a video URL.
3. Let the backend submit the generation task to VILab Server.
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
  |- VILabServerConnectionService
  |- Repositories
        |
        +--> PostgreSQL
        +--> VILab Server
        +--> output/ proxied artifacts and saved media
```
