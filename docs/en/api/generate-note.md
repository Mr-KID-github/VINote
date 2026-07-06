---
title: Generate Note
description: Create a note-generation task from a URL or upload input.
---

# Generate Note

Common async endpoints:

- `POST /api/generate`
- `POST /api/generate_from_upload`

Use JSON for URL input. Use `multipart/form-data` for local media or transcript uploads. VINote submits all generation work to VILab Server and returns a task ID for polling.
