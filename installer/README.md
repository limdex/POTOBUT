# PhotoBooth Installer

This directory contains the files needed to create a Windows installer for PhotoBooth.

## Prerequisites

1. **Node.js** (for building the app)
2. **Inno Setup 6** (for creating the installer)
   - Download from: https://jrsoftware.org/isdl.php

## Quick Start

### Option 1: Automated Build (Recommended)

```powershell
# Run from project root
powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
```

This will:
1. Build the SvelteKit app for production
2. Download Node.js runtime (portable)
3. Create the installer

### Option 2: Manual Build

```powershell
# 1. Build the SvelteKit app
npm run build

# 2. Download Node.js portable runtime
# Download from: https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip
# Extract to: installer\runtime\node\

# 3. Build installer with Inno Setup
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\photo-booth.iss
```

## Output

After building, you'll find:
- `installer\installer-output\PhotoBoothSetup.exe` - The installer

## Installation

When your friend runs `PhotoBoothSetup.exe`:

1. **Choose installation folder** (default: `C:\Program Files\PhotoBooth`)
2. **Create desktop shortcut** (optional)
3. **Installation completes**

## What Gets Installed

```
C:\Program Files\PhotoBooth\
├── PhotoBooth.bat        # Launcher
├── node\                 # Node.js runtime (portable)
├── build\                # SvelteKit app
├── templates\            # Photo templates
└── database\             # Initial database (if provided)

C:\Users\<User>\AppData\Local\PhotoBooth\
├── database.sqlite       # User database
├── photos\               # Captured photos
├── config.json           # App settings
└── logs\                 # Application logs
```

## Uninstallation

User can uninstall via:
- Windows Settings > Apps
- Start Menu > Photo Booth > Uninstall

The uninstaller will ask if they want to keep their photos and settings.

## Customization

### Change App Version

Edit `photo-booth.iss`:
```
#define MyAppVersion "1.0.0"
```

### Change Install Location

Edit `photo-booth.iss`:
```
DefaultDirName={autopf}\PhotoBooth
```

### Add Files

Add files to the `[Files]` section in `photo-booth.iss`.

## Troubleshooting

### "Inno Setup not found"

Install Inno Setup 6 from https://jrsoftware.org/isdl.php

### "Build failed"

Make sure you have Node.js installed and can run `npm run build`

### "Node.js download failed"

Download manually from https://nodejs.org/ and extract to `installer\runtime\node\`
