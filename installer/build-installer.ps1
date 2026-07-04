# PhotoBooth Build Script
# Prepares files and builds the Inno Setup installer

param(
    [switch]$SkipBuild,
    [switch]$SkipNodeDownload
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$InstallerDir = $PSScriptRoot
$DistDir = Join-Path $ProjectRoot "build"
$RuntimeDir = Join-Path $InstallerDir "runtime"
$NodeVersion = "20.11.1"
$NodeArch = "win-x64"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PhotoBooth Installer Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Build SvelteKit app
if (-not $SkipBuild) {
    Write-Host "`n[1/4] Building SvelteKit application..." -ForegroundColor Yellow
    
    Push-Location $ProjectRoot
    try {
        # Clean previous build
        if (Test-Path $DistDir) {
            Remove-Item $DistDir -Recurse -Force
        }
        
        # Install dependencies
        Write-Host "Installing npm dependencies..."
        npm install
        
        # Build for production
        Write-Host "Building for production..."
        npm run build
        
        if (-not (Test-Path $DistDir)) {
            throw "Build failed - dist directory not found"
        }
        
        Write-Host "Build complete!" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Step 2: Download Node.js runtime (portable)
if (-not $SkipNodeDownload) {
    Write-Host "`n[2/4] Downloading Node.js runtime..." -ForegroundColor Yellow
    
    $NodeDir = Join-Path $RuntimeDir "node"
    $NodeZip = Join-Path $RuntimeDir "node.zip"
    
    if (Test-Path $NodeDir) {
        Remove-Item $NodeDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    
    $NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-$NodeArch.zip"
    Write-Host "Downloading from: $NodeUrl"
    
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
        
        # Extract
        Write-Host "Extracting Node.js..."
        Expand-Archive -Path $NodeZip -DestinationPath $RuntimeDir -Force
        Remove-Item $NodeZip
        
        # Rename folder
        $ExtractedDir = Join-Path $RuntimeDir "node-v$NodeVersion-$NodeArch"
        Rename-Item -Path $ExtractedDir -NewName "node"
        
        Write-Host "Node.js runtime ready!" -ForegroundColor Green
    }
    catch {
        Write-Host "Failed to download Node.js: $_" -ForegroundColor Red
        Write-Host "Please download manually from https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
}

# Step 3: Prepare database directory
Write-Host "`n[3/4] Preparing database..." -ForegroundColor Yellow

$DatabaseDir = Join-Path $ProjectRoot "database"
if (-not (Test-Path $DatabaseDir)) {
    New-Item -ItemType Directory -Path $DatabaseDir -Force | Out-Null
}

# Create initial database if it doesn't exist
$InitialDb = Join-Path $DatabaseDir "initial.sqlite"
if (-not (Test-Path $InitialDb)) {
    Write-Host "Creating initial database template..."
    # The database will be created on first run by the app
    # This is just a placeholder for the installer
}

# Step 4: Build installer with Inno Setup
Write-Host "`n[4/4] Building installer..." -ForegroundColor Yellow

$InnoSetupPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$IssFile = Join-Path $InstallerDir "photo-booth.iss"

if (-not (Test-Path $InnoSetupPath)) {
    # Try common locations
    $InnoSetupPaths = @(
        "C:\Program Files\Inno Setup 6\ISCC.exe",
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "${env:LocalAppData}\Programs\Inno Setup 6\ISCC.exe"
    )
    
    $InnoSetupPath = $InnoSetupPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if ($InnoSetupPath -and (Test-Path $InnoSetupPath)) {
    Write-Host "Using Inno Setup: $InnoSetupPath"
    
    Push-Location $InstallerDir
    try {
        & $InnoSetupPath $IssFile
        
        if ($LASTEXITCODE -eq 0) {
            $OutputDir = Join-Path $InstallerDir "installer-output"
            $SetupExe = Join-Path $OutputDir "PhotoBoothSetup.exe"
            
            if (Test-Path $SetupExe) {
                Write-Host "`n========================================" -ForegroundColor Green
                Write-Host "Installer built successfully!" -ForegroundColor Green
                Write-Host "========================================" -ForegroundColor Green
                Write-Host "Location: $SetupExe"
                Write-Host "Size: $([math]::Round((Get-Item $SetupExe).Length / 1MB, 2)) MB"
            }
        } else {
            Write-Host "Inno Setup build failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        }
    }
    finally {
        Pop-Location
    }
} else {
    Write-Host "Inno Setup not found!" -ForegroundColor Red
    Write-Host "Please install Inno Setup 6 from: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installing, run this script again or build manually:" -ForegroundColor Yellow
    Write-Host '  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\photo-booth.iss'
}

Write-Host "`nDone!" -ForegroundColor Cyan
