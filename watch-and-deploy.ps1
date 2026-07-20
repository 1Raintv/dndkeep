# DNDKeep Auto-Deploy Watcher
# Runs silently in the background.
# When a new dndkeep.zip appears in your Downloads folder, it automatically
# extracts it into your DNDKeep folder and pushes to GitHub.
# Vercel then deploys automatically.

param(
    [string]$ProjectDir = "$env:USERPROFILE\OneDrive\Desktop\DNDKeep",
    [string]$WatchDir   = "$env:USERPROFILE\Downloads"
)

$zipName = "dndkeep.zip"
$logFile = "$ProjectDir\deploy.log"

function Write-Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

function Deploy($zipPath) {
    Write-Log "New zip detected: $zipPath"
    try {
        # v2.593.0 - never push while deploy.bat is mid-run (partial-dist
        # outage guard). Wait up to 10 min for the lock to clear.
        $lock = Join-Path $ProjectDir 'deploy.lock'
        $waited = 0
        while ((Test-Path $lock) -and ($waited -lt 600)) {
            if ($waited -eq 0) { Write-Log "deploy.lock present - waiting for deploy.bat to finish..." }
            Start-Sleep -Seconds 10; $waited += 10
        }
        if (Test-Path $lock) { Write-Log "deploy.lock still present after 10 min - skipping this deploy."; return }
        Write-Log "Extracting..."
        Expand-Archive -Path $zipPath -DestinationPath $ProjectDir -Force
        Write-Log "Extraction complete."

        Set-Location $ProjectDir

        $status = git status --porcelain
        if (-not $status) {
            Write-Log "No changes detected — skipping commit."
            return
        }

        git add .
        git commit -m "chore: automated deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        git push
        Write-Log "Pushed to GitHub. Vercel is deploying..."

        # Move zip to avoid re-triggering
        Move-Item -Path $zipPath -Destination "$ProjectDir\last-deploy.zip" -Force
        Write-Log "Done."
    } catch {
        Write-Log "ERROR: $_"
    }
}

Write-Log "Watcher started. Monitoring: $WatchDir"
Write-Log "Project dir: $ProjectDir"

# Watch for new/modified dndkeep.zip in Downloads
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path   = $WatchDir
$watcher.Filter = $zipName
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite'
$watcher.EnableRaisingEvents = $true

$action = {
    $path = $Event.SourceEventArgs.FullPath
    Start-Sleep -Seconds 2   # let the download finish writing
    if (Test-Path $path) {
        Deploy $path
    }
}

Register-ObjectEvent $watcher Created -Action $action | Out-Null
Register-ObjectEvent $watcher Changed -Action $action | Out-Null

Write-Log "Watching for $zipName in $WatchDir ... (press Ctrl+C to stop)"
while ($true) { Start-Sleep -Seconds 5 }
