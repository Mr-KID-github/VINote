---
title: Note Workflow
description: End-to-end lifecycle from a URL, local media file, or transcript to a Markdown note.
---

# Note Workflow

## Input modes

- Video URL: VINote submits it to VILab Server for download, transcription, and summarization
- Local audio/video: the browser uploads media with `multipart/form-data`, then VILab Server processes it
- Local transcript: the browser uploads `TXT`, `MD`, `SRT`, `VTT`, or `JSON`, then VINote submits it to VILab Server's transcript flow

## Lifecycle

1. Submit a URL, local media, or transcript generation request
2. Proxy the request to the configured VILab Server
3. Let VILab Server download, transcribe, summarize, and generate artifacts
4. Poll the VILab Server task through VINote
5. Show key moments, timestamps, screenshots, and media artifacts returned by the server
6. Persist artifacts and save the note record
