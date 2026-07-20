@echo off
echo Removing DNDKeep Auto-Deploy Watcher scheduled task...
schtasks /delete /tn "DNDKeepWatcher" /f
echo.
echo Done. Kill any running instance with:
echo   taskkill /f /im powershell.exe (only if you know it's the watcher)
echo or reboot. deploy.bat is now the only deploy path.
pause
