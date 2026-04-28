---
title: API Overview
description: VINote API grouping and reference strategy.
---

# API Overview

Use this section to understand route purpose and workflow sequencing.

Use Swagger for schema details.

Route groups:

- API Keys
  - Signed-in users create, list, and revoke their own external API keys.
- External API
  - `/api/v1` URL, upload, and task status endpoints protected by user API keys or `EXTERNAL_API_KEY`.
