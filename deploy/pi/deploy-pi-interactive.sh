#!/usr/bin/env bash
# deploy/pi/deploy-pi-interactive.sh
# Interactive guided deployment for VINote to Raspberry Pi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BOOTSTRAP_SCRIPT="${SCRIPT_DIR}/bootstrap-pi.sh"

# Load shared utilities
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/interactive-common.sh"

# ─────────────────────────────────────────────────────────────
# Step 1: Configure Connection
# ─────────────────────────────────────────────────────────────
write_step 1 9 "Configure Connection"

if load_local_config 2>/dev/null; then
    write_info "Found existing configuration in local.env"
    default_host="${PI_HOST:-}"
    default_user="${PI_USER:-pi}"
    default_port="${PI_PORT:-22}"
    remote_dir="${PI_REMOTE_DIR:-/home/${default_user}/vinote}"
    env_file="${PI_ENV_FILE:-.env}"
else
    default_host=""
    default_user="pi"
    default_port="22"
    remote_dir="/home/pi/vinote"
    env_file=".env"
fi

echo "Enter Raspberry Pi connection details:"
pi_host=$(read_non_empty "  IP Address or Hostname" "$default_host")
pi_user=$(read_non_empty "  SSH Username" "$default_user")
read -p "  SSH Port (default: 22): " pi_port
pi_port="${pi_port:-22}"

save_local_config "$pi_host" "$pi_user" "$pi_port"
write_success "Configuration saved to local.env"

if [[ -z "${PI_REMOTE_DIR:-}" ]]; then
    remote_dir="/home/${pi_user}/vinote"
fi

env_path="${REPO_ROOT}/${env_file}"
if [[ ! -f "${env_path}" ]]; then
    write_fail "Env file not found: ${env_path}"
    exit 1
fi

# ─────────────────────────────────────────────────────────────
# Step 2: Test SSH Connection
# ─────────────────────────────────────────────────────────────
write_step 2 9 "Test SSH Connection"

echo "Testing connection to ${pi_user}@${pi_host}:${pi_port}..."

if test_ssh_connection "$pi_host" "$pi_user" "$pi_port"; then
    write_success "Connected successfully"
else
    write_fail "Connection failed"

    echo ""
    write_warn "Possible reasons:"
    echo "  1. Wrong IP address or hostname"
    echo "  2. SSH service not running on Pi"
    echo "  3. SSH key not configured"
    echo ""

    read -p "Have you configured SSH key authentication?
  [1] Yes, continue anyway
  [2] No, show me how to set it up
  [3] Cancel deployment

Select [1]: " choice
    choice="${choice:-1}"

    if [[ "$choice" == "2" ]]; then
        cat <<EOF

=== SSH Key Setup Guide ===

1. On your local machine, generate a key pair:
   ssh-keygen -t ed25519 -C "your_email@example.com"

2. Copy the public key to your Pi:
   ssh-copy-id -p ${pi_port} ${pi_user}@${pi_host}

3. Test connection:
   ssh -p ${pi_port} ${pi_user}@${pi_host}

For more details, visit:
https://www.raspberrypi.com/documentation/computers/remote-access.html

EOF
    fi

    if [[ "$choice" != "1" ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

# ─────────────────────────────────────────────────────────────
# Step 3: Select Deployment Scope
# ─────────────────────────────────────────────────────────────
write_step 3 9 "Select Deployment Scope"

echo "Select deployment scope:"
echo "  [1] Backend only (API + services)"
echo "  [2] Frontend + Backend (full stack, default)"

read -p "Select [2]: " scope_choice
scope_choice="${scope_choice:-2}"

if [[ "$scope_choice" == "1" ]]; then
    deploy_scope="backend"
    echo "Selected: Backend only"
else
    deploy_scope="full"
    echo "Selected: Frontend + Backend"
fi

# ─────────────────────────────────────────────────────────────
# Step 4: Git Status Check
# ─────────────────────────────────────────────────────────────
write_step 4 9 "Git Status Check"

git_status=$(git -C "${REPO_ROOT}" status --short)

if [[ -n "$git_status" ]]; then
    write_warn "Working tree has uncommitted changes:"
    git -C "${REPO_ROOT}" status --short | while IFS= read -r line; do
        echo "  $line"
    done
    echo ""

    echo "  [1] Commit changes"
    echo "  [2] Stash changes"
    echo "  [3] Skip pushing (continue with local state)"
    echo "  [4] Cancel deployment"

    read -p "Select [4]: " git_choice
    git_choice="${git_choice:-4}"

    case "$git_choice" in
        1)
            echo "Enter commit message:"
            read -r msg
            msg="${msg:-WIP: $(date '+%Y-%m-%d %H:%M')}"
            git -C "${REPO_ROOT}" add -A
            git -C "${REPO_ROOT}" commit -m "$msg"
            write_success "Changes committed"
            skip_push=false
            ;;
        2)
            git -C "${REPO_ROOT}" stash push -m "Auto-stash before deploy $(date '+%Y-%m-%d %H:%M')"
            write_success "Changes stashed"
            skip_push=false
            ;;
        3)
            skip_push=true
            echo "Will skip git push"
            ;;
        *)
            echo "Deployment cancelled."
            exit 0
            ;;
    esac
