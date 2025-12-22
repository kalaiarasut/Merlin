@echo off
:: Start AI Services (Ollama + Redis)
:: Run this script before starting the Marlin project

echo ========================================
echo   CMLRE Marine Data Platform - Services
echo ========================================
echo.

:: Change to project directory
cd /d "%~dp0"

:: Start Redis in WSL (daemonized)
echo [1/2] Starting Redis in WSL...
wsl -e redis-server --daemonize yes
if %errorlevel%==0 (
    echo       Redis started successfully!
) else (
    echo       [Warning] Redis may not have started. Check WSL.
)

echo.

:: Start Ollama in a new window
echo [2/2] Starting Ollama...
start "Ollama Server" cmd /k "ollama serve"

echo.
echo ========================================
echo   Services Started!
echo ========================================
echo.
echo   Redis:  localhost:6379 (WSL)
echo   Ollama: localhost:11434
echo.
echo   Press any key to close this window...
pause > nul
