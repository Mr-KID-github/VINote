# deploy/pi/interactive-common.ps1
# Shared utility functions for interactive deployment scripts

# Enable ANSI escape sequence support on Windows
if ($Host.UI.RawUI) {
    $Host.UI.RawUI.BackgroundColor = $Host.UI.RawUI.BackgroundColor
    try {
        $Host.UI.RawUI.SupportsInteractiveEvents = $true
    } catch {}
}

# Use a literal ESC character so ANSI colors work in both Windows PowerShell 5
# and PowerShell 7+.
$script:ESC = [char]27
$script:ESC_RESET = "${script:ESC}[0m"
$script:ESC_GREEN = "${script:ESC}[32m"
$script:ESC_RED = "${script:ESC}[31m"
$script:ESC_YELLOW = "${script:ESC}[33m"
$script:ESC_CYAN = "${script:ESC}[36m"

# Detect system language
$script:IsChinese = [System.Globalization.CultureInfo]::CurrentCulture.TwoLetterISOLanguageName -eq 'zh'

# Localized strings
$script:LOC = @{
    zh = @{
        OK = "[OK]"
        FAIL = "[失败]"
        WARN = "[警告]"
        INFO = "[信息]"
        Step = "步骤"
        ValueCannotBeEmpty = "值不能为空，请输入值"
        PleaseEnterYorN = "请输入 y 或 n"
        ConfigSaved = "配置已保存到 local.env"
        FoundExistingConfig = "发现已有配置"
        WorkingTreeClean = "工作区干净"
        WorkingTreeHasChanges = "工作区有未提交的更改"
        ChangesCommitted = "已提交更改"
        ChangesStashed = "已暂存更改"
        SkipGitPush = "将跳过 git push"
        ConnectedSuccessfully = "连接成功"
        ConnectionFailed = "连接失败"
        DockerEnvOK = "Docker 环境正常"
        DockerDaemonNotRunning = "Docker daemon 未运行"
        DockerComposeNotInstalled = "Docker Compose 未安装"
        EnvFileUploaded = "Env 文件已上传"
        SourceArchiveUploaded = "源码包已上传"
        DeploymentComplete = "部署完成"
        BranchPushed = "分支已推送"
        FailedToPush = "推送失败"
        Cancelled = "部署已取消"
        BackendOnly = "仅后端"
        FullStack = "前端 + 后端"
        YesSkipPush = "否（跳过）"
        NoPush = "是"
    }
    en = @{
        OK = "[OK]"
        FAIL = "[FAIL]"
        WARN = "[WARN]"
        INFO = "[INFO]"
        Step = "Step"
        ValueCannotBeEmpty = "Value cannot be empty. Please enter a value."
        PleaseEnterYorN = "Please enter y or n."
        ConfigSaved = "Configuration saved to local.env"
        FoundExistingConfig = "Found existing configuration"
        WorkingTreeClean = "Working tree clean"
        WorkingTreeHasChanges = "Working tree has uncommitted changes"
        ChangesCommitted = "Changes committed"
        ChangesStashed = "Changes stashed"
        SkipGitPush = "Will skip git push"
        ConnectedSuccessfully = "Connected successfully"
        ConnectionFailed = "Connection failed"
        DockerEnvOK = "Docker environment OK"
        DockerDaemonNotRunning = "Docker daemon is not running"
        DockerComposeNotInstalled = "Docker Compose is not installed"
        EnvFileUploaded = "Env file uploaded"
        SourceArchiveUploaded = "Source archive uploaded"
        DeploymentComplete = "Deployment complete"
        BranchPushed = "Branch pushed"
        FailedToPush = "Failed to push"
        Cancelled = "Deployment cancelled"
        BackendOnly = "Backend only"
        FullStack = "Frontend + Backend"
        YesSkipPush = "Yes (skip)"
        NoPush = "No"
    }
}

function Get-Loc($key) {
    if ($IsChinese) {
        return $LOC.zh[$key]
    } else {
        return $LOC.en[$key]
    }
}

function Write-Success($message) {
    Write-Host "$ESC_GREEN$(Get-Loc 'OK')$ESC_RESET $message"
}

function Write-Fail($message) {
    $Host.UI.WriteErrorLine("$ESC_RED$(Get-Loc 'FAIL')$ESC_RESET $message")
}

function Write-Warn($message) {
    Write-Host "$ESC_YELLOW$(Get-Loc 'WARN')$ESC_RESET $message"
}

function Write-Info($message) {
    Write-Host "$ESC_CYAN$(Get-Loc 'INFO')$ESC_RESET $message"
}

function Write-Step($current, $total, $message) {
    Write-Host ""
    $stepLabel = Get-Loc "Step"
    Write-Host "$ESC_CYAN--- $stepLabel $current/$total`: $message ---$ESC_RESET"
}

