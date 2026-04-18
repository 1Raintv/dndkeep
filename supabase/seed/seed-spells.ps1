# DNDKeep — One-time canonical spell seed runner
# 
# What this does: POSTs each spell_seed_chunk_*.sql file to the temp edge
# function `_temp_seed_runner` deployed on Supabase, which executes the SQL
# server-side using the service-role connection. Loads all 357 SRD/UA spells
# into the public.spells table with owner_id=NULL.
#
# Usage from PowerShell in this folder (supabase/seed/):
#   .\seed-spells.ps1
#
# After successful seeding, DELETE the _temp_seed_runner edge function from
# Supabase dashboard (Functions tab). It's a temporary backdoor and should
# not stay deployed.

$FunctionUrl = "https://ufowdrspkprlpdnjjkaj.supabase.co/functions/v1/_temp_seed_runner"
$Secret = "dndkeep-seed-2026-temporary-7f3a9b"

$chunks = Get-ChildItem -Filter "spell_seed_chunk_*.sql" | Sort-Object Name

Write-Host "Found $($chunks.Count) chunk files to apply." -ForegroundColor Cyan
Write-Host ""

$totalApplied = 0
foreach ($chunk in $chunks) {
    Write-Host "Applying $($chunk.Name) ($($chunk.Length) bytes)..." -NoNewline
    $sql = Get-Content $chunk.FullName -Raw
    try {
        $response = Invoke-RestMethod -Uri $FunctionUrl `
            -Method POST `
            -Headers @{ "x-seed-secret" = $Secret; "Content-Type" = "text/plain" } `
            -Body $sql `
            -TimeoutSec 60
        if ($response.ok) {
            Write-Host " OK ($($response.command))" -ForegroundColor Green
            $totalApplied++
        } else {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Host "  Error: $($response.error)" -ForegroundColor Red
            break
        }
    } catch {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
        break
    }
}

Write-Host ""
Write-Host "Applied $totalApplied of $($chunks.Count) chunks." -ForegroundColor Cyan
Write-Host ""
Write-Host "To verify, run this in the Supabase SQL Editor:" -ForegroundColor Yellow
Write-Host "  SELECT count(*) AS total," -ForegroundColor Yellow
Write-Host "         count(*) FILTER (WHERE source = 'srd') AS srd," -ForegroundColor Yellow
Write-Host "         count(*) FILTER (WHERE source = 'ua') AS ua" -ForegroundColor Yellow
Write-Host "  FROM public.spells;" -ForegroundColor Yellow
Write-Host ""
Write-Host "Expected: total=357, srd=343, ua=14" -ForegroundColor Yellow
Write-Host ""
Write-Host "After verification, DELETE the _temp_seed_runner function in Supabase!" -ForegroundColor Red
