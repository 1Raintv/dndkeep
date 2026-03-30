@echo off
echo DNDKeep Deploy
echo ---------------

:: Check zip exists
if not exist "%~dp0dndkeep.zip" (
    echo ERROR: dndkeep.zip not found in this folder.
    echo Download it from Claude and place it here first.
    pause
    exit /b 1
)

echo Extracting files...
powershell -Command "Expand-Archive -Path '%~dp0dndkeep.zip' -DestinationPath '%~dp0' -Force"
if errorlevel 1 (
    echo ERROR: Extraction failed.
    pause
    exit /b 1
)

echo Committing to GitHub...
cd /d "%~dp0"
git add .
git commit -m "update"
git push

if errorlevel 1 (
    echo ERROR: Git push failed.
    pause
    exit /b 1
)

echo.
echo Done. Vercel is deploying now.
echo Check: https://dndkeep.vercel.app
timeout /t 3
