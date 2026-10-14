$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$crmDir = Join-Path $root "crm"
$localDir = Join-Path $crmDir ".local"
$logFile = Join-Path $localDir "whatsapp-bot-local.log"
$tunnelPidFile = Join-Path $localDir "crm-tunnel.pid"
$watchdogPidFile = Join-Path $localDir "crm-tunnel-watchdog.pid"
$watchdogScript = Join-Path $PSScriptRoot "crm-tunnel-watchdog.ps1"
$sshKey = Join-Path $root ".secrets\oracle-crm.key"
$sshExe = "$env:WINDIR\System32\OpenSSH\ssh.exe"
$npmExe = "npm.cmd"
$localApiBase = "http://127.0.0.1:10000"
$useCrmTunnel = $false

New-Item -ItemType Directory -Path $localDir -Force | Out-Null

function Write-BotLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$stamp] $Message" | Out-File -FilePath $logFile -Append -Encoding utf8
}

function Test-CrmTunnel {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$localApiBase/healthz" -TimeoutSec 5
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
  } catch {
    return $false
  }
}

function Start-CrmTunnel {
  if (Test-CrmTunnel) {
    Write-BotLog "CRM tunnel already available on 127.0.0.1:10000."
    return
  }

  if (!(Test-Path $sshKey)) {
    throw "SSH key not found: $sshKey"
  }

  $argString = "-N -L 127.0.0.1:11000:127.0.0.1:10000 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i `"$sshKey`" opc@164.152.38.135"
  $process = Start-Process -FilePath $sshExe -ArgumentList $argString -WindowStyle Hidden -PassThru
  $process.Id | Out-File -FilePath $tunnelPidFile -Encoding ascii
  Write-BotLog "Started CRM SSH tunnel. PID=$($process.Id)."

  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 2
    if (Test-CrmTunnel) {
      Write-BotLog "CRM tunnel is ready."
      return
    }
  }

  throw "CRM tunnel did not become ready."
}

function Start-CrmTunnelWatchdog {
  if (!(Test-Path $watchdogScript)) {
    Write-BotLog "CRM tunnel watchdog script not found: $watchdogScript"
    return
  }

  $existingPid = 0
  if (Test-Path $watchdogPidFile) {
    $pidText = Get-Content -LiteralPath $watchdogPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    [void][int]::TryParse($pidText, [ref]$existingPid)
  }
  if ($existingPid -gt 0 -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    return
  }

  $process = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$watchdogScript`"" -WindowStyle Hidden -PassThru
  $process.Id | Out-File -FilePath $watchdogPidFile -Encoding ascii
  Write-BotLog "Started CRM tunnel watchdog. PID=$($process.Id)."
}

Write-BotLog "Starting local WhatsApp bot."
if ($useCrmTunnel) {
  Start-CrmTunnelWatchdog
  Start-CrmTunnel
} elseif (!(Test-CrmTunnel)) {
  throw "Local CRM API is not available at $localApiBase. Start it before the WhatsApp bot."
}

$env:WHATSAPP_BOT_ENABLED = "true"
$env:WHATSAPP_BOT_MODE = "auto"
$env:WHATSAPP_BOT_HEADLESS = "true"
$env:WHATSAPP_BOT_HIDE_WINDOW = "true"
$env:WHATSAPP_BOT_API_BASE_URL = $localApiBase
$env:ABR_API_BASE_URL = $localApiBase
$env:WHATSAPP_BOT_ACTIVE_CHAT_ONLY = "false"
$env:WHATSAPP_BOT_KEEP_UNREAD_FILTER = "true"
$env:WHATSAPP_BOT_RESPOND_EXISTING_UNREAD = "true"
$env:WHATSAPP_BOT_ALLOWED_CONTACT_PHONES = "+5512983205605,+5535997709232,+5512996103765"
$env:WHATSAPP_BOT_CONTACT_PHONE_ALIASES = "Meu Number=+5512996103765"
$env:WHATSAPP_BOT_NAV_TIMEOUT_MS = "120000"

Set-Location $crmDir
& $npmExe run bot:whatsapp 2>&1 | Tee-Object -FilePath $logFile -Append
