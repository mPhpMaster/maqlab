# Restarts the MAQLAB server (stop.ps1 then start.ps1).
$root = $PSScriptRoot
& (Join-Path $root 'stop.ps1')
Start-Sleep -Milliseconds 400
& (Join-Path $root 'start.ps1')
