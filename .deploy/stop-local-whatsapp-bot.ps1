$ErrorActionPreference = "Continue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$crmDir = Join-Path $root "crm"
$localDir = Join-Path $crmDir ".local"
$logFile = Join-Path $localDir "whatsapp-bot-local.log"
$tunnelPidFile = Join-Path $localDir "crm-tunnel.pid"
$watchdogPidFile = Join-Path $localDir "crm-tunnel-watchdog.pid"

function Write-BotLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$stamp] $Message" | Out-File -FilePath $logFile -Append -Encoding utf8
}

try {
  Stop-ScheduledTask -TaskName "ABR WhatsApp Bot Local" -ErrorAction SilentlyContinue
  Write-BotLog "Requested scheduled task stop."
} catch {}

if (Test-Path $tunnelPidFile) {
  $pidText = (Get-Content $tunnelPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $tunnelPid = 0
  if ([int]::TryParse($pidText, [ref]$tunnelPid)) {
    Stop-Process -Id $tunnelPid -Force -ErrorAction SilentlyContinue
    Write-BotLog "Stopped CRM SSH tunnel. PID=$tunnelPid."
  }
  Remove-Item -LiteralPath $tunnelPidFile -Force -ErrorAction SilentlyContinue
}

if (Test-Path $watchdogPidFile) {
  $pidText = (Get-Content $watchdogPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $watchdogPid = 0
  if ([int]::TryParse($pidText, [ref]$watchdogPid)) {
    Stop-Process -Id $watchdogPid -Force -ErrorAction SilentlyContinue
    Write-BotLog "Stopped CRM tunnel watchdog. PID=$watchdogPid."
  }
  Remove-Item -LiteralPath $watchdogPidFile -Force -ErrorAction SilentlyContinue
}