else
    write_success "Working tree clean"
    skip_push=false
fi

# ─────────────────────────────────────────────────────────────
# Step 5: Preview & Confirm
# ─────────────────────────────────────────────────────────────
write_step 5 9 "Preview & Confirm"

branch=$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)
scope_text=$([[ "$deploy_scope" == "backend" ]] && echo "Backend only" || echo "Frontend + Backend")
push_text=$([[ "$skip_push" == "true" ]] && echo "No (skipped)" || echo "Yes")

cat <<EOF

=== Deployment Summary ===

Target:         ${pi_user}@${pi_host}:${pi_port}
Branch:         ${branch}
Scope:          ${scope_text}
Remote Dir:     ${remote_dir}
Local Env:      ${env_file}
Git Push:       ${push_text}

EOF

if confirm_choice "Ready to deploy?" false; then
    :
else
    echo "Deployment cancelled."
    exit 0
fi

# ─────────────────────────────────────────────────────────────
# Step 6: Remote Environment Check
# ─────────────────────────────────────────────────────────────
write_step 6 9 "Remote Environment Check"

echo "Checking Docker environment on Pi..."

get_docker_remote_status "$pi_host" "$pi_user" "$pi_port" || true

if [[ "${DOCKER_OK:-0}" != "1" ]]; then
    write_fail "Docker daemon is not running on the Pi"
    cat <<EOF

Please start Docker on your Raspberry Pi:
  sudo systemctl start docker
  sudo systemctl enable docker

Then restart this deployment.
  [1] Run bootstrap on the Raspberry Pi (recommended)
  [2] Retry checks
  [3] Continue anyway (may fail)
  [4] Cancel

Select [4]:
EOF
    read -r retry_choice
    retry_choice="${retry_choice:-4}"

    if [[ "$retry_choice" == "1" ]]; then
        "${BOOTSTRAP_SCRIPT}" "${pi_host}" "${pi_user}" "${pi_port}" "${remote_dir}"
        get_docker_remote_status "$pi_host" "$pi_user" "$pi_port"
        if [[ "${DOCKER_OK:-0}" != "1" ]]; then
            write_fail "Bootstrap completed but Docker is still unavailable on the Pi"
            exit 1
        fi
    elif [[ "$retry_choice" == "2" ]]; then
        exec "$0" "$@"
    elif [[ "$retry_choice" != "3" ]]; then
        exit 0
    fi
fi

if [[ "${COMPOSE_OK:-0}" != "1" ]]; then
    write_fail "Docker Compose is not installed on the Pi"
    cat <<EOF

Please install Docker Compose:
  sudo apt-get update && sudo apt-get install -y docker-compose

Or use the Docker Compose plugin:
  sudo apt-get install -y docker-compose-plugin

  [1] Run bootstrap on the Raspberry Pi (recommended)
  [2] Retry checks
  [3] Continue anyway
  [4] Cancel

Select [4]:
EOF
    read -r retry_choice
    retry_choice="${retry_choice:-4}"

    if [[ "$retry_choice" == "1" ]]; then
        "${BOOTSTRAP_SCRIPT}" "${pi_host}" "${pi_user}" "${pi_port}" "${remote_dir}"
        get_docker_remote_status "$pi_host" "$pi_user" "$pi_port"
        if [[ "${COMPOSE_OK:-0}" != "1" ]]; then
            write_fail "Bootstrap completed but Docker Compose is still unavailable on the Pi"
            exit 1
        fi
    elif [[ "$retry_choice" == "2" ]]; then
        exec "$0" "$@"
    elif [[ "$retry_choice" != "3" ]]; then
        exit 0
    fi
elif [[ -n "${COMPOSE_CMD:-}" ]]; then
    write_info "Detected Docker Compose command: ${COMPOSE_CMD}"
fi

write_success "Docker environment OK"

# ─────────────────────────────────────────────────────────────
# Step 7: Push Code (if not skipped)
# ─────────────────────────────────────────────────────────────
write_step 7 9 "Push Code"

if [[ "$skip_push" == "true" ]]; then
    echo "Skipping git push"
