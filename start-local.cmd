@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-app.ps1"
if errorlevel 1 (
  echo.
  echo Chowdhary Mart failed to start. Check the latest api-server and web-start error logs.
  pause
)
