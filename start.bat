@echo off
setlocal enabledelayedexpansion
title Department Knowledge Base System

echo ========================================
echo   Department Knowledge Base System
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed on this machine.
    echo.
    echo Please install Node.js 18+ first:
    echo   Download: https://nodejs.org/
    echo.
    echo After installing Node.js, reopen this terminal
    echo and run start.bat again.
    echo.
    pause
    exit /b 1
)

echo [INFO] Node.js version:
call node --version
echo.

REM Switch to script directory
cd /d "%~dp0"

REM Install dependencies if missing
if not exist "node_modules\" (
    echo [INFO] First run, installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Dependency installation failed!
        pause
        exit /b 1
    )
    echo.
    echo [INFO] Dependencies installed successfully.
    echo.
) else (
    echo [INFO] Dependencies already exist, skipping install.
    echo.
)

REM Ensure data directories exist
if not exist "data\" mkdir data
if not exist "uploads\" mkdir uploads

echo ========================================
echo   Starting service...
echo   URL: http://localhost:3000
echo   Press Ctrl+C to stop
echo ========================================
echo.

REM Start server
call node server.js

pause