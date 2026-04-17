@echo off
echo =====================================
echo DNDKeep Deployment Script v2.17.0
echo =====================================

REM Get current date for commit message
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATE=%%c-%%a-%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a:%%b
set DATETIME=%DATE% %TIME%

echo.
echo Checking git status...
git status

echo.
echo Adding all changes...
git add .

echo.
echo Committing changes...
git commit -m "deploy: v2.17.0 built %DATETIME%"

echo.
echo Pushing to GitHub...
git push origin main

echo.
echo =====================================
echo Deployment completed!
echo Vercel will automatically deploy from GitHub
echo Check https://dndkeep.vercel.app in a few minutes
echo =====================================

pause
