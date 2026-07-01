#!/usr/bin/env pwsh
# deploy/pi/deploy-pi-interactive.ps1
# Interactive guided deployment for VINote to Raspberry Pi

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$bootstrapScriptPath = Join-Path $PSScriptRoot "bootstrap-pi.ps1"

# Load shared utilities
. (Join-Path $PSScriptRoot "interactive-common.ps1")

# ================================================================
# Step 1: Configure Connection
# ================================================================
$step1Title = if ($IsChinese) { "配置连接" } else { "Configure Connection" }
Write-Step 1 9 $step1Title

$config = Load-LocalConfig

if ($config) {
    Write-Info (Get-Loc "FoundExistingConfig")
    $defaultHost = if ($config["PI_HOST"]) { $config["PI_HOST"] } else { "" }
    $defaultUser = if ($config["PI_USER"]) { $config["PI_USER"] } else { "pi" }
    $defaultPort = if ($config["PI_PORT"]) { $config["PI_PORT"] } else { "22" }
    $remoteDir = if ($config["PI_REMOTE_DIR"]) { $config["PI_REMOTE_DIR"] } else { "/home/$defaultUser/vinote" }
    $envFile = if ($config["PI_ENV_FILE"]) { $config["PI_ENV_FILE"] } else { ".env" }
} else {
    $defaultHost = ""
    $defaultUser = "pi"
    $defaultPort = "22"
    $remoteDir = "/home/pi/vinote"
    $envFile = ".env"
}

$promptHost = if ($IsChinese) { "IP 地址或主机名" } else { "IP Address or Hostname" }
$promptUser = if ($IsChinese) { "SSH 用户名" } else { "SSH Username" }
$promptPort = if ($IsChinese) { "SSH 端口" } else { "SSH Port" }
$promptTitle = if ($IsChinese) { "输入树莓派连接信息" } else { "Enter Raspberry Pi connection details" }

Write-Host $promptTitle -ForegroundColor White
$piHost = Read-NonEmpty $promptHost $defaultHost
$piUser = Read-NonEmpty $promptUser $defaultUser
$piPort = Read-Host "  $promptPort (default: 22)"
if ([string]::IsNullOrWhiteSpace($piPort)) { $piPort = "22" }

Save-LocalConfig $piHost $piUser $piPort
Write-Success (Get-Loc "ConfigSaved")

if (-not $config) {
    $remoteDir = "/home/$piUser/vinote"
}

$envPath = Join-Path $repoRoot $envFile
if (-not (Test-Path $envPath)) {
    throw "Env file not found: $envPath"
}

# ================================================================
# Step 2: Test SSH Connection
# ================================================================
$step2Title = if ($IsChinese) { "测试 SSH 连接" } else { "Test SSH Connection" }
Write-Step 2 9 $step2Title

$testingMsg = if ($IsChinese) { "正在测试连接" } else { "Testing connection" }
Write-Host "$testingMsg to $piUser@$piHost`:$piPort..."

