#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-}"
USER_NAME=""
PORT=""
BRANCH=""
REPO_URL=""
REMOTE_DIR=""
ENV_FILE=""
SKIP_PUSH=""

for cmd in git ssh scp; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
done

if ! command -v tar >/dev/null 2>&1; then
  echo "Missing required command: tar" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOCAL_CONFIG_PATH="${SCRIPT_DIR}/local.env"
FRONTEND_PORT_VALUE="3100"

if [[ -f "${LOCAL_CONFIG_PATH}" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "${key}" || "${key}" =~ ^[[:space:]]*# ]] && continue
    key="${key#$'\xEF\xBB\xBF'}"
    value="$(printf '%s' "${value}" | xargs)"
    case "${key}" in
      PI_HOST) PI_HOST="${value}" ;;
      PI_USER) PI_USER="${value}" ;;
      PI_PORT) PI_PORT="${value}" ;;
      PI_BRANCH) PI_BRANCH="${value}" ;;
      PI_REPO_URL) PI_REPO_URL="${value}" ;;
      PI_REMOTE_DIR) PI_REMOTE_DIR="${value}" ;;
      PI_ENV_FILE) PI_ENV_FILE="${value}" ;;
      PI_SKIP_PUSH) PI_SKIP_PUSH="${value}" ;;
    esac
  done < "${LOCAL_CONFIG_PATH}"
fi

HOST="${HOST:-${PI_HOST:-}}"
USER_NAME="${USER_NAME:-${PI_USER:-pi}}"
PORT="${PORT:-${PI_PORT:-22}}"
BRANCH="${BRANCH:-${PI_BRANCH:-main}}"
REPO_URL="${REPO_URL:-${PI_REPO_URL:-https://github.com/Mr-KID-github/VideoNote.git}}"
ENV_FILE="${ENV_FILE:-${PI_ENV_FILE:-.env}}"
SKIP_PUSH="${SKIP_PUSH:-${PI_SKIP_PUSH:-false}}"
REMOTE_DIR="${REMOTE_DIR:-${PI_REMOTE_DIR:-/home/${USER_NAME}/vinote}}"
ENV_PATH="${REPO_ROOT}/${ENV_FILE}"
BACKEND_PORT_VALUE="8900"

if [[ -z "${HOST}" ]]; then
  echo "Missing Raspberry Pi host. Pass it as the first argument or create deploy/pi/local.env." >&2
  exit 1
fi

if [[ ! -f "${ENV_PATH}" ]]; then
  echo "Env file not found: ${ENV_PATH}" >&2
  exit 1
fi

if grep -q '^FRONTEND_PORT=' "${ENV_PATH}"; then
  FRONTEND_PORT_VALUE="$(grep '^FRONTEND_PORT=' "${ENV_PATH}" | tail -n 1 | cut -d'=' -f2-)"
fi

if grep -q '^BACKEND_PORT=' "${ENV_PATH}"; then
  BACKEND_PORT_VALUE="$(grep '^BACKEND_PORT=' "${ENV_PATH}" | tail -n 1 | cut -d'=' -f2-)"
fi

if [[ "${SKIP_PUSH}" != "true" ]] && [[ -n "$(git -C "${REPO_ROOT}" status --short)" ]]; then
  echo "Working tree is not clean. Commit or stash local changes, or rerun with PI_SKIP_PUSH=true." >&2
  exit 1
fi

if [[ "${SKIP_PUSH}" != "true" ]]; then
  echo "Pushing branch ${BRANCH} to origin..."
  git -C "${REPO_ROOT}" push origin "${BRANCH}"
fi

REMOTE="${USER_NAME}@${HOST}"
REMOTE_ENV="/tmp/vinote.env"
REMOTE_ARCHIVE="/tmp/vinote-source.tar.gz"

echo "Uploading env file to ${REMOTE}..."
scp -P "${PORT}" "${ENV_PATH}" "${REMOTE}:${REMOTE_ENV}" >/dev/null

LOCAL_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/vinote-source.XXXXXX.tar.gz")"
LOCAL_ARCHIVE_LIST="$(mktemp "${TMPDIR:-/tmp}/vinote-source.XXXXXX.list")"
trap 'rm -f "${LOCAL_ARCHIVE}" "${LOCAL_ARCHIVE_LIST}"' EXIT

echo "Creating source archive from local working tree..."
git -C "${REPO_ROOT}" ls-files --cached --modified --others --exclude-standard > "${LOCAL_ARCHIVE_LIST}"
tar -czf "${LOCAL_ARCHIVE}" -C "${REPO_ROOT}" -T "${LOCAL_ARCHIVE_LIST}"

echo "Uploading source archive to ${REMOTE}..."
scp -P "${PORT}" "${LOCAL_ARCHIVE}" "${REMOTE}:${REMOTE_ARCHIVE}" >/dev/null

echo "Deploying VINote to Raspberry Pi..."
ssh -p "${PORT}" "${REMOTE}" <<EOF
set -eu

for cmd in docker tar; do
  if ! command -v "\${cmd}" >/dev/null 2>&1; then
    echo "Missing required command on Raspberry Pi: \${cmd}" >&2
    exit 1
  fi
done

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Missing required command on Raspberry Pi: docker compose or docker-compose" >&2
  exit 1
fi

mkdir -p "${REMOTE_DIR}"
find "${REMOTE_DIR}" -mindepth 1 -maxdepth 1 \\
  ! -name data \\
  ! -name output \\
  ! -name .env \\
  -exec rm -rf {} +
tar -xzf "${REMOTE_ARCHIVE}" -C "${REMOTE_DIR}"
cp "${REMOTE_ENV}" "${REMOTE_DIR}/.env"
rm -f "${REMOTE_ARCHIVE}"
rm -f "${REMOTE_ENV}"

cd "${REMOTE_DIR}"
export COMPOSE_PROJECT_NAME=vinote
export DOCKER_DEFAULT_PLATFORM=linux/arm/v7

mkdir -p data output

\$COMPOSE_CMD up -d --build --remove-orphans
\$COMPOSE_CMD ps
EOF

echo
echo "Deployment finished."
if [[ "${FRONTEND_PORT_VALUE}" == "80" ]]; then
  echo "Open in LAN: http://${HOST}"
else
  echo "Open in LAN: http://${HOST}:${FRONTEND_PORT_VALUE}"
fi
echo "MCP endpoint: http://${HOST}:${BACKEND_PORT_VALUE}/mcp"
