@echo off
setlocal

set "ROOT=%~dp0"
powershell -ExecutionPolicy Bypass -File "%ROOT%run-app.ps1"
exit /b %ERRORLEVEL%