if (Test-SshConnection $piHost $piUser $piPort) {
    Write-Success (Get-Loc "ConnectedSuccessfully")
} else {
    Write-Fail (Get-Loc "ConnectionFailed")

    Write-Host ""
    $possibleReasons = if ($IsChinese) { "可能的原因" } else { "Possible reasons" }
    Write-Warn "${possibleReasons}:"
    $reason1 = if ($IsChinese) { "IP地址或主机名错误" } else { "Wrong IP address or hostname" }
    $reason2 = if ($IsChinese) { "SSH 服务未运行" } else { "SSH service not running on Pi" }
    $reason3 = if ($IsChinese) { "SSH 密钥未配置" } else { "SSH key not configured" }
    Write-Host "  1. $reason1"
    Write-Host "  2. $reason2"
    Write-Host "  3. $reason3"
    Write-Host ""

    $sshPrompt = if ($IsChinese) {
        @"
是否已配置 SSH 密钥认证？
  [1] 是，继续
  [2] 否，显示配置方法
  [3] 取消部署

选择 [1]:
"@
    } else {
        @"
Have you configured SSH key authentication?
  [1] Yes, continue anyway
  [2] No, show me how to set it up
  [3] Cancel deployment

Select [1]:
"@
    }

    $choice = Read-Host $sshPrompt
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

    if ($choice -eq "2") {
        $guideTitle = if ($IsChinese) { "SSH 密钥配置指南" } else { "SSH Key Setup Guide" }
        $step1Title = if ($IsChinese) { "在本地机器上生成密钥对" } else { "On your local machine, generate a key pair" }
        $step2Title = if ($IsChinese) { "将公钥复制到树莓派" } else { "Copy the public key to your Pi" }
        $step3Title = if ($IsChinese) { "测试连接" } else { "Test connection" }
        $moreInfo = if ($IsChinese) { "详细信息请参阅" } else { "For more details, visit" }

        if ($IsChinese) {
            Write-Host @"

=== $guideTitle ===

1. $step1Title：
   ssh-keygen -t ed25519 -C "your_email@example.com"

2. $step2Title：
   ssh-copy-id -p $piPort $piUser@$piHost

3. $step3Title：
   ssh -p $piPort $piUser@$piHost

$moreInfo：
https://www.raspberrypi.com/documentation/computers/remote-access.html

"@
        } else {
            Write-Host @"

=== $guideTitle ===

1. ${step1Title}:
   ssh-keygen -t ed25519 -C "your_email@example.com"

2. ${step2Title}:
   ssh-copy-id -p $piPort $piUser@$piHost

3. ${step3Title}:
   ssh -p $piPort $piUser@$piHost

${moreInfo}:
https://www.raspberrypi.com/documentation/computers/remote-access.html

"@
        }
    }

    if ($choice -ne "1") {
        Write-Host (Get-Loc "Cancelled") -ForegroundColor Yellow
        exit 0
    }
}

# ================================================================
# Step 3: Select Deployment Scope
# ================================================================
$step3Title = if ($IsChinese) { "选择部署范围" } else { "Select Deployment Scope" }
Write-Step 3 9 $step3Title

$scopePrompt = if ($IsChinese) { "选择部署范围" } else { "Select deployment scope" }
$option1 = if ($IsChinese) { "仅后端 (API + 服务)" } else { "Backend only (API + services)" }
$option2 = if ($IsChinese) { "前端 + 后端 (完整栈，默认)" } else { "Frontend + Backend (full stack, default)" }

Write-Host $scopePrompt -ForegroundColor White
Write-Host "  [1] $option1"
Write-Host "  [2] $option2"

$scopeChoice = Read-Host "Select [2]"
if ([string]::IsNullOrWhiteSpace($scopeChoice)) { $scopeChoice = "2" }

if ($scopeChoice -eq "1") {
    $deployScope = "backend"
    $selected = if ($IsChinese) { "已选择" } else { "Selected" }
    Write-Host "${selected}: $(Get-Loc 'BackendOnly')"
} else {
    $deployScope = "full"
    $selected = if ($IsChinese) { "已选择" } else { "Selected" }
    Write-Host "${selected}: $(Get-Loc 'FullStack')"
}

# ================================================================
# Step 4: Git Status Check
# ================================================================
$step4Title = if ($IsChinese) { "Git 状态检查" } else { "Git Status Check" }
Write-Step 4 9 $step4Title

$gitStatus = git -C $repoRoot status --short

