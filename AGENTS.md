# Repository Guidelines

## Architecture Overview
 VINote is a full-stack video-to-note workspace with three moving parts:

- Backend: FastAPI API for downloading media, receiving local audio/video/transcript uploads, transcribing audio when needed, generating Markdown notes, managing per-user LLM model profiles plus STT profiles, and handling team workspaces plus team membership.
- Frontend: Vite + React + TypeScript app for authentication, note generation from URL or local uploads, personal/team note browsing, editing, team management, and settings.
- Database/Auth: Postgres-backed storage plus FastAPI-issued JWT auth stored in an HttpOnly cookie.

The backend can also run as a lightweight MCP server through `mcp_server.py`.

## Project Structure
- `app/`
  - `routers/`: FastAPI route modules. `note.py` exposes generation/status APIs, browser upload generation endpoints, plus task-artifact media routes. `note_library.py` also exposes authenticated saved-note media playback routes. `teams.py` exposes authenticated team and membership APIs. `share.py` exposes authenticated share-link APIs plus public shared-note routes. `model_profiles.py` exposes authenticated LLM model-profile APIs. `stt_profiles.py` exposes authenticated STT profile APIs. `mcp.py` exposes the LAN HTTP MCP endpoint at `/mcp`.
  - `services/`: orchestration and domain services.
    - `note_service.py`: main pipeline coordinator.
    - `mcp_service.py`: shared MCP tool definitions and JSON-RPC request handling used by both the stdio server and the HTTP `/mcp` endpoint.
    - `note_media_service.py`: selects key moments, then adds heading timestamps and screenshot markers for those moments after summarization.
    - `transcription_service.py`: per-task transcriber selection, chunking, ffmpeg/ffprobe helpers.
    - `llm_service.py`: resolves LLM config from request overrides, saved model profiles, or env defaults.
    - `stt_profile_service.py`: resolves STT config from per-run selection, saved STT profiles, or env defaults.
    - `task_artifact_service.py`: persists status/result/transcript/markdown artifacts under `output/`.
    - `model_profile_*`: encrypted model profile CRUD and connection testing.
    - `stt_profile_*`: encrypted STT profile CRUD and provider-specific normalization.
    - `auth_service.py`: local email/password auth plus JWT cookie validation for protected APIs.
    - `team_repository.py`: team CRUD, membership management, and team access checks.
    - `share_service.py`: builds public share URLs and renders read-only shared-note HTML.
    - `screenshot_service.py`: replaces `[[Screenshot:mm:ss]]` placeholders with extracted frame images.
  - `downloaders/`: media download/extraction adapters built around `yt-dlp`.
  - `transcribers/`: speech-to-text providers (`groq`, `whisper`, `faster-whisper`, `sensevoice`, `sensevoice-local`).
  - `llm/`: summarizer implementations and prompt templates.
  - `models/`: Pydantic/dataclass request, response, and domain models.
- `frontend/src/`
  - `pages/`: route-level screens such as home, generator, notes, editor, login, team, and settings.
  - `components/`: reusable UI building blocks.
  - `stores/`: Zustand stores for auth, theme, note generation, note library, team workspace selection, model profiles, STT profiles, and language.
  - `lib/`: API wrapper, Supabase client, i18n copy, and model/STT profile client helpers.
- `frontend/src-tauri/`: Tauri 2 desktop shell. `tauri.conf.json` starts Vite for desktop hot reload and bundles `frontend/dist` for desktop releases.
- `supabase/`: local Supabase config, start scripts, and SQL migrations.
- `scripts/`: repository-level diagnostics and deployment smoke checks such as `check_reverse_proxy.py` for validating backend health plus frontend `/api` proxying.
- `tests/`: backend unit tests.
- `docs/plans/`: product/design implementation notes.
- `docs/.vitepress/`: standalone VitePress docs site config and navigation.
- `docs/en/`: English docs pages paired with the default Simplified Chinese docs.
- `data/`: downloaded audio/video cache and temporary transcription chunks.
- `output/`: per-task artifacts and generated Markdown notes.

