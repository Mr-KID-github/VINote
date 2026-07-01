#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function info {
    echo -e "${GREEN}[INFO]${NC} $1"
}

function warn {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

function error {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]] && [[ "$OSTYPE" != "linux-gnu"* ]]; then
    error "This script is designed for macOS or Linux."
    exit 1
fi

# Check required commands
function check_command {
    if ! command -v "$1" &> /dev/null; then
        error "$1 is not installed. Please install it first."
        exit 1
    fi
}

info "Checking dependencies..."
check_command python3
check_command npm
check_command ffmpeg

# Check .env file
if [[ ! -f ".env" ]]; then
    warn "Missing .env file. Creating from .env.example..."
    cp .env.example .env
    info "Please edit .env and fill in your API keys before using the app."
fi

# Check frontend dependencies
if [[ ! -d "frontend/node_modules" ]]; then
    warn "Frontend dependencies not installed. Run: cd frontend && npm install"
fi

# Check docs dependencies
if [[ ! -d "docs/node_modules" ]]; then
    warn "Docs dependencies not installed. Run: cd docs && npm install"
fi

info "Starting VINote..."
echo ""
info "Backend:  http://127.0.0.1:8900/docs"
info "Frontend: http://localhost:3100"
info "Docs:     http://localhost:3101"
echo ""

# Kill any existing processes on these ports
info "Cleaning up existing processes on ports 8900, 3100, 3101..."

# Function to kill process on port (macOS compatible)
kill_on_port() {
    local port=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    else
        fuser -k $port/tcp 2>/dev/null || true
    fi
}

kill_on_port 8900
kill_on_port 3100
kill_on_port 3101

sleep 1

# Start backend
info "Starting backend..."
cd "$SCRIPT_DIR"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8900 --reload &
BACKEND_PID=$!

# Start frontend
info "Starting frontend..."
cd "$SCRIPT_DIR/frontend"
npm run web:dev -- --host 0.0.0.0 --port 3100 &
FRONTEND_PID=$!

# Start docs
info "Starting docs..."
cd "$SCRIPT_DIR/docs"
npm run docs:dev &
DOCS_PID=$!

# Save PIDs
echo "$BACKEND_PID $FRONTEND_PID $DOCS_PID" > "$SCRIPT_DIR/.vinote.pids"

info "All services started!"
info "Press Ctrl+C to stop all services."

# Wait for any process to exit
trap 'info "Shutting down..."; kill $BACKEND_PID $FRONTEND_PID $DOCS_PID 2>/dev/null; rm -f "$SCRIPT_DIR/.vinote.pids"; exit 0' INT TERM

wait $BACKEND_PID $FRONTEND_PID $DOCS_PID
