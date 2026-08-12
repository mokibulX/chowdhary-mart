$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $root "artifacts\api-server"
$logStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$apiLog = Join-Path $root "api-server-$logStamp.out.log"
$apiErr = Join-Path $root "api-server-$logStamp.err.log"
$webLog = Join-Path $root "web-start-$logStamp.out.log"
$webErr = Join-Path $root "web-start-$logStamp.err.log"

Write-Host "Starting Chowdhary Mart full app..." -ForegroundColor Green

$apiBusy = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($apiBusy) {
  foreach ($pidValue in ($apiBusy | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") { Stop-Process -Id $pidValue -Force }
  }
  Start-Sleep -Seconds 1
}

Set-Location $apiDir
node .\build.mjs

if (-not (Test-Path (Join-Path $apiDir "dist\index.mjs"))) {
  Write-Host "API build failed: dist\index.mjs was not created." -ForegroundColor Red
  exit 1
}

$nodePath = (Get-Command node).Source
$apiOutStream = [System.IO.StreamWriter]::new($apiLog, $false)
$apiErrStream = [System.IO.StreamWriter]::new($apiErr, $false)
$apiProcessInfo = [System.Diagnostics.ProcessStartInfo]::new()
$apiProcessInfo.FileName = $nodePath
$apiProcessInfo.Arguments = "dist\index.mjs"
$apiProcessInfo.WorkingDirectory = $apiDir
$apiProcessInfo.UseShellExecute = $false
$apiProcessInfo.RedirectStandardOutput = $true
$apiProcessInfo.RedirectStandardError = $true
$apiProcessInfo.CreateNoWindow = $true
$apiProcess = [System.Diagnostics.Process]::new()
$apiProcess.StartInfo = $apiProcessInfo
$apiProcess.add_OutputDataReceived({
  param($sender, $eventArgs)
  if ($eventArgs.Data -ne $null) {
    $apiOutStream.WriteLine($eventArgs.Data)
    $apiOutStream.Flush()
  }
})
$apiProcess.add_ErrorDataReceived({
  param($sender, $eventArgs)
  if ($eventArgs.Data -ne $null) {
    $apiErrStream.WriteLine($eventArgs.Data)
    $apiErrStream.Flush()
  }
})
if (-not $apiProcess.Start()) {
  Write-Host "API failed to start process." -ForegroundColor Red
  exit 1
}
$apiProcess.BeginOutputReadLine()
$apiProcess.BeginErrorReadLine()

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
