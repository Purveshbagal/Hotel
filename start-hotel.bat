@echo off
title Hotel Management System
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org ^(version 22 or newer^).
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies, please wait...
  call npm install || goto :error
)

if not exist ".next\BUILD_ID" (
  echo Building the application for the first time, please wait...
  call npm run build || goto :error
)

echo.
echo Hotel Management System is starting on http://localhost:3000
echo Other devices on the network can open http://%COMPUTERNAME%:3000
echo Keep this window open. Press Ctrl+C to stop.
echo.
call npm start
goto :eof

:error
echo.
echo Something went wrong. See the messages above.
pause
exit /b 1
