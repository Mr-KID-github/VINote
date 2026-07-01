#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_PATH="${REPO_ROOT}/.env"
TARGET_DIR="${PI_REMOTE_DIR:-/home/$(id -un)/vinote}"
FRONTEND_PORT="${FRONTEND_PORT:-3100}"
BACKEND_PORT="${BACKEND_PORT:-8900}"
DOCS_PORT="${DOCS_PORT:-3101}"
ARCHIVE_PATH="$(mktemp "${TMPDIR:-/tmp}/vinote-checkout.XXXXXX.tar.gz")"
ARCHIVE_LIST_PATH="$(mktemp "${TMPDIR:-/tmp}/vinote-checkout.XXXXXX.list")"

cleanup() {
  rm -f "${ARCHIVE_PATH}" "${ARCHIVE_LIST_PATH}"
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

detect_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=("docker" "compose")
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=("docker-compose")
    return
  fi

  echo "Missing required command: docker compose or docker-compose" >&2
  exit 1
}

main() {
  trap cleanup EXIT

  require_command git
  require_command tar
  require_command docker

  if [[ ! -f "${ENV_PATH}" ]]; then
    echo "Missing required env file: ${ENV_PATH}" >&2
    exit 1
  fi

  detect_compose_cmd

  if ! id -nG | tr ' ' '\n' | grep -qx docker; then
    echo "Runner user must belong to the docker group before deployment." >&2
    exit 1
  fi

  mkdir -p "${TARGET_DIR}" "${TARGET_DIR}/data" "${TARGET_DIR}/output"

  local repo_real
  local target_real
  repo_real="$(cd "${REPO_ROOT}" && pwd -P)"
  target_real="$(cd "${TARGET_DIR}" && pwd -P)"

  if [[ "${target_real}" == "${repo_real}" ]]; then
    echo "Refusing to deploy into the current checkout directory: ${target_real}" >&2
    exit 1
  fi

  case "${target_real}/" in
    "${repo_real}/"*)
      echo "Refusing to deploy into a subdirectory of the current checkout: ${target_real}" >&2
      exit 1
      ;;
  esac

  echo "Preparing checkout archive from ${repo_real}..."
  git -C "${REPO_ROOT}" ls-files --cached --modified --others --exclude-standard > "${ARCHIVE_LIST_PATH}"
  tar -czf "${ARCHIVE_PATH}" -C "${REPO_ROOT}" -T "${ARCHIVE_LIST_PATH}"

  echo "Refreshing target directory ${target_real}..."
  find "${target_real}" -mindepth 1 -maxdepth 1 \
    ! -name data \
    ! -name output \
    ! -name .env \
    -exec rm -rf {} +

  tar -xzf "${ARCHIVE_PATH}" -C "${target_real}"
  cp "${ENV_PATH}" "${target_real}/.env"
  mkdir -p "${target_real}/data" "${target_real}/output"

  cd "${target_real}"
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vinote}"

  echo "Starting application services with ${COMPOSE_CMD[*]}..."
  "${COMPOSE_CMD[@]}" up -d --build --remove-orphans

  echo "Current container status:"
  "${COMPOSE_CMD[@]}" ps

  echo
  echo "Deployment completed."
  echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
  echo "Backend health: http://127.0.0.1:${BACKEND_PORT}/healthz"
  echo "Docs: http://127.0.0.1:${DOCS_PORT}/"
  echo "MCP endpoint: http://127.0.0.1:${BACKEND_PORT}/mcp"
}

main "$@"
