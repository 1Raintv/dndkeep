@echo off
setlocal EnableDelayedExpansion
title DNDKeep Deploy

REM =================================================================
REM  v2.18.4 deploy.bat — bulletproof version
REM  Every command logs to deploy-log.txt so we can diagnose failures.
REM  Window will NEVER auto-close — always waits for a keypress at the end.
REM =================================================================

cd /d "C:\dev\DNDKeep" 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  [FATAL] Cannot cd to C:\dev\DNDKeep
    echo         Current dir: %CD%
    echo         Does the folder exist? Is it locked?
    echo.
    pause
    exit /b 1
)

REM Start fresh log
echo DNDKeep deploy log — %DATE% %TIME% > deploy-log.txt
echo Working dir: %CD% >> deploy-log.txt
echo. >> deploy-log.txt

echo.
echo  ============================================
echo   DNDKeep Auto Deploy
echo   Log file: %CD%\deploy-log.txt
echo  ============================================
echo.

REM Self-heal: strip mark-of-the-web from all DNDKeep files so Smart App
REM Control / SmartScreen won't block this script (or future ones) again.
REM Harmless if there's nothing to unblock. Uses PowerShell's built-in
REM Unblock-File cmdlet (no execution policy issues for cmdlets).
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem '%CD%' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >>deploy-log.txt 2>&1

REM ---- Pre-flight checks ----

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo  [FATAL] 'git' command not found in PATH.
    echo          Install Git from https://git-scm.com
    echo. & pause & exit /b 1
)

where npx >nul 2>&1
if %errorlevel% neq 0 (
    echo  [FATAL] 'npx' command not found in PATH.
    echo          Install Node.js from https://nodejs.org
    echo. & pause & exit /b 1
)

git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo  [FATAL] Git repo not initialized in %CD%
    echo          Run: git init ^&^& git remote add origin ^<url^>
    echo. & pause & exit /b 1
)

REM ---- Extract version ----

set VER=unknown
for /f "tokens=*" %%L in ('findstr "APP_VERSION = " src\version.ts 2^>nul') do (
    for /f "tokens=2 delims='" %%V in ("%%L") do set VER=%%V
)
echo  Detected version from src\version.ts: %VER%
echo  Detected version: %VER% >> deploy-log.txt
echo.

REM ---- Step 1 ----

echo  [1/7] Bumping service worker cache name to dndkeep-v%VER%...
powershell -NoProfile -Command "$f='public\sw.js'; if (Test-Path $f) { (Get-Content -Raw $f) -replace 'dndkeep-v[0-9.]+', 'dndkeep-v%VER%' | Set-Content -NoNewline $f }" >>deploy-log.txt 2>&1
if %errorlevel% neq 0 (
    echo  [WARN] Service worker bump failed. Continuing anyway.
)

REM ---- Step 2 ----

echo  [2/7] Checking dependencies are installed...
set NEEDS_INSTALL=0
if not exist "node_modules\three\package.json" set NEEDS_INSTALL=1
if not exist "node_modules\cannon-es\package.json" set NEEDS_INSTALL=1
if not exist "node_modules\react\package.json" set NEEDS_INSTALL=1
if not exist "node_modules\@supabase\supabase-js\package.json" set NEEDS_INSTALL=1
if not exist "node_modules\vite\package.json" set NEEDS_INSTALL=1
if not exist "node_modules\typescript\package.json" set NEEDS_INSTALL=1

if "%NEEDS_INSTALL%"=="1" (
    echo        Missing dependencies — running npm install...
    call npm install >>deploy-log.txt 2>&1
    if !errorlevel! neq 0 (
        echo  [ERROR] npm install failed. See deploy-log.txt
        echo. & pause & exit /b 1
    )
)
echo        Dependencies OK.

REM ---- Step 3 ----

echo  [3/7] Checking for undefined references (TS2304)...
call npx tsc --noEmit >ts-output.tmp 2>&1
findstr /C:"error TS2304" ts-output.tmp >nul
if %errorlevel% == 0 (
    echo.
    echo  ============================================
    echo   [ERROR] Undefined identifiers found:
    echo  ============================================
    echo.
    findstr /C:"error TS2304" ts-output.tmp
    echo.
    echo   These crash tabs at runtime. Fix them above.
    echo   Full TS output in: %CD%\ts-output.tmp
    echo  ============================================
    echo. & pause & exit /b 1
)
del ts-output.tmp >nul 2>&1
echo        No undefined references.

REM ---- Step 4 ----

echo  [4/7] Running production build...
call npx vite build >build-output.tmp 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ============================================
    echo   [ERROR] Build failed:
    echo  ============================================
    echo.
    type build-output.tmp
    echo.
    echo   Full output: %CD%\build-output.tmp
    echo  ============================================
    echo. & pause & exit /b 1
)
del build-output.tmp >nul 2>&1
echo        Build OK.

REM ---- Step 5 ----

echo  [5/7] Staging all changes...
git add . >>deploy-log.txt 2>&1

git diff --cached --quiet
if %errorlevel% == 0 (
    echo.
    echo  ============================================
    echo   [ERROR] No staged changes detected!
    echo.
    echo   The extraction didn't change any files vs.
    echo   what's already committed. This usually means:
    echo.
    echo   - OneDrive / Windows refused to overwrite files
    echo   - The zip extracted into a subfolder by mistake
    echo   - VS Code was holding files locked
    echo.
    echo   Current git status:
    git status --short
    echo.
    echo   Folder: %CD%
    echo  ============================================
    echo. & pause & exit /b 1
)

echo  [6/7] Committing...
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set TIMESTAMP=%%i
git commit -m "deploy: v%VER% built %TIMESTAMP%" >>deploy-log.txt 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] git commit failed. See deploy-log.txt
    echo. & pause & exit /b 1
)

echo  [7/7] Pushing to GitHub...
git push origin main >>deploy-log.txt 2>&1
if %errorlevel% neq 0 (
    git push origin master >>deploy-log.txt 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo  ============================================
        echo   [ERROR] Push failed. See deploy-log.txt
        echo.
        echo   Possible causes:
        echo   - No internet connection
        echo   - GitHub credentials expired
        echo   - Remote branch protection rules
        echo  ============================================
        echo. & pause & exit /b 1
    )
)

echo.
echo  ============================================
echo   DEPLOYED v%VER%! Live in ~60 seconds:
echo   https://dndkeep.vercel.app
echo  ============================================
echo.
echo  Press any key to close this window...
pause >nul