if ($gitStatus) {
    Write-Warn (Get-Loc "WorkingTreeHasChanges")
    git -C $repoRoot status --short | ForEach-Object { Write-Host "  $_" }
    Write-Host ""

    $opt1 = if ($IsChinese) { "提交更改" } else { "Commit changes" }
    $opt2 = if ($IsChinese) { "暂存更改" } else { "Stash changes" }
    $opt3 = if ($IsChinese) { "跳过推送（继续本地状态）" } else { "Skip pushing (continue with local state)" }
    $opt4 = if ($IsChinese) { "取消部署" } else { "Cancel deployment" }

    Write-Host "  [1] $opt1"
    Write-Host "  [2] $opt2"
    Write-Host "  [3] $opt3"
    Write-Host "  [4] $opt4"

    $gitChoice = Read-Host "Select [4]"
    if ([string]::IsNullOrWhiteSpace($gitChoice)) { $gitChoice = "4" }

    switch ($gitChoice) {
        "1" {
            $commitPrompt = if ($IsChinese) { "输入提交信息" } else { "Enter commit message" }
            Write-Host "${commitPrompt}:" -ForegroundColor White
            $msg = Read-Host
            if ([string]::IsNullOrWhiteSpace($msg)) {
                $msg = "WIP: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
            }
            git -C $repoRoot add -A
            git -C $repoRoot commit -m $msg
            Write-Success (Get-Loc "ChangesCommitted")
            $skipPush = $false
        }
        "2" {
            git -C $repoRoot stash push -m "Auto-stash before deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
            Write-Success (Get-Loc "ChangesStashed")
            $skipPush = $false
        }
        "3" {
            $skipPush = $true
            Write-Host (Get-Loc "SkipGitPush") -ForegroundColor Cyan
        }
        default {
            Write-Host (Get-Loc "Cancelled") -ForegroundColor Yellow
            exit 0
        }
    }
} else {
    Write-Success (Get-Loc "WorkingTreeClean")
    $skipPush = $false
}

# ================================================================
# Step 5: Preview & Confirm
# ================================================================
$step5Title = if ($IsChinese) { "预览并确认" } else { "Preview & Confirm" }
Write-Step 5 9 $step5Title

$branch = git -C $repoRoot rev-parse --abbrev-ref HEAD

$scopeText = if ($deployScope -eq "backend") { Get-Loc "BackendOnly" } else { Get-Loc "FullStack" }
$pushText = if ($skipPush) { Get-Loc "YesSkipPush" } else { Get-Loc "NoPush" }

$summaryTitle = if ($IsChinese) { "部署摘要" } else { "Deployment Summary" }
$targetLabel = if ($IsChinese) { "目标" } else { "Target" }
$branchLabel = if ($IsChinese) { "分支" } else { "Branch" }
$scopeLabel = if ($IsChinese) { "范围" } else { "Scope" }
$remoteDirLabel = if ($IsChinese) { "远程目录" } else { "Remote Dir" }
$localEnvLabel = if ($IsChinese) { "本地环境文件" } else { "Local Env" }
$gitPushLabel = if ($IsChinese) { "Git 推送" } else { "Git Push" }

Write-Host @"

=== $summaryTitle ===

