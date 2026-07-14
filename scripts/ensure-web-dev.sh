#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VITE_CLIENT_URL="http://127.0.0.1:3100/@vite/client"

if curl -fsS "$VITE_CLIENT_URL" >/dev/null 2>&1; then
  echo "[INFO] Reusing existing Vite dev server at http://127.0.0.1:3100"
  exit 0
fi

if lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[ERROR] Port 3100 is in use, but it does not look like VINote's Vite dev server."
  echo "[ERROR] Stop that process or free the port, then run npm run dev again."
  lsof -nP -iTCP:3100 -sTCP:LISTEN || true
  exit 1
fi

cd "$ROOT_DIR/frontend"
npm run web:dev
