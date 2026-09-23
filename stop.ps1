# Stops the MAQLAB server.
#
# The PID file only knows about servers start.ps1 launched. One started by hand
# (node server.js) or orphaned by a crash is invisible to it, so this script
# used to report success while the port stayed taken and the next start died on
# EADDRINUSE. What actually matters is that the port ends up free, so that is
# what it checks.
#
# It only ever stops node processes. If something else is holding the port it
# says so and leaves it alone, because killing an unknown process to free a dev
# port is not a trade this script gets to make.
$root = $PSScriptRoot
$pidFile = Join-Path $root '.server.pid'

$port = 3000
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    $match = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
    if ($match) { $port = [int]$match.Matches[0].Groups[1].Value }
}

function Get-PortOwners([int]$p) {
    try {
        return @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        # Older boxes, or no Get-NetTCPConnection: fall back to parsing netstat.
        return @(netstat -ano | Select-String ":$p\s.*LISTENING" | ForEach-Object {
            ($_.ToString().Trim() -split '\s+')[-1]
        } | Sort-Object -Unique)
    }
}

function Stop-NodeProcess([int]$procId, [string]$why) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($proc.ProcessName -ne 'node') {
        Write-Host "PID $procId is '$($proc.ProcessName)', not node - left alone ($why)" -ForegroundColor Yellow
        return $false
    }
    try { Stop-Process -Id $procId -Force -Confirm:$false -ErrorAction Stop } catch { return $false }
    return $true
}

$stopped = @()

# 1. whatever start.ps1 recorded
if (Test-Path $pidFile) {
    $recorded = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($recorded -match '^\d+$' -and (Stop-NodeProcess ([int]$recorded) 'from the PID file')) {
        $stopped += [int]$recorded
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 2. anything still listening, however it got there
foreach ($owner in Get-PortOwners $port) {
    $procId = [int]$owner
    if ($stopped -contains $procId) { continue }
    if (Stop-NodeProcess $procId "still listening on port $port") { $stopped += $procId }
}

# A killed process is not the same as a released port, and the next start binds
# straight away — so wait for the port to actually come free rather than racing.
$freed = $false
for ($i = 0; $i -lt 50; $i++) {
    if (-not (Get-PortOwners $port)) { $freed = $true; break }
    Start-Sleep -Milliseconds 100
}

if ($stopped.Count) {
    Write-Host "Stopped node PID(s): $($stopped -join ', ')"
} else {
    Write-Host "No MAQLAB server was running."
}
if (-not $freed) {
    Write-Host "Port $port is still in use by something this script will not stop." -ForegroundColor Yellow
    exit 1
}
