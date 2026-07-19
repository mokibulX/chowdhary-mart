$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $root "artifacts\api-server"

Write-Host "Starting Chowdhary Mart API..." -ForegroundColor Green

$busy = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  foreach ($pidValue in ($busy | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") {
      Stop-Process -Id $pidValue -Force
    }
  }
  Start-Sleep -Seconds 1
}

Set-Location $apiDir
node .\build.mjs

if (-not (Test-Path (Join-Path $apiDir "dist\index.mjs"))) {
  Write-Host "API build failed: dist\index.mjs was not created." -ForegroundColor Red
  exit 1
}

Write-Host "API ready soon: http://127.0.0.1:5000/api/health/ready" -ForegroundColor Cyan
node .\dist\index.mjs
