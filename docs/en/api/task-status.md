---
title: Task Status
description: Polling model for long-running note generation.
---

# Task Status

Primary endpoints:

- `GET /api/task/{task_id}`
- `GET /api/task/{task_id}/artifacts/{asset_path}`
- `GET /api/v1/task/{task_id}`, requires a user API key or `EXTERNAL_API_KEY`
- `GET /api/v1/task/{task_id}/artifacts/{asset_path}`, requires a user API key or `EXTERNAL_API_KEY`

User-created API keys can only read external tasks started by the same user. The unbound `.env` fallback key remains available for operational troubleshooting.
