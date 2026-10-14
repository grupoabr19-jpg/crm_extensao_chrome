$ErrorActionPreference = "Continue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$crmDir = Join-Path $root "crm"
$localDir = Join-Path $crmDir ".local"
$logFile = Join-Path $localDir "whatsapp-bot-local.log"
$tunnelPidFile = Join-Path $localDir "crm-tunnel.pid"
$sshKey = Join-Path $root ".secrets\oracle-crm.key"
$sshExe = "$env:WINDIR\System32\OpenSSH\ssh.exe"
$localApiBase = "http://127.0.0.1:11000"

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

function Stop-CrmTunnel {
  if (!(Test-Path $tunnelPidFile)) { return }
  $pidText = Get-Content -LiteralPath $tunnelPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  $tunnelPid = 0
  if ([int]::TryParse($pidText, [ref]$tunnelPid)) {
    Stop-Process -Id $tunnelPid -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $tunnelPidFile -Force -ErrorAction SilentlyContinue
}

function Start-CrmTunnel {
  if (!(Test-Path $sshKey)) {
    Write-BotLog "CRM tunnel key not found: $sshKey"
    return
  }

  Stop-CrmTunnel
  $argString = "-N -L 127.0.0.1:11000:127.0.0.1:10000 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i `"$sshKey`" opc@164.152.38.135"
  $process = Start-Process -FilePath $sshExe -ArgumentList $argString -WindowStyle Hidden -PassThru
  $process.Id | Out-File -FilePath $tunnelPidFile -Encoding ascii
  Write-BotLog "Started CRM SSH tunnel. PID=$($process.Id)."
}

Write-BotLog "CRM tunnel watchdog started."

while ($true) {
  if (!(Test-CrmTunnel)) {
    Write-BotLog "CRM tunnel health check failed; restarting tunnel."
    Start-CrmTunnel
  }
  Start-Sleep -Seconds 20
}
