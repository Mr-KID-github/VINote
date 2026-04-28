---
title: Authentication
description: VINote session model and protected API access.
---

# Authentication

VINote uses backend-issued JWT session cookies.

## Main endpoints

- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/sign-out`
- `GET /api/auth/session`
- `GET /api/auth/me`

## Notes

- Browser clients should use `credentials: include`.
- First-load session probing should use `GET /api/auth/session`.

## External API Key

The backend also exposes `/api/v1` external endpoints. Signed-in users can create their own API keys in Settings or through:

- `GET /api/api-keys`
- `POST /api/api-keys`
- `DELETE /api/api-keys/{key_id}`

The full key is returned only once when created, and the database stores only its hash. Clients can call URL generation, upload generation, and task status endpoints with `Authorization: Bearer <key>` or `X-API-Key: <key>`.

The `.env` `EXTERNAL_API_KEY` remains available as an admin fallback. `EXTERNAL_API_USER_ID` only affects that fallback key; when set, external API calls resolve that user's default LLM/STT profiles and can pass `model_profile_id` or `stt_profile_id` owned by that user.
