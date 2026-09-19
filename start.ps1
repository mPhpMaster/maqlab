# Starts the MAQLAB server in the background and remembers its PID.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pidFile = Join-Path $root '.server.pid'
$logFile = Join-Path $root 'server.log'
$errFile = Join-Path $root 'server.err.log'

if (Test-Path $pidFile) {
    $existing = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($existing -and (Get-Process -Id $existing -ErrorAction SilentlyContinue)) {
        Write-Host "Server already running (PID $existing) - http://localhost:3000"
        exit 0
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

$proc = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $root `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $logFile -RedirectStandardError $errFile

Start-Sleep -Milliseconds 500
if ($proc.HasExited) {
    Write-Host "Server failed to start - check server.err.log" -ForegroundColor Red
    Get-Content $errFile -Tail 20 -ErrorAction SilentlyContinue
    exit 1
}

$proc.Id | Out-File -FilePath $pidFile -Encoding ascii
Write-Host "Server started (PID $($proc.Id)) - http://localhost:3000"
Write-Host "Logs: $logFile"
