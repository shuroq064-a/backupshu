# ShuroqX Local Development Startup Script
# One script to start everything - handles Cloud SQL Auth Proxy automatically

param(
    [switch]$SkipProxy,      # Skip proxy if you want to use direct DB connection
    [switch]$NoFrontend      # Skip starting frontend
)

$ErrorActionPreference = "Stop"

# Get script's OWN directory (not the calling directory)
$ScriptPath = $MyInvocation.MyCommand.Path
$ScriptDir = Split-Path -Parent $ScriptPath

# Project root is where this script is located (for proper setup, keep scripts in project root)
$ProjectRoot = $ScriptDir
$ProxyExe = Join-Path $ProjectRoot "cloud-sql-proxy.exe"
$ProxyPort = 5433
$Instance = "shuroq-erp:asia-south1:shuroqx-db"
$BackendDir = Join-Path $ProjectRoot "backend"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host " ShuroqX Local Development Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project root: $ProjectRoot" -ForegroundColor Cyan

# Change to project root to ensure consistent paths
if ($PWD.Path -ne $ProjectRoot) {
    Set-Location $ProjectRoot
}

# Check if proxy is already running
$proxyRunning = Get-NetTCPConnection -LocalPort $ProxyPort -ErrorAction SilentlyContinue
if ($proxyRunning) {
    Write-Host "[OK] Cloud SQL Auth Proxy already running on port $ProxyPort" -ForegroundColor Green
} elseif (-not $SkipProxy) {
    # Check if proxy binary exists
    if (-not (Test-Path $ProxyExe)) {
        Write-Host "[DOWNLOAD] Cloud SQL Auth Proxy not found. Downloading..." -ForegroundColor Yellow
        $url = "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.25.4/cloud-sql-proxy.x64.exe"
        try {
            Invoke-WebRequest -Uri $url -OutFile $ProxyExe -UseBasicParsing
            Write-Host "[OK] Proxy downloaded successfully" -ForegroundColor Green
        } catch {
            Write-Host "[ERROR] Failed to download proxy: $_" -ForegroundColor Red
            Write-Host "Please download manually from: $url" -ForegroundColor Yellow
            exit 1
        }
    }

    # Check gcloud auth
    Write-Host "[AUTH] Checking Google Cloud authentication..." -ForegroundColor Yellow
    $token = gcloud auth application-default print-access-token 2>$null
    if (-not $token) {
        Write-Host "[AUTH] Please login with your Google account..." -ForegroundColor Yellow
        gcloud auth application-default login --brief
        $token = gcloud auth application-default print-access-token 2>$null
        if (-not $token) {
            Write-Host "[ERROR] Authentication failed. Please run 'gcloud auth application-default login' manually." -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "[OK] Authentication successful" -ForegroundColor Green

    # Start proxy
    Write-Host "[START] Starting Cloud SQL Auth Proxy on port $ProxyPort..." -ForegroundColor Yellow
    $proxyProcess = Start-Process -FilePath $ProxyExe -ArgumentList "$Instance --port $ProxyPort" -WindowStyle Hidden -PassThru
    
    # Wait for proxy to be ready
    $maxWait = 10
    $waited = 0
    while (-not (Get-NetTCPConnection -LocalPort $ProxyPort -ErrorAction SilentlyContinue) -and $waited -lt $maxWait) {
        Start-Sleep -Seconds 1
        $waited++
    }
    
    if (Get-NetTCPConnection -LocalPort $ProxyPort -ErrorAction SilentlyContinue) {
        Write-Host "[OK] Cloud SQL Auth Proxy running on 127.0.0.1:$ProxyPort" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Proxy may not have started properly. Checking..." -ForegroundColor Yellow
        if ($proxyProcess.HasExited) {
            Write-Host "[ERROR] Proxy exited with code: $($proxyProcess.ExitCode)" -ForegroundColor Red
            exit 1
        }
    }
}

# Check/update .env for proxy
$envFile = Join-Path $BackendDir ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "DATABASE_URL") {
        if ($envContent -match "127\.0\.0\.1:$ProxyPort") {
            Write-Host "[OK] DATABASE_URL already configured for proxy" -ForegroundColor Green
        } else {
            Write-Host "[CONFIG] Updating DATABASE_URL to use proxy..." -ForegroundColor Yellow
            $envContent = $envContent -replace "DATABASE_URL=.*", "DATABASE_URL=postgresql://shuroqx:5kE2BpocLGqsbmF1lxSg@127.0.0.1:$ProxyPort/shuroqx?sslmode=disable"
            Set-Content -Path $envFile -Value $envContent -NoNewline
            Write-Host "[OK] DATABASE_URL updated" -ForegroundColor Green
        }
    }
}

# Start backend
Write-Host "[START] Starting backend server on port 8001..." -ForegroundColor Yellow
Set-Location $BackendDir
Start-Process -FilePath ".\venv\Scripts\python.exe" -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8001" -WindowStyle Normal

Start-Sleep -Seconds 3

# Check if backend started
$backendRunning = Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue
if ($backendRunning) {
    Write-Host "[OK] Backend running on http://localhost:8001" -ForegroundColor Green
    Write-Host "[OK] API Docs: http://localhost:8001/docs" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Backend may not have started. Check the backend window." -ForegroundColor Yellow
}

# Start frontend
if (-not $NoFrontend) {
    Write-Host "[START] Starting frontend on port 3000..." -ForegroundColor Yellow
    $frontendDir = Join-Path $ProjectRoot "frontend"
    Set-Location $frontendDir
    
    # Clear Next.js cache to prevent stale build errors
    $nextCache = Join-Path $frontendDir ".next"
    if (Test-Path $nextCache) {
        Write-Host "[CLEAR] Removing stale Next.js cache..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $nextCache
    }
    
    Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WindowStyle Normal
    Write-Host "[OK] Frontend starting on http://localhost:3000" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " ShuroqX is ready!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "- Backend:  http://localhost:8001" -ForegroundColor White
Write-Host "- API Docs: http://localhost:8001/docs" -ForegroundColor White
if (-not $NoFrontend) {
    Write-Host "- Frontend: http://localhost:3000" -ForegroundColor White
}
Write-Host ""
Write-Host "NOTE: Keep these windows open while developing." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop services when done." -ForegroundColor Yellow
Write-Host ""
