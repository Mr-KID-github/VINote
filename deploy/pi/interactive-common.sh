#!/usr/bin/env bash
# deploy/pi/interactive-common.sh
# Shared utility functions for interactive deployment scripts

set -euo pipefail

# ANSI colors
ESC_RESET='\033[0m'
ESC_GREEN='\033[32m'
ESC_RED='\033[31m'
ESC_YELLOW='\033[33m'
ESC_CYAN='\033[36m'

write_success() {
    echo -e "${ESC_GREEN}✅${ESC_RESET} $1"
}

write_fail() {
    echo -e "${ESC_RED}❌${ESC_RESET} $1" >&2
}

write_warn() {
    echo -e "${ESC_YELLOW}⚠️${ESC_RESET} $1"
}

write_info() {
    echo -e "${ESC_CYAN}ℹ️${ESC_RESET} $1"
}

write_step() {
    echo ""
    echo -e "${ESC_CYAN}━━━ Step $1/$2: $3 ━━━${ESC_RESET}"
}

test_ssh_connection() {
    local host="$1"
    local user="$2"
    local port="$3"
    local timeout="${4:-5}"
    local remote="${user}@${host}"

    if ssh -o "ConnectTimeout=${timeout}" -o "BatchMode=yes" -p "${port}" "${remote}" "echo ok" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

read_non_empty() {
    local prompt="$1"
    local default="${2:-}"

    while true; do
        read -p "$prompt" value
        if [[ -z "$value" ]]; then
            if [[ -n "$default" ]]; then
                echo "$default"
                return 0
            fi
            write_warn "Value cannot be empty. Please enter a value."
        else
            echo "$value"
            return 0
        fi
    done
}

confirm_choice() {
    local prompt="$1"
    local default_yes="${2:-false}"

    if [[ "$default_yes" == "true" ]]; then
        local suffix="[Y/n]"
    else
        local suffix="[y/N]"
    fi

    while true; do
        read -p "$prompt $suffix " response
        if [[ -z "$response" ]]; then
            [[ "$default_yes" == "true" ]]
            return $?
        fi
        if [[ "$response" =~ ^[Yy]$ ]]; then
            return 0
        fi
        if [[ "$response" =~ ^[Nn]$ ]]; then
            return 1
        fi
        write_warn "Please enter y or n."
    done
}

save_local_config() {
    local host="$1"
    local user="$2"
    local port="$3"
    local config_path
    config_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local.env"
    local existing=()
    if [[ -f "$config_path" ]]; then
        while IFS='=' read -r key value; do
            [[ -z "${key}" || "${key}" =~ ^[[:space:]]*# ]] && continue
            key="${key#$'\xEF\xBB\xBF'}"
            [[ -z "${value}" ]] && continue
            existing+=("${key}=${value}")
        done < "$config_path"
    fi

    local branch=""
    local remote_dir=""
    local env_file=""
    local line key value
    for line in "${existing[@]}"; do
        key="${line%%=*}"
        value="${line#*=}"
        case "$key" in
            PI_BRANCH) branch="$value" ;;
            PI_REMOTE_DIR) remote_dir="$value" ;;
            PI_ENV_FILE) env_file="$value" ;;
        esac
    done

    {
        echo "PI_HOST=${host}"
        echo "PI_USER=${user}"
        echo "PI_PORT=${port}"
        [[ -n "$branch" ]] && echo "PI_BRANCH=${branch}"
        [[ -n "$remote_dir" ]] && echo "PI_REMOTE_DIR=${remote_dir}"
        [[ -n "$env_file" ]] && echo "PI_ENV_FILE=${env_file}"
    } > "$config_path"
}

load_local_config() {
    local config_path
    config_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local.env"

    if [[ ! -f "$config_path" ]]; then
        return 1
    fi

    while IFS='=' read -r key value; do
        [[ -z "${key}" || "${key}" =~ ^[[:space:]]*# ]] && continue
        key="${key#$'\xEF\xBB\xBF'}"
        value=$(echo "$value" | xargs)
        case "$key" in
            PI_HOST) export PI_HOST="$value" ;;
            PI_USER) export PI_USER="$value" ;;
            PI_PORT) export PI_PORT="$value" ;;
            PI_BRANCH) export PI_BRANCH="$value" ;;
            PI_REMOTE_DIR) export PI_REMOTE_DIR="$value" ;;
            PI_ENV_FILE) export PI_ENV_FILE="$value" ;;
        esac
    done < "$config_path"
}

get_docker_remote_status() {
    local host="$1"
    local user="$2"
    local port="$3"
    local remote="${user}@${host}"

    local docker_output compose_output
    docker_output=$(ssh -p "$port" "$remote" '
        docker_output="$(docker info 2>&1)"
        docker_status=$?
        printf "%s\n" "$docker_output"
        if [ "$docker_status" -eq 0 ]; then
            echo "DOCKER_OK=1"
        else
            echo "DOCKER_OK=0"
        fi
    ' 2>/dev/null) || return 1

    if echo "$docker_output" | grep -q "DOCKER_OK=1"; then
        DOCKER_OK=1
    else
        DOCKER_OK=0
    fi

    compose_output=$(ssh -p "$port" "$remote" '
        compose_cmd=""
        if docker compose version >/dev/null 2>&1; then
            compose_cmd="docker compose"
            compose_output="$(docker compose version 2>&1)"
            compose_status=$?
        elif command -v docker-compose >/dev/null 2>&1; then
            compose_cmd="docker-compose"
            compose_output="$(docker-compose version 2>&1)"
            compose_status=$?
        else
            compose_output="docker compose and docker-compose are both unavailable"
            compose_status=1
        fi
        printf "%s\n" "$compose_output"
        if [ "$compose_status" -eq 0 ]; then
            echo "COMPOSE_OK=1"
            echo "COMPOSE_CMD=${compose_cmd}"
        else
            echo "COMPOSE_OK=0"
        fi
    ' 2>/dev/null) || return 1

    if echo "$compose_output" | grep -q "COMPOSE_OK=1"; then
        COMPOSE_OK=1
    else
        COMPOSE_OK=0
    fi

    COMPOSE_CMD="$(echo "$compose_output" | awk -F= '/^COMPOSE_CMD=/{print $2; exit}')"
    DOCKER_OUTPUT="$docker_output"
    COMPOSE_OUTPUT="$compose_output"
}
