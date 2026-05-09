@echo off
setlocal EnableDelayedExpansion
title DNDKeep Lint Check

REM =================================================================
REM  v2.468.0 lint.bat - standalone hook + scope check
REM
REM  Run this manually before deploying when you want extra confidence.
REM  Catches the bug families that crashed v2.459-v2.462 (React error
REM  #310, scope-busted refs) - things the deploy.bat TS2304 grep
REM  doesn't catch.
REM
REM  This script is INTENTIONALLY simpler than deploy.bat: it does one
REM  thing, has no PowerShell calls, no service-worker bumping, no git.
REM  If something goes wrong, the failure mode is "you see the error
REM  on screen" rather than "deploy aborts halfway through and you're
REM  confused about state".
REM
REM  Exit codes: 0 = pass, 1 = hook violations, 2 = TS scope errors.
REM =================================================================

cd /d "C:\dev\DNDKeep" 2>nul
if %errorlevel% neq 0 (
    echo  [FATAL] Cannot cd to C:\dev\DNDKeep
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   DNDKeep Lint Check
echo  ============================================
echo.

REM ---- Pass 1: rules-of-hooks ----

echo  [1/2] Checking React hook rules...
echo        Running eslint, this takes ~5-10 seconds...

REM Boring direct invocation. Output captured to a file; eslint's
REM exit code is irrelevant - we make our pass/fail decision from
REM the file contents via findstr.
node "node_modules\eslint\bin\eslint.js" . > lint-output.tmp 2>nul
echo        eslint finished. Scanning output...

findstr /C:"rules-of-hooks" lint-output.tmp >nul
if %errorlevel% == 0 (
    echo.
    echo  ============================================
    echo   [FAIL] React hook-rule violations found:
    echo  ============================================
    echo.
    findstr /C:"rules-of-hooks" lint-output.tmp
    echo.
    echo   These crash on first render (React error #310/#300).
    echo   Move the offending hook BEFORE any conditional return,
    echo   or rename the function if it isn't actually a hook.
    echo   Full output: %CD%\lint-output.tmp
    echo  ============================================
    echo.
    pause
    exit /b 1
)
echo        No hook violations.

REM ---- Pass 2: TS2304 + TS2552 ----

echo.
echo  [2/2] Checking for undefined / scope-busted identifiers...
echo        Running tsc, this takes ~10-20 seconds...

node "node_modules\typescript\bin\tsc" --noEmit > tsc-output.tmp 2>nul
echo        tsc finished. Scanning output...

REM Two separate greps; combine results via flag var.
set TS_BAD=0
findstr /C:"error TS2304" tsc-output.tmp >nul
if %errorlevel% == 0 set TS_BAD=1
findstr /C:"error TS2552" tsc-output.tmp >nul
if %errorlevel% == 0 set TS_BAD=1

if "%TS_BAD%"=="1" (
    echo.
    echo  ============================================
    echo   [FAIL] Undefined identifiers found:
    echo  ============================================
    echo.
    findstr /C:"error TS2304" tsc-output.tmp
    findstr /C:"error TS2552" tsc-output.tmp
    echo.
    echo   These crash tabs at runtime. Fix them, then re-run.
    echo   Full output: %CD%\tsc-output.tmp
    echo  ============================================
    echo.
    pause
    exit /b 2
)
echo        No undefined references.

del lint-output.tmp >nul 2>&1
del tsc-output.tmp >nul 2>&1

echo.
echo  ============================================
echo   PASS - Safe to deploy.
echo  ============================================
echo.
pause
