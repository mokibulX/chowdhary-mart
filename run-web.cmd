@echo off
setlocal

set "ROOT=%~dp0"
set "WEB_DIR=%ROOT%artifacts\web"
set "VITE_BIN="

for /d %%D in ("%ROOT%node_modules\.pnpm\vite@*") do (
  if exist "%%D\node_modules\vite\bin\vite.js" (
    set "VITE_BIN=%%D\node_modules\vite\bin\vite.js"
    goto :found
  )
)

:found
if "%VITE_BIN%"=="" (
  echo Vite dependency not found. Please install dependencies first.
  exit /b 1
)

echo Starting Chowdhary Mart...

cd /d "%WEB_DIR%"
for /l %%P in (5173,1,5190) do (
  powershell -NoProfile -Command "if ((Test-NetConnection -ComputerName 127.0.0.1 -Port %%P -InformationLevel Quiet -WarningAction SilentlyContinue) -eq $false) { exit 0 } else { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    echo Open this URL in your browser: http://127.0.0.1:%%P
    node "%VITE_BIN%" --config vite.config.ts --host 127.0.0.1 --port %%P
    exit /b %ERRORLEVEL%
  )
)

echo No free port found between 5173 and 5190.
exit /b 1