## Runtime Flow
1. Frontend signs users in against FastAPI auth endpoints and browser requests carry the HttpOnly auth cookie to `/api/*`.
2. `NoteService` creates a task directory under `output/`, downloads remote media, stages an uploaded local file, or prepares an uploaded transcript, and updates `status.json`.
3. `TranscriptionService` loads the selected transcriber, optionally chunks long audio, and saves `transcript.json` when the task input is media.
4. `LLMService` resolves the active model configuration and generates Markdown from transcript segments using the requested summary mode (`default`, `accurate`, or `oneshot`). Transcript uploads skip the STT step and enter summarization directly.
5. `TranscriptionService` resolves the active STT configuration in this order: request `stt_profile_id` > signed-in user's default STT profile > `.env` `TRANSCRIBER_*` defaults.
6. `NoteMediaService` enriches the generated Markdown with section-level timestamp jump links and screenshot markers, then `ScreenshotService` downloads the full video and injects extracted frames.
7. `TaskArtifactService` writes `note.md`, `result.json`, `status.json`, and the `.task_id` mapping.
8. Frontend polls `/api/task/{task_id}`, stores the final note row together with `task_id` in the backend `notes` table under either the current personal workspace or a selected team workspace, renders key moments as timestamp-and-screenshot cards, shows the source media beside preview content when available, seeks embedded video or extracted audio when note timestamps are clicked, supports URL, local media, and local transcript generation entry points, and can optionally generate a public `/share/{token}` link for LAN access.

## Build, Run, and Dev Commands
- Backend install: `pip install -r requirements.txt`
- Optional local transcriber extras: `pip install -r requirements.local-transcribers.txt` when using `TRANSCRIBER_TYPE=faster-whisper`
- Backend dev server: `uvicorn main:app --host 0.0.0.0 --port 8900 --reload`
- Backend direct run: `python main.py`
- Frontend install: `cd frontend && npm install`
- Frontend web dev server only: `cd frontend && npm run web:dev`
- Tauri desktop hot-reload dev: `cd frontend && yarn dev` or `cd frontend && npm run dev`
- Frontend build: `cd frontend && npm run build`
- Frontend preview: `cd frontend && npm run preview`
- Desktop build: `cd frontend && npm run desktop:build`
- Docs install: `cd docs && npm install`
- Docs dev server: `cd docs && npm run docs:dev`
- Docs build: `cd docs && npm run docs:build`
- Raspberry Pi bootstrap (PowerShell): `.\deploy\pi\bootstrap-pi.ps1`
- Raspberry Pi bootstrap (Bash): `./deploy/pi/bootstrap-pi.sh`
- Raspberry Pi interactive deploy (PowerShell): `.\deploy\pi\deploy-pi-interactive.ps1`
- Raspberry Pi interactive deploy (Bash): `./deploy/pi/deploy-pi-interactive.sh`
- Raspberry Pi self-hosted runner deploy: `./deploy/pi/deploy-from-checkout.sh`
- Windows convenience launcher: `.\start-dev.ps1` or `.\start-dev.bat`

Default local ports:
- Backend API/docs: `http://127.0.0.1:8900`
- Frontend dev server: `http://localhost:3100`
- Docs dev server: `http://localhost:3101`
- Backend MCP endpoint: `http://127.0.0.1:8900/mcp`
- Tauri desktop dev window: loads `http://127.0.0.1:3100`

## Environment and Configuration
Backend settings live in root `.env` and are loaded by `app/config.py`.

Important backend variables:
- `LLM_*`: default summarizer provider/model/base URL/API key.
- `TRANSCRIBER_TYPE`: `groq`, `whisper`, `faster-whisper`, `sensevoice`, or `sensevoice-local`. This is still the fallback when no STT profile is selected.
- `TRANSCRIBER_TYPE=faster-whisper` also requires `requirements.local-transcribers.txt` to be installed.
- `GROQ_API_KEY`: required when using `groq`.
- `WHISPER_*`, `FASTER_WHISPER_COMPUTE_TYPE`, `SENSEVOICE_*`: provider-specific transcription settings.
- `SUMMARY_DEFAULT_MAX_CHARS`, `SUMMARY_DEFAULT_MAX_SEGMENTS`: thresholds that decide when `default` mode upgrades from one-shot to hierarchical summarization.
- `SUMMARY_CHUNK_MAX_CHARS`, `SUMMARY_CHUNK_MAX_SEGMENTS`, `SUMMARY_CHUNK_OVERLAP_SEGMENTS`: chunk sizing controls for hierarchical summarization.
- `APP_JWT_SECRET`, `AUTH_COOKIE_*`: backend-issued session cookie settings.
- `DATABASE_URL`: required database connection string.
- `SHARE_BASE_URL`: optional override for generated public share links; when empty, the backend tries to infer a LAN URL automatically.
- `MODEL_PROFILE_ENCRYPTION_KEY`: required to store/decrypt model profile API keys.
  - the same encryption key is also used for Groq STT profile API keys
