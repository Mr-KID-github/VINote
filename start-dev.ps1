$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot 'frontend'
$envFile = Join-Path $projectRoot '.env'
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'

function Test-CommandExists {
    param([string]$CommandName)

    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Test-LocalPortListening {
    param([int]$Port)

    try {
        return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
    } catch {
        return $false
    }
}

function Wait-LocalPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalPortListening -Port $Port) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }

    return $false
}

if (-not (Test-Path $frontendRoot)) {
    throw "Missing frontend directory: $frontendRoot"
}

if (-not (Test-Path $envFile)) {
    Write-Warning 'Missing .env file. Create it from .env.example before starting the app.'
}

if (Test-Path $venvPython) {
    $pythonExe = $venvPython
} elseif (Test-CommandExists 'python') {
    $pythonExe = 'python'
} elseif (Test-CommandExists 'py') {
    $pythonExe = 'py'
} else {
    throw 'Python was not found. Install Python or create .venv in the project root.'
}

if (-not (Test-CommandExists 'npm')) {
    throw 'npm was not found. Install Node.js first.'
}

Write-Host 'Starting VINote...'
Write-Host 'Expected URLs:'
Write-Host '  Backend:  http://127.0.0.1:8900/docs'
Write-Host '  Frontend: http://localhost:3100'
Write-Host '  Docs:     http://localhost:3101'
Write-Host ''
Write-Host 'If this is the first run, install dependencies first:'
Write-Host '  pip install -r requirements.txt'
Write-Host '  cd frontend'
Write-Host '  npm install'
Write-Host '  cd ..\docs'
Write-Host '  npm install'

$backendArgs = @(
    '-NoExit',
    '-Command',
    "& `"$pythonExe`" -m uvicorn main:app --host 0.0.0.0 --port 8900 --reload"
)

$frontendArgs = @(
    '-NoExit',
    '-Command',
    'npm run web:dev -- --host=0.0.0.0 --port=3100'
)

$docsArgs = @(
    '-NoExit',
    '-Command',
    'npm run docs:dev'
)

$backendProcess = Start-Process -FilePath 'powershell' -WorkingDirectory $projectRoot -ArgumentList $backendArgs -PassThru

Start-Sleep -Seconds 2

$frontendProcess = Start-Process -FilePath 'powershell' -WorkingDirectory $frontendRoot -ArgumentList $frontendArgs -PassThru

Start-Sleep -Seconds 2

$docsProcess = Start-Process -FilePath 'powershell' -WorkingDirectory (Join-Path $projectRoot 'docs') -ArgumentList $docsArgs -PassThru

Write-Host ''

if (Wait-LocalPort -Port 8900) {
    Write-Host 'Backend ready on http://127.0.0.1:8900/docs'
} else {
    Write-Warning "Backend did not start listening on 8900. Check the spawned window (PID $($backendProcess.Id))."
}

if (Wait-LocalPort -Port 3100) {
    Write-Host 'Frontend ready on http://localhost:3100'
} else {
    Write-Warning "Frontend did not start listening on 3100. Check the spawned window (PID $($frontendProcess.Id))."
}

if (Wait-LocalPort -Port 3101) {
    Write-Host 'Docs ready on http://localhost:3101'
} else {
    Write-Warning "Docs did not start listening on 3101. Check the spawned window (PID $($docsProcess.Id))."
}
