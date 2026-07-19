$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $root "artifacts\api-server"
$apiLog = Join-Path $root "api-server.out.log"
$apiErr = Join-Path $root "api-server.err.log"
$webLog = Join-Path $root "web-start.out.log"
$webErr = Join-Path $root "web-start.err.log"

Write-Host "Starting Chowdhary Mart full app..." -ForegroundColor Green

$apiBusy = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($apiBusy) {
  foreach ($pidValue in ($apiBusy | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") { Stop-Process -Id $pidValue -Force }
  }
  Start-Sleep -Seconds 1
}

Remove-Item -Force $apiLog, $apiErr, $webLog, $webErr -ErrorAction SilentlyContinue
Set-Location $apiDir
node .\build.mjs

if (-not (Test-Path (Join-Path $apiDir "dist\index.mjs"))) {
  Write-Host "API build failed: dist\index.mjs was not created." -ForegroundColor Red
  exit 1
}

Start-Process -FilePath "node" `
  -ArgumentList ".\dist\index.mjs" `
  -WorkingDirectory $apiDir `
  -RedirectStandardOutput $apiLog `
  -RedirectStandardError $apiErr `
  -WindowStyle Hidden

$apiReady = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/health/ready" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $apiReady = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $apiReady) {
  Write-Host "API failed to start. Check api-server.err.log / api-server.out.log" -ForegroundColor Red
  exit 1
}

Write-Host "API ready: http://127.0.0.1:5000/api/health/ready" -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File (Join-Path $root "run-web.ps1")
