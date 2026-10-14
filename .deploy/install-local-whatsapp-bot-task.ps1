$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "start-local-whatsapp-bot.ps1"
$taskName = "ABR WhatsApp Bot Local"
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 30) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs the ABR WhatsApp bot locally with a hidden Chromium session and CRM SSH tunnel." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host "Installed and started scheduled task: $taskName"