function Test-SshConnection($piHost, $piUser, $piPort, $timeout = 5) {
    $remote = "$piUser@$piHost"
    $output = ssh -o "ConnectTimeout=$timeout" -o "BatchMode=yes" -p $piPort $remote "echo ok" 2>&1
    return $LASTEXITCODE -eq 0
}

function Read-NonEmpty($prompt, $default = "") {
    while ($true) {
        $promptText = if ($IsChinese) { "请输入" } else { "Enter" }
        $value = Read-Host "$promptText $prompt"
        if ([string]::IsNullOrWhiteSpace($value)) {
            if ($default) {
                return $default
            }
            Write-Warn (Get-Loc "ValueCannotBeEmpty")
        } else {
            return $value
        }
    }
}

function Confirm-Choice($prompt, $yesDefault = $false) {
    if ($yesDefault) {
        $suffix = "[Y/n]"
    } else {
        $suffix = "[y/N]"
    }
    while ($true) {
        $response = Read-Host "$prompt $suffix"
        if ([string]::IsNullOrWhiteSpace($response)) {
            return $yesDefault
        }
        if ($response -match "^[Yy]$") { return $true }
        if ($response -match "^[Nn]$") { return $false }
        Write-Warn (Get-Loc "PleaseEnterYorN")
    }
}

function Save-LocalConfig($piHost, $piUser, $piPort) {
    $configPath = Join-Path $PSScriptRoot "local.env"
    $config = Load-LocalConfig
    if (-not $config) {
        $config = @{}
    }

    $config["PI_HOST"] = $piHost
    $config["PI_USER"] = $piUser
    $config["PI_PORT"] = $piPort

    $preferredOrder = @(
        "PI_HOST",
        "PI_USER",
        "PI_PORT",
        "PI_BRANCH",
        "PI_REMOTE_DIR",
        "PI_ENV_FILE"
    )

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($key in $preferredOrder) {
        if ($config.ContainsKey($key)) {
            $lines.Add("$key=$($config[$key])")
        }
    }

    foreach ($key in ($config.Keys | Sort-Object)) {
        if ($preferredOrder -notcontains $key) {
            $lines.Add("$key=$($config[$key])")
        }
    }

    [System.IO.File]::WriteAllLines(
        $configPath,
        [string[]]$lines,
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Load-LocalConfig() {
    $configPath = Join-Path $PSScriptRoot "local.env"
    if (-not (Test-Path $configPath)) { return $null }

    $config = @{}
    Get-Content $configPath | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') {
            return
        }
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim().TrimStart([char]0xFEFF)
            $config[$key] = $matches[2].Trim()
        }
    }
    return $config
}

function Invoke-RemoteBashScript($piHost, $piUser, $piPort, $scriptContent) {
    $remote = "$piUser@$piHost"
    $scriptLf = $scriptContent -replace "`r`n", "`n"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ssh"
    $psi.Arguments = "-o ConnectTimeout=5 -o BatchMode=yes -p $piPort $remote `"bash -s`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()

    try {
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($scriptLf)
        $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        $process.StandardInput.Close()

        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
    }
    finally {
        $process.Dispose()
    }

    if ($stdout -and $stderr) {
        return ($stdout.TrimEnd() + [Environment]::NewLine + $stderr.TrimEnd())
    }
    if ($stdout) {
        return $stdout.TrimEnd()
    }
    return $stderr.TrimEnd()
}

function Get-DockerRemoteStatus($piHost, $piUser, $piPort) {
    # Check Docker daemon
    $dockerCmd = @'
docker_output="$(docker info 2>&1)"
docker_status=$?
printf '%s\n' "$docker_output"
if [ "$docker_status" -eq 0 ]; then
  echo DOCKER_OK=1
else
  echo DOCKER_OK=0
fi
'@
    $dockerOutput = Invoke-RemoteBashScript $piHost $piUser $piPort $dockerCmd
    $dockerOk = $dockerOutput -match "DOCKER_OK=1"

    # Check Docker Compose
    $composeCmd = @'
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
printf '%s\n' "$compose_output"
if [ "$compose_status" -eq 0 ]; then
  echo COMPOSE_OK=1
  echo "COMPOSE_CMD=$compose_cmd"
else
  echo COMPOSE_OK=0
fi
'@
    $composeOutput = Invoke-RemoteBashScript $piHost $piUser $piPort $composeCmd
    $composeOk = $composeOutput -match "COMPOSE_OK=1"
    $composeCommand = ""
    if ($composeOutput -match "COMPOSE_CMD=(.+)") {
        $composeCommand = $matches[1].Trim()
    }

    $result = @{
        DockerOk = $dockerOk
        ComposeOk = $composeOk
        ComposeCommand = $composeCommand
        DockerOutput = $dockerOutput
        ComposeOutput = $composeOutput
    }
    return $result
}