else
    echo "Pushing branch ${branch} to origin..."
    if git -C "${REPO_ROOT}" push origin "${branch}"; then
        write_success "Branch pushed"
    else
        write_fail "Failed to push to origin"
        echo "  [1] Retry"
        echo "  [2] Skip pushing, continue with local files"
        echo "  [3] Cancel"

        read -p "Select [3]: " push_retry
        push_retry="${push_retry:-3}"

        case "$push_retry" in
            1)
                git -C "${REPO_ROOT}" push origin "${branch}"
                ;;
            2)
                skip_push=true
                ;;
            *)
                exit 0
                ;;
        esac
    fi
fi

# ─────────────────────────────────────────────────────────────
# Step 8: Upload Files
# ─────────────────────────────────────────────────────────────
write_step 8 9 "Upload Files"

remote_env="/tmp/vinote.env"
remote_archive="/tmp/vinote-source.tar.gz"

echo "Uploading .env file..."
if ! scp -P "${pi_port}" "${env_path}" "${pi_user}@${pi_host}:${remote_env}"; then
    write_fail "Failed to upload env file"
    exit 1
fi
write_success "Env file uploaded"

echo "Creating source archive..."
temp_archive=$(mktemp "${TMPDIR:-/tmp}/vinote-source.XXXXXX.tar.gz")
temp_list=$(mktemp "${TMPDIR:-/tmp}/vinote-source.XXXXXX.list")
trap 'rm -f "${temp_archive}" "${temp_list}"' EXIT

git -C "${REPO_ROOT}" ls-files --cached --modified --others --exclude-standard > "${temp_list}"
tar -czf "${temp_archive}" -C "${REPO_ROOT}" -T "${temp_list}"

echo "Uploading source archive..."
if ! scp -P "${pi_port}" "${temp_archive}" "${pi_user}@${pi_host}:${remote_archive}"; then
    write_fail "Failed to upload source archive"
    exit 1
fi
write_success "Source archive uploaded"

# ─────────────────────────────────────────────────────────────
# Step 9: Execute Deployment
# ─────────────────────────────────────────────────────────────
write_step 9 9 "Execute Deployment"

remote_script="/tmp/vinote-deploy.sh"

deploy_cmd='$COMPOSE_CMD up -d --build'
if [[ "$deploy_scope" == "backend" ]]; then
    deploy_cmd='$COMPOSE_CMD up -d --no-deps backend'
fi

deploy_script=$(cat <<SCRIPT
set -eu
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Missing required command on Raspberry Pi: docker compose or docker-compose" >&2
  exit 1
fi
mkdir -p "${remote_dir}"
find "${remote_dir}" -mindepth 1 -maxdepth 1 \\
  ! -name data \\
  ! -name output \\
  ! -name .env \\
  -exec rm -rf {} +
tar -xzf "${remote_archive}" -C "${remote_dir}"
cp "${remote_env}" "${remote_dir}/.env"
rm -f "${remote_archive}"
rm -f "${remote_env}"
cd "${remote_dir}"
export COMPOSE_PROJECT_NAME=vinote
export DOCKER_DEFAULT_PLATFORM=linux/arm/v7
mkdir -p data output
${deploy_cmd}
\$COMPOSE_CMD ps
SCRIPT
)

temp_script=$(mktemp "${TMPDIR:-/tmp}/vinote-deploy.XXXXXX.sh")
echo "$deploy_script" > "$temp_script"

echo "Uploading deploy script..."
scp -P "${pi_port}" "${temp_script}" "${pi_user}@${pi_host}:${remote_script}" 2>/dev/null

echo "Deploying VINote to Raspberry Pi..."
ssh -p "${pi_port}" "${pi_user}@${pi_host}" "bash '${remote_script}'; rm -f '${remote_script}'"

write_success "Deployment complete!"

# Get ports from env
frontend_port="3100"
backend_port="8900"
if [[ -f "${env_path}" ]]; then
    fp=$(grep '^FRONTEND_PORT=' "${env_path}" | tail -n 1 | cut -d'=' -f2-)
    bp=$(grep '^BACKEND_PORT=' "${env_path}" | tail -n 1 | cut -d'=' -f2-)
    [[ -n "$fp" ]] && frontend_port="$fp"
    [[ -n "$bp" ]] && backend_port="$bp"
fi

cat <<EOF

Access VINote:
  - Frontend: http://${pi_host}:${frontend_port}
  - Backend:  http://${pi_host}:${backend_port}
  - MCP:      http://${pi_host}:${backend_port}/mcp

To check status on Pi:
  ssh ${pi_user}@${pi_host}
  cd ${remote_dir} && ${COMPOSE_CMD:-docker compose} ps
EOF
