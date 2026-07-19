param(
  [string]$Task = "cmart"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

switch ($Task.ToLowerInvariant()) {
  "cmart" {
    powershell -ExecutionPolicy Bypass -File (Join-Path $root "run-app.ps1")
  }
  "app" {
    powershell -ExecutionPolicy Bypass -File (Join-Path $root "run-app.ps1")
  }
  "api" {
    powershell -ExecutionPolicy Bypass -File (Join-Path $root "run-server.ps1")
  }
  "server" {
    powershell -ExecutionPolicy Bypass -File (Join-Path $root "run-server.ps1")
  }
  "web" {
    powershell -ExecutionPolicy Bypass -File (Join-Path $root "run-web.ps1")
  }
  default {
    Write-Host "Unknown command: $Task" -ForegroundColor Red
    Write-Host "Use: .\run.ps1 cmart  or  .\run.ps1 api  or  .\run.ps1 web" -ForegroundColor Yellow
    exit 1
  }
}