${targetLabel}:         $piUser@$piHost`:$piPort
${branchLabel}:         $branch
${scopeLabel}:          $scopeText
${remoteDirLabel}:     $remoteDir
${localEnvLabel}:      $envFile
${gitPushLabel}:       $pushText

"@ -ForegroundColor White

$confirmPrompt = if ($IsChinese) { "确认部署" } else { "Ready to deploy" }
$confirmed = Confirm-Choice $confirmPrompt $false

if (-not $confirmed) {
    Write-Host (Get-Loc "Cancelled") -ForegroundColor Yellow
    exit 0
}

# ================================================================
# Step 6: Remote Environment Check
# ================================================================
$step6Title = if ($IsChinese) { "远程环境检查" } else { "Remote Environment Check" }
Write-Step 6 9 $step6Title

$checkingMsg = if ($IsChinese) { "正在检查" } else { "Checking" }
$dockerMsg = if ($IsChinese) { "Docker 环境" } else { "Docker environment" }
Write-Host "$checkingMsg $dockerMsg on Pi..."

$dockerStatus = Get-DockerRemoteStatus $piHost $piUser $piPort

if (-not $dockerStatus.DockerOk) {
    Write-Fail (Get-Loc "DockerDaemonNotRunning")

    # Debug: show actual output
    $debugInfo = if ($IsChinese) { "调试信息" } else { "Debug info" }
    Write-Host "  ${debugInfo}: $($dockerStatus.DockerOutput)" -ForegroundColor Gray

    $startDocker = if ($IsChinese) { "请在树莓派上启动 Docker" } else { "Please start Docker on your Raspberry Pi" }
    $retryDeploy = if ($IsChinese) { "然后重新运行此部署" } else { "Then restart this deployment" }
    $bootstrap = if ($IsChinese) { "自动初始化树莓派环境（推荐）" } else { "Run bootstrap on the Raspberry Pi (recommended)" }
    $retry = if ($IsChinese) { "重试检查" } else { "Retry checks" }
    $continue = if ($IsChinese) { "继续（可能会失败）" } else { "Continue anyway (may fail)" }
    $cancel = if ($IsChinese) { "取消" } else { "Cancel" }

    if ($IsChinese) {
        Write-Host @"

$startDocker：
  sudo systemctl start docker
  sudo systemctl enable docker

$retryDeploy
  [1] $bootstrap
  [2] $retry
  [3] $continue
  [4] $cancel

选择 [4]:
"@ -ForegroundColor Yellow
    } else {
        Write-Host @"

${startDocker}:
  sudo systemctl start docker
  sudo systemctl enable docker

${retryDeploy}
  [1] $bootstrap
  [2] $retry
  [3] $continue
  [4] $cancel

Select [4]:
"@ -ForegroundColor Yellow
    }

    $retryChoice = Read-Host
    if ([string]::IsNullOrWhiteSpace($retryChoice) -or $retryChoice -eq "4") {
        exit 0
    }
    if ($retryChoice -eq "1") {
        & $bootstrapScriptPath -PiHost $piHost -User $piUser -Port ([int]$piPort) -RemoteDir $remoteDir
        $dockerStatus = Get-DockerRemoteStatus $piHost $piUser $piPort
        if (-not $dockerStatus.DockerOk) {
            throw "Bootstrap completed but Docker is still unavailable on the Raspberry Pi."
        }
    } elseif ($retryChoice -eq "2") {
        & $MyInvocation.MyCommand.Path
        exit $LASTEXITCODE
    }
}

if (-not $dockerStatus.ComposeOk) {
    Write-Fail (Get-Loc "DockerComposeNotInstalled")

    # Debug: show actual output
    $debugInfo = if ($IsChinese) { "调试信息" } else { "Debug info" }
    Write-Host "  ${debugInfo}: $($dockerStatus.ComposeOutput)" -ForegroundColor Gray

    $installCompose = if ($IsChinese) { "请安装 Docker Compose" } else { "Please install Docker Compose" }
    $bootstrap = if ($IsChinese) { "自动初始化树莓派环境（推荐）" } else { "Run bootstrap on the Raspberry Pi (recommended)" }
    $retry = if ($IsChinese) { "重试检查" } else { "Retry checks" }
    $cancelOption = if ($IsChinese) { "取消" } else { "Cancel" }
    $continueOption = if ($IsChinese) { "继续" } else { "Continue" }

    if ($IsChinese) {
        Write-Host @"

$installCompose：
  sudo apt-get update && sudo apt-get install -y docker-compose

或使用 Docker Compose 插件：
  sudo apt-get install -y docker-compose-plugin

  [1] $bootstrap
  [2] $retry
  [3] $continueOption
  [4] $cancelOption

选择 [4]:
"@ -ForegroundColor Yellow
    } else {
        Write-Host @"

${installCompose}:
  sudo apt-get update && sudo apt-get install -y docker-compose

Or use the Docker Compose plugin:
  sudo apt-get install -y docker-compose-plugin

  [1] $bootstrap
  [2] $retry
  [3] $continueOption
  [4] $cancelOption

Select [4]:
"@ -ForegroundColor Yellow
    }

    $retryChoice = Read-Host
    if ([string]::IsNullOrWhiteSpace($retryChoice) -or $retryChoice -eq "4") {
        exit 0
    }
    if ($retryChoice -eq "1") {
        & $bootstrapScriptPath -PiHost $piHost -User $piUser -Port ([int]$piPort) -RemoteDir $remoteDir
        $dockerStatus = Get-DockerRemoteStatus $piHost $piUser $piPort
        if (-not $dockerStatus.ComposeOk) {
            throw "Bootstrap completed but Docker Compose is still unavailable on the Raspberry Pi."
        }
    } elseif ($retryChoice -eq "2") {
        & $MyInvocation.MyCommand.Path
        exit $LASTEXITCODE
    }
} elseif ($dockerStatus.ComposeCommand) {
    $detectedLabel = if ($IsChinese) { "检测到 Docker Compose 命令" } else { "Detected Docker Compose command" }
    Write-Info "${detectedLabel}: $($dockerStatus.ComposeCommand)"
}

Write-Success (Get-Loc "DockerEnvOK")

# ================================================================
# Step 7: Push Code (if not skipped)
# ================================================================
$step7Title = if ($IsChinese) { "推送代码" } else { "Push Code" }
Write-Step 7 9 $step7Title

if ($skipPush) {
    $skipMsg = if ($IsChinese) { "跳过 git push" } else { "Skipping git push" }
    Write-Host $skipMsg -ForegroundColor Cyan
} else {
    $pushingMsg = if ($IsChinese) { "正在推送" } else { "Pushing" }
    $toOriginMsg = if ($IsChinese) { "到远程" } else { "to origin" }
    Write-Host "$pushingMsg branch $branch $toOriginMsg..."
    git -C $repoRoot push origin $branch

    if ($LASTEXITCODE -ne 0) {
        Write-Fail (Get-Loc "FailedToPush")

        $retryMsg = if ($IsChinese) { "重试" } else { "Retry" }
        $skipMsg = if ($IsChinese) { "跳过推送，继续使用本地文件" } else { "Skip pushing, continue with local files" }
        $cancelMsg = if ($IsChinese) { "取消" } else { "Cancel" }

        Write-Host "  [1] $retryMsg"
        Write-Host "  [2] $skipMsg"
        Write-Host "  [3] $cancelMsg"

        $pushRetry = Read-Host "Select [3]"
        if ([string]::IsNullOrWhiteSpace($pushRetry) -or $pushRetry -eq "3") {
            exit 0
        }
        if ($pushRetry -eq "2") {
            $skipPush = $true
        } else {
            git -C $repoRoot push origin $branch
        }
    } else {
        Write-Success (Get-Loc "BranchPushed")
    }
}

# ================================================================
# Step 8: Upload Files
# ================================================================
$step8Title = if ($IsChinese) { "上传文件" } else { "Upload Files" }
Write-Step 8 9 $step8Title

$remoteEnv = "/tmp/vinote.env"
$remoteArchive = "/tmp/vinote-source.tar.gz"

$uploadingEnv = if ($IsChinese) { "正在上传 .env 文件" } else { "Uploading .env file" }
Write-Host "$uploadingEnv..."
scp -P $piPort $envPath "${piUser}@${piHost}:${remoteEnv}" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to upload env file" }
Write-Success (Get-Loc "EnvFileUploaded")

$creatingArchive = if ($IsChinese) { "正在创建源码包" } else { "Creating source archive" }
Write-Host "$creatingArchive..."
$tempArchive = Join-Path ([System.IO.Path]::GetTempPath()) "vinote-source-$PID.tar.gz"
$tempList = Join-Path ([System.IO.Path]::GetTempPath()) "vinote-source-$PID.txt"

$files = git -C $repoRoot ls-files --cached --modified --others --exclude-standard
if (-not $files) { throw "No files to deploy" }
[System.IO.File]::WriteAllLines($tempList, $files, [System.Text.UTF8Encoding]::new($false))
tar -czf $tempArchive -C $repoRoot -T $tempList

$uploadingArchive = if ($IsChinese) { "正在上传源码包" } else { "Uploading source archive" }
Write-Host "$uploadingArchive..."
scp -P $piPort $tempArchive "${piUser}@${piHost}:${remoteArchive}" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to upload source archive" }
Write-Success (Get-Loc "SourceArchiveUploaded")

Remove-Item $tempArchive, $tempList -Force

# ================================================================
# Step 9: Execute Deployment
# ================================================================
$step9Title = if ($IsChinese) { "执行部署" } else { "Execute Deployment" }
Write-Step 9 9 $step9Title

$buildArg = if ($deployScope -eq "backend") { "--no-deps backend" } else { "" }

$deployScript = @"
set -eu
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Missing required command on Raspberry Pi: docker compose or docker-compose" >&2
  exit 1
fi
mkdir -p `"$remoteDir`"
find `"$remoteDir`" -mindepth 1 -maxdepth 1 `
  ! -name data `
  ! -name output `
  ! -name .env `
  -exec rm -rf {} +
tar -xzf `"$remoteArchive`" -C `"$remoteDir`"
cp `"$remoteEnv`" `"$remoteDir`/.env"
rm -f `"$remoteArchive`"
rm -f `"$remoteEnv`"
cd `"$remoteDir`"
export COMPOSE_PROJECT_NAME=vinote
export DOCKER_DEFAULT_PLATFORM=linux/arm/v7
mkdir -p data output
`$COMPOSE_CMD up -d --build $buildArg
`$COMPOSE_CMD ps
"@

