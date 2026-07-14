#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PID=""
PYTHON_BIN="${VINOTE_PYTHON:-}"

function cleanup {
  if [[ -n "$BACKEND_PID" ]]; then
    echo "[INFO] Stopping backend..."
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

function require_command {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] $1 is not installed or not on PATH."
    exit 1
  fi
}

function python_can_run_backend {
  "$1" - <<'PY' >/dev/null 2>&1
import uvicorn  # noqa: F401
import fastapi  # noqa: F401
PY
}

function resolve_python {
  local candidates=()
  local candidate
  local candidate_path

  if [[ -n "$PYTHON_BIN" ]]; then
    candidates+=("$PYTHON_BIN")
  fi

  candidates+=(
    "python3"
    "python"
    "/opt/homebrew/Caskroom/miniconda/base/bin/python3"
    "/opt/homebrew/Caskroom/miniconda/base/bin/python"
    "/opt/homebrew/opt/python@3.13/bin/python3.13"
  )

  for candidate in "${candidates[@]}"; do
    if [[ "$candidate" == */* ]]; then
      candidate_path="$candidate"
    else
      candidate_path="$(command -v "$candidate" 2>/dev/null || true)"
    fi

    if [[ -n "$candidate_path" && -x "$candidate_path" ]] && python_can_run_backend "$candidate_path"; then
      PYTHON_BIN="$candidate_path"
      echo "[INFO] Using Python: $PYTHON_BIN"
      return
    fi
  done

  echo "[ERROR] Could not find a Python environment with VINote backend dependencies."
  echo "[ERROR] Install them with: python3 -m pip install -r requirements.txt"
  echo "[ERROR] Or set VINOTE_PYTHON=/path/to/python before running npm run dev."
  exit 1
}

function backend_is_healthy {
  curl -fsS --max-time 2 "http://127.0.0.1:8900/healthz" >/dev/null 2>&1
}

function configured_database_url {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "$DATABASE_URL"
    return
  fi

  if [[ -f ".env" ]]; then
    grep -E '^DATABASE_URL=' ".env" | tail -n 1 | cut -d '=' -f 2- | sed -E 's/^["'\'']//; s/["'\'']$//' || true
  fi
}

function database_is_reachable {
  local database_url="$1"
  "$PYTHON_BIN" - "$database_url" <<'PY'
import socket
import sys
from urllib.parse import urlparse

url = urlparse(sys.argv[1])
if url.scheme.split("+", 1)[0] not in {"postgresql", "postgres"}:
    raise SystemExit(0)

host = url.hostname or "127.0.0.1"
port = url.port or 5432
try:
    with socket.create_connection((host, port), timeout=2):
        raise SystemExit(0)
except OSError:
    raise SystemExit(1)
PY
}

function ensure_dev_database {
  local database_url
  database_url="$(configured_database_url)"

  if [[ -z "$database_url" ]]; then
    return
  fi

  if [[ "$database_url" != postgresql* && "$database_url" != postgres* ]]; then
    return
  fi

  if database_is_reachable "$database_url"; then
    return
  fi

  mkdir -p "$ROOT_DIR/data"
  export DATABASE_URL="sqlite:///$ROOT_DIR/data/vinote.dev.db"
  echo "[WARN] Configured local Postgres is not reachable. Using SQLite for this dev session:"
  echo "[WARN] $DATABASE_URL"
}

function port_has_listener {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

function stop_port_listener {
  local port="$1"
  echo "[WARN] Stopping unhealthy process on port $port..."
  lsof -tiTCP:"$port" -sTCP:LISTEN | xargs kill 2>/dev/null || true
  sleep 1
  if port_has_listener "$port"; then
    lsof -tiTCP:"$port" -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

require_command curl
require_command npm
require_command cargo

cd "$ROOT_DIR"
resolve_python

if [[ ! -f ".env" && -f ".env.example" ]]; then
  echo "[WARN] Missing .env file. Creating from .env.example..."
  cp .env.example .env
  echo "[WARN] Please edit .env and fill in your API keys before using generation features."
fi

if [[ ! -d "frontend/node_modules" ]]; then
  echo "[ERROR] Frontend dependencies are missing. Run: npm --prefix frontend install"
  exit 1
fi

ensure_dev_database

if backend_is_healthy; then
  echo "[INFO] Backend already running at http://127.0.0.1:8900"
else
  if port_has_listener 8900; then
    echo "[WARN] Port 8900 is in use, but the backend health check did not respond."
    stop_port_listener 8900
  fi

  echo "[INFO] Starting backend at http://127.0.0.1:8900"
  "$PYTHON_BIN" -m uvicorn main:app --host 0.0.0.0 --port 8900 --reload &
  BACKEND_PID="$!"

  for _ in {1..40}; do
    if backend_is_healthy; then
      break
    fi
    sleep 0.5
  done

  if ! backend_is_healthy; then
    echo "[ERROR] Backend did not become healthy at http://127.0.0.1:8900/healthz"
    exit 1
  fi
fi

echo "[INFO] Starting Tauri desktop client..."
cd "$ROOT_DIR/frontend"
npm run dev
