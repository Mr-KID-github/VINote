#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-}"
USER_NAME="${2:-}"
PORT="${3:-}"
REMOTE_DIR="${4:-}"

for cmd in ssh; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_CONFIG_PATH="${SCRIPT_DIR}/local.env"

if [[ -f "${LOCAL_CONFIG_PATH}" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "${key}" || "${key}" =~ ^[[:space:]]*# ]] && continue
    key="${key#$'\xEF\xBB\xBF'}"
    value="$(printf '%s' "${value}" | xargs)"
    case "${key}" in
      PI_HOST) PI_HOST="${value}" ;;
      PI_USER) PI_USER="${value}" ;;
      PI_PORT) PI_PORT="${value}" ;;
      PI_REMOTE_DIR) PI_REMOTE_DIR="${value}" ;;
    esac
  done < "${LOCAL_CONFIG_PATH}"
fi

HOST="${HOST:-${PI_HOST:-}}"
USER_NAME="${USER_NAME:-${PI_USER:-pi}}"
PORT="${PORT:-${PI_PORT:-22}}"
REMOTE_DIR="${REMOTE_DIR:-${PI_REMOTE_DIR:-/home/${USER_NAME}/vinote}}"

if [[ -z "${HOST}" ]]; then
  echo "Missing Raspberry Pi host. Pass it as the first argument or set PI_HOST in deploy/pi/local.env." >&2
  exit 1
fi

REMOTE="${USER_NAME}@${HOST}"

echo "Bootstrapping Raspberry Pi environment on ${REMOTE}..."

ssh -tt -p "${PORT}" "${REMOTE}" \
  TARGET_USER="${USER_NAME}" TARGET_REMOTE_DIR="${REMOTE_DIR}" 'bash -s' <<'EOF'
set -eu

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  echo "Bootstrap requires sudo privileges on the Raspberry Pi." >&2
  exit 1
fi

run_root() {
  if [ -n "$SUDO" ]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

echo "[bootstrap] Target user: ${TARGET_USER}"
echo "[bootstrap] Remote directory: ${TARGET_REMOTE_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[bootstrap] Docker not found. Installing Docker Engine..."
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    run_root apt-get update
    run_root apt-get install -y curl
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  else
    wget -qO- https://get.docker.com | sh
  fi
else
  echo "[bootstrap] Docker already installed."
fi

echo "[bootstrap] Ensuring Docker service is enabled and running..."
run_root systemctl enable docker
run_root systemctl start docker

COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "[bootstrap] Docker Compose not found. Installing..."
  run_root apt-get update
  if run_root apt-get install -y docker-compose-plugin; then
    :
  else
    run_root apt-get install -y docker-compose
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    echo "Failed to install Docker Compose." >&2
    exit 1
  fi
fi

NEEDS_RELOGIN=0
if ! id -nG "${TARGET_USER}" | grep -qw docker; then
  echo "[bootstrap] Adding ${TARGET_USER} to the docker group..."
  if ! getent group docker >/dev/null 2>&1; then
    run_root groupadd docker
  fi
  run_root usermod -aG docker "${TARGET_USER}"
  NEEDS_RELOGIN=1
else
  echo "[bootstrap] ${TARGET_USER} is already in the docker group."
fi

echo "[bootstrap] Preparing remote directory..."
run_root mkdir -p "${TARGET_REMOTE_DIR}" "${TARGET_REMOTE_DIR}/data" "${TARGET_REMOTE_DIR}/output"
run_root chown -R "${TARGET_USER}:${TARGET_USER}" "${TARGET_REMOTE_DIR}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is still unavailable after bootstrap." >&2
  exit 1
fi

if [[ "${COMPOSE_CMD}" == "docker compose" ]]; then
  docker compose version >/dev/null 2>&1
else
  docker-compose version >/dev/null 2>&1
fi

echo "BOOTSTRAP_DOCKER_OK=1"
echo "BOOTSTRAP_COMPOSE_OK=1"
echo "BOOTSTRAP_COMPOSE_CMD=${COMPOSE_CMD}"
echo "BOOTSTRAP_REMOTE_DIR=${TARGET_REMOTE_DIR}"
echo "BOOTSTRAP_RELOGIN=${NEEDS_RELOGIN}"
EOF

echo
echo "Bootstrap finished."
echo "Remote directory: ${REMOTE_DIR}"
