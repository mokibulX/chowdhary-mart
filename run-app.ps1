$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Stop-NodeListener([int]$Port) {
  $processIds = @()
  try {
    $processIds += Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    $netstatLines = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+(\d+)$"
    foreach ($line in $netstatLines) {
      if ($line.Matches.Count) { $processIds += [int]$line.Matches[0].Groups[1].Value }
    }
  }
  foreach ($pidValue in ($processIds | Select-Object -Unique)) {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "node") {
      Stop-Process -Id $pidValue -Force
    }
  }
}

function Wait-ForUrl([string]$Url, [int]$Attempts = 30) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Start-DetachedScript([string]$ScriptPath) {
  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = "powershell.exe"
  $info.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $true
  $info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  return [System.Diagnostics.Process]::Start($info)
}

Write-Host "Starting Chowdhary Mart API and website..." -ForegroundColor Green
Stop-NodeListener 5000
Stop-NodeListener 5173
Start-Sleep -Seconds 1

$apiProcess = Start-DetachedScript (Join-Path $root "run-server.ps1")

if (-not (Wait-ForUrl "http://127.0.0.1:5000/api/health/ready" 35)) {
  Write-Host "API failed to start. Run .\run-server.ps1 to see the detailed error." -ForegroundColor Red
  exit 1
}

$webProcess = Start-DetachedScript (Join-Path $root "run-web.ps1")

if (-not (Wait-ForUrl "http://127.0.0.1:5173" 25)) {
  Write-Host "Website failed to start. Run .\run-web.ps1 to see the detailed error." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Chowdhary Mart is ready." -ForegroundColor Green
Write-Host "Website: http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "API:     http://127.0.0.1:5000/api/health" -ForegroundColor Cyan
Write-Host "API PID: $($apiProcess.Id) | Web PID: $($webProcess.Id)" -ForegroundColor DarkGray