$tempScript = Join-Path ([System.IO.Path]::GetTempPath()) "vinote-deploy-$PID.sh"
$deployScriptLf = $deployScript -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($tempScript, $deployScriptLf, [System.Text.UTF8Encoding]::new($false))

$scriptPath = "/tmp/vinote-deploy.sh"

try {
    $uploadingScript = if ($IsChinese) { "正在上传部署脚本" } else { "Uploading deploy script" }
    Write-Host "$uploadingScript..."
    scp -P $piPort $tempScript "${piUser}@${piHost}:${scriptPath}" 2>&1 | Out-Null

    $deployingMsg = if ($IsChinese) { "正在部署到树莓派" } else { "Deploying VINote to Raspberry Pi" }
    Write-Host "$deployingMsg..."
    ssh -p $piPort $piUser@$piHost "bash '$scriptPath'; rm -f '$scriptPath'"

    Write-Success (Get-Loc "DeploymentComplete")

    # Get ports from env
    $frontendPort = "3100"
    $backendPort = "8900"
    if (Test-Path $envPath) {
        $fp = Get-Content $envPath | Where-Object { $_ -match '^FRONTEND_PORT=' } | Select-Object -First 1
        if ($fp) { $frontendPort = ($fp -split '=', 2)[1].Trim() }
        $bp = Get-Content $envPath | Where-Object { $_ -match '^BACKEND_PORT=' } | Select-Object -First 1
        if ($bp) { $backendPort = ($bp -split '=', 2)[1].Trim() }
    }

    $accessMsg = if ($IsChinese) { "访问 VINote" } else { "Access VINote" }
    $frontendLabel = if ($IsChinese) { "前端" } else { "Frontend" }
    $backendLabel = if ($IsChinese) { "后端" } else { "Backend" }
    $checkStatus = if ($IsChinese) { "在 Pi 上查看状态" } else { "To check status on Pi" }

    if ($IsChinese) {
        Write-Host @"

$accessMsg：
  - $frontendLabel：http://$piHost`:$frontendPort
  - $backendLabel：http://$piHost`:$backendPort
  - MCP：http://$piHost`:$backendPort/mcp

$checkStatus：
  ssh $piUser@$piHost
  cd $remoteDir && $(if ($dockerStatus.ComposeCommand) { $dockerStatus.ComposeCommand } else { "docker compose" }) ps
"@
    } else {
        Write-Host @"

${accessMsg}:
  - ${frontendLabel}: http://$piHost`:$frontendPort
  - ${backendLabel}:  http://$piHost`:$backendPort
  - MCP:      http://$piHost`:$backendPort/mcp

${checkStatus}:
  ssh $piUser@$piHost
  cd $remoteDir && $(if ($dockerStatus.ComposeCommand) { $dockerStatus.ComposeCommand } else { "docker compose" }) ps
"@
    }
}
finally {
    if (Test-Path $tempScript) { Remove-Item $tempScript -Force }
}
