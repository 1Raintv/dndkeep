@echo off
setlocal EnableDelayedExpansion
title DNDKeep Deploy

REM =================================================================
REM  v2.18.4 deploy.bat - bulletproof version
REM  Every command logs to deploy-log.txt so we can diagnose failures.
REM  Window will NEVER auto-close - always waits for a keypress at the end.
REM =================================================================

REM cd to the folder this script lives in (works from any checkout path,
REM not just C:\dev\DNDKeep — %~dp0 is the script's own directory).
cd /d "%~dp0" 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  [FATAL] Cannot cd to script directory %~dp0
    echo         Current dir: %CD%
    echo         Does the folder exist? Is it locked?
    echo.
    pause
    exit /b 1
)

REM Start fresh log
echo DNDKeep deploy log - %DATE% %TIME% > deploy-log.txt
echo Working dir: %CD% >> deploy-log.txt
echo. >> deploy-log.txt

REM ---- v2.593.0: concurrency lock ----------------------------------
REM A second deploy (or the background watcher) pushing while vite is
REM writing dist/ is how a partial dist reached production (v2.592
REM outage: shell booted but sibling chunks 404'd). deploy.lock makes
REM runs mutually exclusive; watch-and-deploy.ps1 honors it too.
REM Stale locks (>30 min, crashed run) are ignored.
REM v2.651.0: unnested (see the branch guard below for why) - the abort
REM used to sit in an if nested inside `if exist deploy.lock (...)` whose
REM block continued, so it printed [FATAL] and still exited 0.
set LOCK_ACTIVE=0
if exist deploy.lock (
    powershell -NoProfile -Command "if ((Get-Date) - (Get-Item 'deploy.lock').LastWriteTime -lt [TimeSpan]::FromMinutes(30)) { exit 1 } else { exit 0 }" >nul 2>&1
    if !errorlevel! neq 0 set LOCK_ACTIVE=1
)

if "%LOCK_ACTIVE%"=="1" (
    echo  [FATAL] Another deploy appears to be running ^(deploy.lock exists^).
    echo          If you're sure it isn't, delete deploy.lock and retry.
    echo.
    pause
    exit /b 1
)

if exist deploy.lock echo  [WARN] Stale deploy.lock found ^(older than 30 min^) - taking over.
echo locked at %DATE% %TIME% > deploy.lock

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

REM ---- v2.651.0: branch guard --------------------------------------
REM Vercel builds PRODUCTION from `main` only. Work now lands through
REM feature branches merged by PR (the audit-fixes -> PR #1 flow), which
REM this script predates. Run from a feature branch it did something
REM worse than nothing: step 6 committed to the CURRENT branch while
REM step 7 pushed the LOCAL `main` ref - two different branches - and
REM then printed "DEPLOYED!" for a build Vercel never saw.
REM Set DNDKEEP_ALLOW_BRANCH=1 to push a feature branch anyway (that is
REM a preview push; it does NOT deploy production).
for /f "tokens=*" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%B
if not defined BRANCH (
    echo  [FATAL] Could not determine the current git branch.
    del deploy.lock >nul 2>&1
    echo. & pause & exit /b 1
)
echo  Current branch: %BRANCH%
echo  Current branch: %BRANCH% >> deploy-log.txt

set DEPLOY_PREVIEW=0
if /i not "%BRANCH%"=="main" set DEPLOY_PREVIEW=1

REM Flattened into chained top-level ifs on purpose. `exit /b N` from an
REM if nested inside another if WHOSE OUTER BLOCK CONTINUES AFTERWARDS
REM does not propagate - cmd returns 0, so a caller reads the refusal as
REM success. Verified 2026-08-07; the deploy.lock guard above had the
REM same shape and the same bug. Keep these guards unnested.
if "%DEPLOY_PREVIEW%"=="1" if not "%DNDKEEP_ALLOW_BRANCH%"=="1" (
    echo.
    echo  ============================================
    echo   [ERROR] Not on main - refusing to deploy.
    echo.
    echo   You are on: %BRANCH%
    echo   Production is served from main, so deploying from
    echo   here would push a branch nothing serves.
    echo.
    echo   Land the work first:
    echo     git push -u origin %BRANCH%
    echo     gh pr create --fill
    echo     gh pr merge --merge
    echo     git checkout main ^&^& git pull
    echo.
    echo   Or push this branch as a preview ^(no prod deploy^):
    echo     set DNDKEEP_ALLOW_BRANCH=1 ^&^& deploy.bat
    echo  ============================================
    del deploy.lock >nul 2>&1
    echo. & pause & exit /b 1
)

if "%DEPLOY_PREVIEW%"=="1" echo  [WARN] Deploying from %BRANCH% - PREVIEW only, not production.

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
    echo        Missing dependencies - running npm install...
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
echo        (Hook + extended TS checks live in lint.bat - run separately.)

REM ---- Step 4 ----

REM Clean dist/ first - a failed build once left a partial dist that got
REM committed + deployed and served 404 chunks. Fresh dist every build.
if exist dist rmdir /s /q dist >>deploy-log.txt 2>&1

echo  [4/7] Running production build...
call npx vite build >build-output.tmp 2>&1
set BUILD_EXIT=!errorlevel!

REM Detect Vite success by output marker, not exit code.
REM Node on Windows has a known libuv bug where, after Vite finishes
REM and writes the entire dist/ tree, the process crashes during
REM shutdown with:
REM   "Assertion failed: !(handle->flags ^& UV_HANDLE_CLOSING),
REM    file src\win\async.c, line 76"
REM This fires during esbuild worker-pool teardown - the build output
REM is already complete, dist/ is intact, but errorlevel is non-zero.
REM We grep for "built in" (Vite's success line, e.g. "built in 3.91s")
REM as the authoritative success signal. If that line is present,
REM the build succeeded regardless of what Node did on shutdown.
set BUILD_OK=0
findstr /C:"built in" build-output.tmp >nul 2>&1
if !errorlevel! == 0 set BUILD_OK=1

if "!BUILD_OK!"=="0" (
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

if not "!BUILD_EXIT!"=="0" (
    findstr /C:"UV_HANDLE_CLOSING" build-output.tmp >nul 2>&1
    if !errorlevel! == 0 (
        echo        Build OK ^(ignored known Node-on-Windows libuv shutdown crash^).
    ) else (
        echo        Build OK ^(non-zero exit but dist is complete^).
    )
) else (
    echo        Build OK.
)
del build-output.tmp >nul 2>&1

REM ---- v2.593.0: dist integrity gate -------------------------------
REM Refuse to stage unless dist/ is provably complete: index.html
REM exists, every asset it references is on disk, and the assets dir
REM has a sane chunk count. Catches interrupted/locked writes before
REM they can reach production.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-dist.ps1 >>deploy-log.txt 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] dist/ failed the integrity check - refusing to deploy
    echo          a partial build. See deploy-log.txt. Re-run deploy.bat.
    del deploy.lock >nul 2>&1
    echo.
        pause
        exit /b 1
)
echo        dist integrity OK.

REM ---- Step 5 ----

echo  [5/7] Staging all changes...
git add . >>deploy-log.txt 2>&1
if %errorlevel% neq 0 (
    echo  [WARN] git add reported errors ^(files locked?^). Retrying in 5s...
    timeout /t 5 /nobreak >nul
    git add . >>deploy-log.txt 2>&1
    if !errorlevel! neq 0 (
        echo  [ERROR] git add failed twice - a file is locked ^(AV / OneDrive / editor^).
        echo          Staging a partial tree is how broken deploys happen. Aborting.
        del deploy.lock >nul 2>&1
        echo.
        pause
        exit /b 1
    )
)

REM ---- v2.651.0: a clean tree is now the NORMAL case ---------------
REM This script was built for the zip-extract era: Claude produced
REM dndkeep.zip, it was unpacked over the tree, and "nothing staged"
REM genuinely meant the extraction had failed - hence the hard abort
REM below with its OneDrive/subfolder diagnostic. Work is now committed
REM as it happens, so arriving here with nothing to stage just means
REM "already committed" and must NOT block the build+push.
set DID_COMMIT=1
git diff --cached --quiet
if %errorlevel% == 0 (
    set DID_COMMIT=0
    echo        Nothing new to stage - tree already clean.
)

echo  [6/7] Committing...
if "!DID_COMMIT!"=="1" (
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set TIMESTAMP=%%i
    git commit -m "deploy: v%VER% built !TIMESTAMP!" >>deploy-log.txt 2>&1
    if !errorlevel! neq 0 (
        echo  [ERROR] git commit failed. See deploy-log.txt
        del deploy.lock >nul 2>&1
        echo. & pause & exit /b 1
    )
    echo        Committed v%VER%.
) else (
    echo        Skipped - nothing to commit.
)

REM v2.651.0: push the branch we actually committed to. This used to be
REM a hardcoded `git push origin main` with a `master` fallback, which
REM pushed the local main REF regardless of which branch step 6 had just
REM committed to - so off main it shipped stale main and reported success.
echo  [7/7] Pushing %BRANCH% to GitHub...
git push origin %BRANCH% >>deploy-log.txt 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ============================================
    echo   [ERROR] Push failed. See deploy-log.txt
    echo.
    echo   Possible causes:
    echo   - No internet connection
    echo   - GitHub credentials expired
    echo   - Remote branch protection rules
    echo   - Branch is behind the remote ^(run: git pull --rebase^)
    echo  ============================================
    del deploy.lock >nul 2>&1
    echo. & pause & exit /b 1
)

del deploy.lock >nul 2>&1

echo.
echo  ============================================
if /i "%BRANCH%"=="main" (
    echo   DEPLOYED v%VER%! Live in ~60 seconds:
    echo   https://dndkeep.vercel.app
) else (
    echo   PUSHED %BRANCH% at v%VER% - PREVIEW only.
    echo   Production still serves main - open a PR to ship.
)
echo  ============================================
echo.
echo  Press any key to close this window...
pause >nul
