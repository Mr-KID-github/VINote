param(
    [Alias("Host")]
    [string]$PiHost = "",
    [string]$User = "",
    [int]$Port = 22,
    [string]$RemoteDir = ""
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Load-LocalConfig($configPath) {
    if (-not (Test-Path $configPath)) {
        return @{}
    }

    $config = @{}
    Get-Content $configPath | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') {
            return
        }

        $parts = $_ -split '=', 2
        $key = $parts[0].Trim().TrimStart([char]0xFEFF)
        $config[$key] = $parts[1].Trim()
    }

    return $config
}

Require-Command "ssh"

$localConfigPath = Join-Path $PSScriptRoot "local.env"
$config = Load-LocalConfig $localConfigPath

if (-not $PiHost -and $config["PI_HOST"]) {
    $PiHost = $config["PI_HOST"]
}
if (-not $User -and $config["PI_USER"]) {
    $User = $config["PI_USER"]
}
if ($Port -eq 22 -and $config["PI_PORT"]) {
    $Port = [int]$config["PI_PORT"]
}
if (-not $RemoteDir -and $config["PI_REMOTE_DIR"]) {
    $RemoteDir = $config["PI_REMOTE_DIR"]
}

if (-not $PiHost) {
    throw "Missing Raspberry Pi host. Pass -Host or set PI_HOST in deploy/pi/local.env."
}

if (-not $User) {
    $User = "pi"
}

if (-not $RemoteDir) {
    $RemoteDir = "/home/$User/vinote"
}

$remote = "$User@$PiHost"

$remoteScript = @'
set -eu

TARGET_USER="__TARGET_USER__"
TARGET_REMOTE_DIR="__TARGET_REMOTE_DIR__"

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

echo "[bootstrap] Target user: $TARGET_USER"
echo "[bootstrap] Remote directory: $TARGET_REMOTE_DIR"

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
if ! id -nG "$TARGET_USER" | grep -qw docker; then
  echo "[bootstrap] Adding $TARGET_USER to the docker group..."
  if ! getent group docker >/dev/null 2>&1; then
    run_root groupadd docker
  fi
  run_root usermod -aG docker "$TARGET_USER"
  NEEDS_RELOGIN=1
else
  echo "[bootstrap] $TARGET_USER is already in the docker group."
fi

echo "[bootstrap] Preparing remote directory..."
run_root mkdir -p "$TARGET_REMOTE_DIR" "$TARGET_REMOTE_DIR/data" "$TARGET_REMOTE_DIR/output"
run_root chown -R "$TARGET_USER":"$TARGET_USER" "$TARGET_REMOTE_DIR"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is still unavailable after bootstrap." >&2
  exit 1
fi

if [ "$COMPOSE_CMD" = "docker compose" ]; then
  docker compose version >/dev/null 2>&1
else
  docker-compose version >/dev/null 2>&1
fi

echo "BOOTSTRAP_DOCKER_OK=1"
echo "BOOTSTRAP_COMPOSE_OK=1"
echo "BOOTSTRAP_COMPOSE_CMD=$COMPOSE_CMD"
echo "BOOTSTRAP_REMOTE_DIR=$TARGET_REMOTE_DIR"
echo "BOOTSTRAP_RELOGIN=$NEEDS_RELOGIN"
'@

$remoteScript = $remoteScript.Replace("__TARGET_USER__", $User)
$remoteScript = $remoteScript.Replace("__TARGET_REMOTE_DIR__", $RemoteDir)

Write-Host "Bootstrapping Raspberry Pi environment on $remote..."
$remoteScriptLf = $remoteScript -replace "`r`n", "`n"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = "-tt -p $Port $remote `"bash -s`""
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi
$null = $process.Start()

try {
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($remoteScriptLf)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.Close()

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $exitCode = $process.ExitCode
}
finally {
    $process.Dispose()
}

$output = @()
if ($stdout) {
    $output += ($stdout -split "`r?`n" | Where-Object { $_ -ne "" })
}
if ($stderr) {
    $output += ($stderr -split "`r?`n" | Where-Object { $_ -ne "" })
}

$output | ForEach-Object { Write-Host $_ }

if ($exitCode -ne 0) {
    throw "Bootstrap failed with exit code $exitCode."
}

$composeCommand = ""
$needsRelogin = $false

foreach ($line in $output) {
    if ($line -match '^BOOTSTRAP_COMPOSE_CMD=(.+)$') {
        $composeCommand = $matches[1].Trim()
    } elseif ($line -match '^BOOTSTRAP_RELOGIN=(.+)$') {
        $needsRelogin = $matches[1].Trim() -eq "1"
    }
}

Write-Host ""
Write-Host "Bootstrap finished."
Write-Host "Remote directory: $RemoteDir"
if ($composeCommand) {
    Write-Host "Docker Compose command: $composeCommand"
}
if ($needsRelogin) {
    Write-Warning "The user '$User' was added to the docker group. Open a new SSH session before deploying."
}