- `CORS_ALLOW_ORIGINS`: defaults include browser dev origins plus Tauri desktop origins such as `http://tauri.localhost` and `tauri://localhost`.

Frontend Vite settings live in `frontend/.env.local`:
- `VITE_API_BASE_URL` (leave empty for the local Vite proxy, or set an absolute backend URL)
- `VITE_DOCS_BASE_URL` (optional absolute docs-site URL; when empty the app falls back to backend Swagger docs)
  - local dev special case: when the frontend runs on port `3100`, the sidebar `Document` link defaults to `http://localhost:3101/`

Tauri desktop settings live in `frontend/src-tauri/tauri.conf.json`:
- `beforeDevCommand` runs `npm run web:dev`, so Tauri desktop development gets Vite HMR.
- `beforeBuildCommand` runs `npm run web:build:tauri`, which builds static assets with `VITE_API_BASE_URL=http://localhost:8900`.
- Desktop bundles are generated under `frontend/src-tauri/target/release/bundle/`.

Raspberry Pi deployment defaults live in `deploy/pi/local.env`:
- `PI_HOST`, `PI_USER`, `PI_PORT`: SSH connection target for bootstrap and deploy scripts
- `PI_REMOTE_DIR`: remote app directory used by bootstrap and deploy scripts
- `PI_ENV_FILE`: root-level env file that should be uploaded to the Pi during deploy

GitHub Actions `dev` auto-deploy defaults:
- workflow: `.github/workflows/deploy-pi-dev.yml`
- environment: `pi-test`
- secret: `PI_TEST_ENV_FILE` contains the full root `.env` for the Pi test environment
- variables: `PI_REMOTE_DIR`, `FRONTEND_PORT`, `BACKEND_PORT`, `DOCS_PORT`
- runner labels: `self-hosted`, `linux`, `arm`, `pi`, `vinote-test`

## Testing and Verification
The repository already contains backend tests under `tests/`.

Recommended checks after code changes:
- Backend unit tests: `pytest tests`
- Reverse-proxy smoke check: `python scripts/check_reverse_proxy.py --host 127.0.0.1 --backend-port 8900 --frontend-port 3100 --docs-port 3101`
- Frontend type/build check: `cd frontend && npm run build`
- Tauri config/environment check: `cd frontend && npm run tauri -- info`
- Docs build check: `cd docs && npm run docs:build`
- Raspberry Pi CI deploy script syntax check: `bash -n deploy/pi/deploy-from-checkout.sh`
- API smoke check: open `http://127.0.0.1:8900/docs`
- MCP smoke check: `POST http://127.0.0.1:8900/mcp` with JSON-RPC `initialize` or `tools/list`
- Pipeline smoke check: run one sample generation and inspect the created folder under `output/`
- Share-link smoke check: generate one note, click Share in the editor, and open the returned `/share/{token}` URL from another LAN device

## Coding and Collaboration Rules
- Python: follow PEP 8, keep route handlers thin, keep orchestration in `app/services/`.
- TypeScript: keep `strict` compatibility intact, use `PascalCase` for components and `camelCase` for helpers/hooks.
- Prefer focused modules over large multi-purpose files.
- Do not commit generated artifacts from `data/`, `output/`, frontend build output, or local Supabase temp files unless the change explicitly targets them.
- Preserve user changes in a dirty worktree; do not revert unrelated edits.

## Documentation Maintenance
Update `README.md`, this `AGENTS.md`, or both whenever you change:
- runtime ports or startup commands
- environment variables or required services
- API routes or authentication requirements
- project structure or module ownership
- major user-facing flows in the frontend

## Versioning
- Use semantic-style versioning for user-visible releases.
- Small fixes or minor tweaks: increment the patch version, for example `0.1.0 -> 0.1.1`.
- Larger features or meaningful product-facing changes: increment the minor version, for example `0.1.0 -> 0.2.0`.
- Prefer updating versions once per merge-ready PR or release unit, not on every intermediate commit.

## Notes for Agents
- The current frontend supports local audio/video uploads and direct transcript uploads from the browser.
- The note generator UI exposes both LLM profile selection and STT profile selection; `default` summary mode still auto-switches to hierarchical summarization for longer transcripts.
- Share links are public read-only links backed by `notes.share_token` and can be disabled from the note editor.
- Saved notes are now explicitly scoped as either personal notes or team notes. Team notes require `scope="team"` plus a valid `team_id`, and any signed-in team member can open them through the normal note APIs.
- If documentation and code disagree, trust the code, then fix the documentation in the same change.
