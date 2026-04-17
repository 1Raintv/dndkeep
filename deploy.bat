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

echo  [1/6] Bumping service worker cache name to dndkeep-v%VER%...
powershell -NoProfile -Command "$f='public\sw.js'; if (Test-Path $f) { (Get-Content -Raw $f) -replace 'dndkeep-v[0-9.]+', 'dndkeep-v%VER%' | Set-Content -NoNewline $f }"

echo  [2/6] Checking dependencies are installed...
if not exist "node_modules\three\package.json" goto needs_install
if not exist "node_modules\cannon-es\package.json" goto needs_install
if not exist "node_modules\react\package.json" goto needs_install
if not exist "node_modules\@supabase\supabase-js\package.json" goto needs_install
if not exist "node_modules\vite\package.json" goto needs_install
goto deps_ok

:needs_install
echo        Missing or stale dependencies — running npm install...
call npm install
if %errorlevel% neq 0 (
    echo  [ERROR] npm install failed.
    pause
    exit /b 1
)

:deps_ok
echo        Dependencies OK.

echo  [3/6] Running production build (catches errors before deploying)...
call npx vite build >nul 2>build-output.tmp
if %errorlevel% neq 0 (
    echo.
    echo  ============================================
    echo   [ERROR] Build failed! See errors below:
    echo  ============================================
    echo.
    type build-output.tmp
    del build-output.tmp
    echo.
    echo   Fix the errors above before deploying.
    echo   Vercel will fail on the same errors if you push now.
    echo.
    echo   Tip: if you see "Rollup failed to resolve import",
    echo   try running 'npm install' manually then retry.
    echo  ============================================
    pause
    exit /b 1
)
del build-output.tmp
echo        Build OK.

echo  [4/6] Staging all changes...
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

echo  [5/6] Committing...
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set TIMESTAMP=%%i

git commit -m "deploy: v%VER% built %TIMESTAMP%"

echo  [6/6] Pushing to GitHub...
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
