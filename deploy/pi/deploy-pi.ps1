param(
    [Alias("Host")]
    [string]$PiHost = "",
    [string]$User = "",
    [int]$Port = 22,
    [string]$Branch = "main",
    [string]$RepoUrl = "https://github.com/Mr-KID-github/VideoNote.git",
    [string]$RemoteDir = "",
    [string]$EnvFile = ".env",
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Assert-LastExitCode {
    param([string]$Action)

    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE."
    }
}

Require-Command "git"
Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$localConfigPath = Join-Path $PSScriptRoot "local.env"
$envPath = Join-Path $repoRoot $EnvFile
$frontendPort = "3100"
$backendPort = "8900"

if (Test-Path $localConfigPath) {
    Get-Content $localConfigPath | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') {
            return
        }

        $parts = $_ -split '=', 2
        $key = $parts[0].Trim().TrimStart([char]0xFEFF)
        $value = $parts[1].Trim()

        switch ($key) {
            "PI_HOST" { if (-not $PiHost) { $PiHost = $value } }
            "PI_USER" { if (-not $User) { $User = $value } }
            "PI_PORT" { if ($Port -eq 22 -and $value) { $Port = [int]$value } }
            "PI_BRANCH" { if ($Branch -eq "main" -and $value) { $Branch = $value } }
            "PI_REMOTE_DIR" { if (-not $RemoteDir) { $RemoteDir = $value } }
            "PI_ENV_FILE" {
                if ($EnvFile -eq ".env" -and $value) {
                    $EnvFile = $value
                    $envPath = Join-Path $repoRoot $EnvFile
                }
            }
        }
    }
}

if (-not $PiHost) {
    throw "Missing Raspberry Pi host. Pass -Host or create deploy/pi/local.env."
}

if (-not $User) {
    $User = "pi"
}

if (-not $RemoteDir) {
    $RemoteDir = "/home/$User/vinote"
}

if (-not (Test-Path $envPath)) {
    throw "Env file not found: $envPath"
}

$frontendPortLine = Get-Content $envPath | Where-Object { $_ -match '^FRONTEND_PORT=' } | Select-Object -First 1
if ($frontendPortLine) {
    $frontendPort = ($frontendPortLine -split '=', 2)[1].Trim()
}

$backendPortLine = Get-Content $envPath | Where-Object { $_ -match '^BACKEND_PORT=' } | Select-Object -First 1
if ($backendPortLine) {
    $backendPort = ($backendPortLine -split '=', 2)[1].Trim()
}

$status = git -C $repoRoot status --short
if ($status -and -not $SkipPush) {
    throw "Working tree is not clean. Commit or stash local changes, or rerun with -SkipPush if you know what you are doing."
}

if (-not $SkipPush) {
    Write-Host "Pushing branch $Branch to origin..."
    git -C $repoRoot push origin $Branch
    Assert-LastExitCode "git push"
}

$remote = "$User@$PiHost"
$remoteEnv = "/tmp/vinote.env"
$remoteArchive = "/tmp/vinote-source.tar.gz"
$remoteScriptPath = "/tmp/vinote-deploy.sh"
$tempArchive = Join-Path ([System.IO.Path]::GetTempPath()) "vinote-source-$PID.tar.gz"
$tempArchiveList = Join-Path ([System.IO.Path]::GetTempPath()) "vinote-source-$PID.txt"

Write-Host "Uploading env file to $remote..."
scp -P $Port $envPath "${remote}:${remoteEnv}" | Out-Null
Assert-LastExitCode "scp env upload"

Write-Host "Creating source archive from local working tree..."
$archiveFiles = git -C $repoRoot ls-files --cached --modified --others --exclude-standard
Assert-LastExitCode "git ls-files"
if (-not $archiveFiles) {
    throw "No files found to include in deployment archive."
}
[System.IO.File]::WriteAllLines($tempArchiveList, $archiveFiles, [System.Text.UTF8Encoding]::new($false))
tar -czf $tempArchive -C $repoRoot -T $tempArchiveList
Assert-LastExitCode "tar create archive"

Write-Host "Uploading source archive to $remote..."
scp -P $Port $tempArchive "${remote}:${remoteArchive}" | Out-Null
Assert-LastExitCode "scp source archive upload"

$remoteScript = @'
set -eu

for cmd in docker tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command on Raspberry Pi: $cmd" >&2
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

mkdir -p "__REMOTE_DIR__"
find "__REMOTE_DIR__" -mindepth 1 -maxdepth 1 \
  ! -name data \
  ! -name output \
  ! -name .env \
  -exec rm -rf {} +
tar -xzf "__REMOTE_ARCHIVE__" -C "__REMOTE_DIR__"
cp "__REMOTE_ENV__" "__REMOTE_DIR__/.env"
rm -f "__REMOTE_ARCHIVE__"
rm -f "__REMOTE_ENV__"

cd "__REMOTE_DIR__"
export COMPOSE_PROJECT_NAME=vinote
export DOCKER_DEFAULT_PLATFORM=linux/arm/v7

mkdir -p data output

$COMPOSE_CMD up -d --build --remove-orphans
$COMPOSE_CMD ps
'@
$remoteScript = $remoteScript.Replace("__REMOTE_DIR__", $RemoteDir)
$remoteScript = $remoteScript.Replace("__BRANCH__", $Branch)
$remoteScript = $remoteScript.Replace("__REPO_URL__", $RepoUrl)
$remoteScript = $remoteScript.Replace("__REMOTE_ENV__", $remoteEnv)
$remoteScript = $remoteScript.Replace("__REMOTE_ARCHIVE__", $remoteArchive)

$tempRemoteScript = Join-Path ([System.IO.Path]::GetTempPath()) "vinote-deploy-$PID.sh"
$remoteScriptLf = $remoteScript -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($tempRemoteScript, $remoteScriptLf, [System.Text.UTF8Encoding]::new($false))

try {
    Write-Host "Uploading deploy script to $remote..."
    scp -P $Port $tempRemoteScript "${remote}:${remoteScriptPath}" | Out-Null
    Assert-LastExitCode "scp deploy script upload"

    $remoteCommand = "bash '$remoteScriptPath'; status=`$?; rm -f '$remoteScriptPath'; exit `$status"

    Write-Host "Deploying VINote to Raspberry Pi..."
    ssh -p $Port $remote $remoteCommand
    Assert-LastExitCode "ssh deploy"
}
finally {
    if (Test-Path $tempRemoteScript) {
        Remove-Item $tempRemoteScript -Force
    }
    if (Test-Path $tempArchive) {
        Remove-Item $tempArchive -Force
    }
    if (Test-Path $tempArchiveList) {
        Remove-Item $tempArchiveList -Force
    }
}

Write-Host ""
Write-Host "Deployment finished."
if ($frontendPort -eq "80") {
    Write-Host "Open in LAN: http://${PiHost}"
} else {
    Write-Host "Open in LAN: http://${PiHost}:${frontendPort}"
}
Write-Host "MCP endpoint: http://${PiHost}:${backendPort}/mcp"
