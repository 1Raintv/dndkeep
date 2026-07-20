# v2.595.0 - dist integrity gate (called by deploy.bat before staging).
# Exit 0 = dist is complete. Exit 1 = refuse to deploy.
$ErrorActionPreference = 'Stop'
try {
  $idx = 'dist/index.html'
  if (!(Test-Path $idx)) { Write-Output 'FAIL: dist/index.html missing'; exit 1 }
  $html = Get-Content -Raw $idx
  $refs = [regex]::Matches($html, 'assets/[A-Za-z0-9_.-]+\.(js|css)') |
    ForEach-Object { $_.Value } | Sort-Object -Unique
  foreach ($r in $refs) {
    if (!(Test-Path (Join-Path 'dist' $r))) { Write-Output "FAIL: referenced asset missing: $r"; exit 1 }
  }
  $count = (Get-ChildItem 'dist/assets' -Filter *.js -ErrorAction SilentlyContinue).Count
  if ($count -lt 30) { Write-Output "FAIL: only $count js chunks in dist/assets (expected 30+)"; exit 1 }
  Write-Output "OK: index.html + $($refs.Count) referenced assets + $count chunks"
  exit 0
} catch {
  Write-Output "FAIL: $_"
  exit 1
}
