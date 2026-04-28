---
title: API Keys
description: How signed-in users create, list, and revoke external API keys.
---

# API Keys

Signed-in users can manage external API keys in the Settings API Keys panel, or call:

- `GET /api/api-keys`
- `POST /api/api-keys`
- `DELETE /api/api-keys/{key_id}`

## Security Model

- The full key is returned only once in the create response
- The backend database stores only the key hash
- List responses only include name, prefix, creation time, and last-used time
- Revoked keys can no longer call `/api/v1`

Created keys are used for `/api/v1` external generation endpoints and automatically bind to the user's default LLM/STT profiles.
