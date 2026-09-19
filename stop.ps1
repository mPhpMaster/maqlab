# Stops the MAQLAB server started by start.ps1.
$root = $PSScriptRoot
$pidFile = Join-Path $root '.server.pid'

if (-not (Test-Path $pidFile)) {
    Write-Host "No PID file found - server may not be running."
    exit 0
}

$procId = Get-Content $pidFile -ErrorAction SilentlyContinue
if ($procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $procId -Force -Confirm:$false
    Write-Host "Stopped server (PID $procId)"
} else {
    Write-Host "Process $procId not running - already stopped."
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
