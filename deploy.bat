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

echo  [1/3] Staging all changes...
git add .

echo  [2/3] Committing...
for /f "tokens=*" %%i in ('powershell -command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set TIMESTAMP=%%i
for /f "tokens=3 delims= " %%v in ('findstr "APP_VERSION" src\version.ts') do set VER=%%v
set VER=%VER:'=%
set VER=%VER:;=%
git commit -m "deploy: v%VER% built %TIMESTAMP%"

echo  [3/3] Pushing to GitHub...
git push origin main 2>nul || git push origin master

if %errorlevel% == 0 (
    echo.
    echo  ============================================
    echo   DEPLOYED! Live in ~60 seconds:
    echo   https://dndkeep.vercel.app
    echo  ============================================
) else (
    echo  [ERROR] Push failed - check git remote setup
)

echo.
pause
