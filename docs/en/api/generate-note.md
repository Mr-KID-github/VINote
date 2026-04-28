---
title: Generate Note
description: Create a note-generation task from a URL or upload input.
---

# Generate Note

Common async endpoints:

- `POST /api/generate`
- `POST /api/generate_from_upload`

Common sync endpoints:

- `POST /api/generate_sync`
- `POST /api/generate_from_upload_sync`

## External API Key Endpoints

Signed-in users can create their own API keys in Settings or by calling `POST /api/api-keys`. The full key is returned only once in the create response; later list responses only show the prefix.

Clients can then call the protected `/api/v1` endpoints:

- `POST /api/v1/generate`
- `POST /api/v1/generate_sync`
- `POST /api/v1/generate_from_upload`
- `POST /api/v1/generate_from_upload_sync`
- `GET /api/v1/task/{task_id}`
- `GET /api/v1/task/{task_id}/artifacts/{asset_path}`

Send the key as `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`. User-created keys are bound to that user and automatically resolve that user's default LLM/STT profiles.

The `.env` `EXTERNAL_API_KEY` remains available as an admin fallback. To use one user's default LLM/STT profiles with that fallback key, or to pass `model_profile_id` / `stt_profile_id`, also set `EXTERNAL_API_USER_ID` to that user's id.

Use JSON for URL input. Use `multipart/form-data` for local media or transcript uploads. When `source_type=transcript`, the backend skips STT and moves straight into summarization.
