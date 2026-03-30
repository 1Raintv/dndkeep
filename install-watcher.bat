@echo off
echo Installing DNDKeep Auto-Deploy Watcher...
echo.

:: Register as a scheduled task that starts at login and runs hidden
schtasks /create ^
  /tn "DNDKeepWatcher" ^
  /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%~dp0watch-and-deploy.ps1\"" ^
  /sc ONLOGON ^
  /ru "%USERNAME%" ^
  /f

echo.
echo Done! The watcher will now start automatically when you log in.
echo It is also starting now...
echo.

start "" powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0watch-and-deploy.ps1"

echo Watcher is running in the background.
echo From now on: just download dndkeep.zip from Claude and it deploys automatically.
echo Logs are saved to deploy.log in your DNDKeep folder.
pause
