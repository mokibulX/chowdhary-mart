$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$webDir = Join-Path $root "artifacts\web"
$viteBin = Get-ChildItem -Path (Join-Path $root "node_modules\.pnpm") -Directory -Filter "vite@*" |
  Select-Object -First 1 |
  ForEach-Object { Join-Path $_.FullName "node_modules\vite\bin\vite.js" }

if (-not $viteBin -or -not (Test-Path $viteBin)) {
  Write-Host "Vite dependency not found. Please install dependencies first." -ForegroundColor Red
  exit 1
}

Write-Host "Starting Chowdhary Mart..." -ForegroundColor Green

Set-Location $webDir
for ($port = 5173; $port -le 5190; $port++) {
  $busy = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
  if (-not $busy) {
    Write-Host "Open this URL in your browser: http://127.0.0.1:$port" -ForegroundColor Cyan
    node $viteBin --config vite.config.ts --host 127.0.0.1 --port $port
    exit $LASTEXITCODE
  }
}

Write-Host "No free port found between 5173 and 5190." -ForegroundColor Red
exit 1
