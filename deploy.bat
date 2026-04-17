@echo off
title DNDKeep Deploy
color 0A
cd /d "C:\Users\Jared\OneDrive\Desktop\DNDKeep"

echo.
echo  ============================================
echo   DNDKeep Auto Deploy
echo  ============================================
echo.

git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Git not initialized. Run setup first.
    pause
    exit /b 1
)

REM Extract version from src\version.ts (must run before SW bump)
for /f "tokens=*" %%L in ('findstr "APP_VERSION = " src\version.ts') do (
    for /f "tokens=2 delims='" %%V in ("%%L") do set VER=%%V
)
if "%VER%"=="" set VER=unknown

echo  [1/4] Bumping service worker cache name to dndkeep-v%VER%...
powershell -NoProfile -Command "$f='public\sw.js'; if (Test-Path $f) { (Get-Content -Raw $f) -replace 'dndkeep-v[0-9.]+', 'dndkeep-v%VER%' | Set-Content -NoNewline $f }"

echo  [2/4] Staging all changes...
git add .

REM Fail fast if nothing actually changed (catches silent zip-extract failures)
git diff --cached --quiet
if %errorlevel% == 0 (
    echo.
    echo  ============================================
    echo   [ERROR] No staged changes detected!
    echo.
    echo   Did the zip extract properly into:
    echo   %CD%
    echo.
    echo   Common causes:
    echo   - Files locked by VS Code or 'npm run dev'
    echo   - OneDrive sync conflict on the folder
    echo   - Zip extracted to a subfolder by mistake
    echo  ============================================
    pause
    exit /b 1
)

echo  [3/4] Committing...
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set TIMESTAMP=%%i

git commit -m "deploy: v%VER% built %TIMESTAMP%"

echo  [4/4] Pushing to GitHub...
git push origin main 2>nul || git push origin master

if %errorlevel% == 0 (
    echo.
    echo  ============================================
    echo   DEPLOYED v%VER%! Live in ~60 seconds:
    echo   https://dndkeep.vercel.app
    echo  ============================================
) else (
    echo  [ERROR] Push failed - check git remote setup
)

echo.
pause
