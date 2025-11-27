# Git Push Tool - PowerShell Version
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Git Push Tool Launcher" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $scriptDir

# Change to the git repository directory (parent folder)
Set-Location $parentDir
Write-Host "Working Directory: $parentDir" -ForegroundColor Cyan
Write-Host ""

# Check if server is already running
$serverRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
    $serverRunning = $true
    Write-Host "[INFO] Server already running on port 3001" -ForegroundColor Yellow
} catch {
    Write-Host "[1/2] Starting helper server..." -ForegroundColor Cyan
    
    # Start the server in a new window
    $serverScript = Join-Path $scriptDir "git-helper-server.js"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$scriptDir'; node git-helper-server.js" -WindowStyle Minimized
    
    Write-Host "[2/2] Waiting for server to start..." -ForegroundColor Cyan
    Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Cyan
$htmlFile = Join-Path $scriptDir "git-push-tool.html"
Start-Process $htmlFile

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Tool is ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "The server is running in a minimized window." -ForegroundColor White
Write-Host "Close that window when you're done using the tool." -ForegroundColor White
Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
