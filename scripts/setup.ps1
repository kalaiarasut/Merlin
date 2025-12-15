# Setup script for CMLRE Platform
# Run this after cloning the repository

Write-Host "CMLRE Marine Data Platform - Setup Script" -ForegroundColor Cyan
Write-Host "=========================================`n" -ForegroundColor Cyan

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "✓ Node.js $nodeVersion installed" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found. Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check Python
$pythonVersion = python --version 2>$null
if ($pythonVersion) {
    Write-Host "✓ Python $pythonVersion installed" -ForegroundColor Green
} else {
    Write-Host "✗ Python not found. Please install Python 3.10+ from https://www.python.org/" -ForegroundColor Red
    exit 1
}

# Check Docker
$dockerVersion = docker --version 2>$null
if ($dockerVersion) {
    Write-Host "✓ Docker $dockerVersion installed" -ForegroundColor Green
} else {
    Write-Host "⚠ Docker not found. Docker is optional but recommended." -ForegroundColor Yellow
}

Write-Host "`nSetting up environment..." -ForegroundColor Yellow

# Copy environment file
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✓ Created .env file from template" -ForegroundColor Green
    Write-Host "  Please edit .env with your configurations" -ForegroundColor Yellow
} else {
    Write-Host "✓ .env file already exists" -ForegroundColor Green
}

# Create storage directories
$directories = @(
    "storage/uploads",
    "storage/datasets",
    "storage/images",
    "storage/sequences",
    "logs",
    "database/seeds"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Write-Host "✓ Created $dir" -ForegroundColor Green
    }
}

Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow

# Install root dependencies
Write-Host "Installing root dependencies..."
npm install

# Install frontend dependencies
Write-Host "Installing frontend dependencies..."
Set-Location frontend
npm install
Set-Location ..
Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green

# Install backend dependencies
Write-Host "Installing backend dependencies..."
Set-Location backend
npm install
Set-Location ..
Write-Host "✓ Backend dependencies installed" -ForegroundColor Green

# Install AI service dependencies
Write-Host "Installing AI service dependencies..."
Set-Location ai-services
python -m pip install -r requirements.txt
python -m spacy download en_core_web_sm
Set-Location ..
Write-Host "✓ AI service dependencies installed" -ForegroundColor Green

# Generate mock data
Write-Host "`nGenerating mock data..." -ForegroundColor Yellow
python scripts/generate-mock-data.py

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "Setup completed successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Edit .env file with your configurations"
Write-Host "2. Start services:"
Write-Host "   - With Docker: docker-compose up -d"
Write-Host "   - Without Docker:"
Write-Host "     * Frontend: cd frontend && npm run dev"
Write-Host "     * Backend: cd backend && npm run dev"
Write-Host "     * AI Services: cd ai-services && uvicorn main:app --reload"
Write-Host "`n3. Access the platform at http://localhost:3000"
Write-Host "   Default credentials: admin@cmlre.gov.in / cmlre2024"

Write-Host "`nFor more information, see docs/SETUP.md" -ForegroundColor Cyan
