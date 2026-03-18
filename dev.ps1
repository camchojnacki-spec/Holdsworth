# Holdsworth — Dev Environment Launcher
# Run: .\dev.ps1 from the CardScanner directory

Write-Host "Holdsworth Dev Environment" -ForegroundColor DarkRed
Write-Host ""

# Start Cloud SQL Auth Proxy in background
Write-Host "[1/2] Starting Cloud SQL proxy..." -ForegroundColor Gray
$proxy = Start-Process -FilePath "$env:USERPROFILE\cloud-sql-proxy.exe" `
    -ArgumentList "holdsworth-app:us-central1:holdsworth-db", "--port=5432", "--gcloud-auth" `
    -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 3

if ($proxy.HasExited) {
    Write-Host "Cloud SQL proxy failed to start. Run 'gcloud auth login' and try again." -ForegroundColor Red
    exit 1
}

Write-Host "  Proxy running (PID: $($proxy.Id))" -ForegroundColor DarkGreen

# Start Next.js dev server
Write-Host "[2/2] Starting Holdsworth..." -ForegroundColor Gray
Write-Host ""

try {
    pnpm dev
} finally {
    # Clean up proxy when dev server stops
    Write-Host ""
    Write-Host "Shutting down proxy..." -ForegroundColor Gray
    Stop-Process -Id $proxy.Id -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor DarkGreen
}
