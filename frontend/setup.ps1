$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ShuroqX Frontend - Full Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$frontendDir = $PSScriptRoot
if (-not (Test-Path "$frontendDir\package.json")) {
    Write-Host "ERROR: Run this script from the frontend/ directory" -ForegroundColor Red
    exit 1
}

Set-Location $frontendDir

# ── 1. Node dependencies ────────────────────────────────
Write-Host "`n[1/4] Installing node dependencies..." -ForegroundColor Yellow
npm install

# ── 2. Core Framework ───────────────────────────────────
Write-Host "`n[2/4] Ensuring core packages..." -ForegroundColor Yellow
npm install next@15 react@19 react-dom@19

# ── 3. UI Component Libraries ───────────────────────────
Write-Host "`n[3/4] Installing UI libraries..." -ForegroundColor Yellow

# Primitives / Headless UI
npm install @radix-ui/react-slot @radix-ui/react-tooltip @radix-ui/react-radio-group @ark-ui/react

# Icons
npm install lucide-react

# Styling Utilities
npm install class-variance-authority clsx tailwind-merge

# Toast Notifications
npm install sonner

# Chat / Auto-scroll
npm install use-stick-to-bottom

# Number Animation
npm install @number-flow/react

# ── 4. Animation Libraries ──────────────────────────────
Write-Host "`n[4/4] Installing animation libraries..." -ForegroundColor Yellow
npm install framer-motion motion gsap @gsap/react

# ── 5. Charting Libraries ──────────────────────────────
Write-Host "`n[+] Installing charting libraries..." -ForegroundColor Yellow
npm install @visx/scale @visx/shape @visx/curve @visx/event @visx/responsive @visx/grid @visx/pattern @visx/gradient d3-array d3-shape jsonwebtoken

# ── 6. State Management & Auth ─────────────────────────
Write-Host "`n[+] Installing state & auth..." -ForegroundColor Yellow
npm install @reduxjs/toolkit react-redux next-auth

# ── 7. Dev Dependencies ────────────────────────────────
Write-Host "`n[+] Installing dev dependencies..." -ForegroundColor Yellow
npm install -D typescript @types/node @types/react @types/react-dom @types/jsonwebtoken tailwindcss @tailwindcss/postcss postcss autoprefixer eslint eslint-config-next agentation

# ── Done ────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Run:  npm run dev" -ForegroundColor Cyan
Write-Host ""
