@echo off
set "TASK=%~1"
if "%TASK%"=="" set "TASK=cmart"

if /I "%TASK%"=="cmart" goto cmart
if /I "%TASK%"=="app" goto cmart
if /I "%TASK%"=="api" goto api
if /I "%TASK%"=="server" goto api
if /I "%TASK%"=="web" goto web

echo Unknown command: %TASK%
echo Use: run cmart  or  run api  or  run web
exit /b 1

:cmart
powershell -ExecutionPolicy Bypass -File "%~dp0run-app.ps1"
exit /b %ERRORLEVEL%

:api
powershell -ExecutionPolicy Bypass -File "%~dp0run-server.ps1"
exit /b %ERRORLEVEL%

:web
powershell -ExecutionPolicy Bypass -File "%~dp0run-web.ps1"
exit /b %ERRORLEVEL%
