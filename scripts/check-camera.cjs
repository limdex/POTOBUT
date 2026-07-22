#!/usr/bin/env node
// Camera + driver check — runs before dev/preview
// Checks: MSYS2, junction, camera USB, WinUSB driver, auto-installs if needed

const { execSync, spawnSync } = require('child_process');
const { existsSync, writeFileSync, mkdirSync, readdirSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const C = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
};

function ok(msg) { console.log(`${C.green}  ✓${C.reset} ${msg}`); }
function fail(msg) { console.log(`${C.red}  ✗${C.reset} ${msg}`); }
function warn(msg) { console.log(`${C.yellow}  ⚠${C.reset} ${msg}`); }
function info(msg) { console.log(`${C.dim}  →${C.reset} ${msg}`); }
function header(msg) { console.log(`\n${C.bold}${C.cyan}  ${msg}${C.reset}`); }

function run(cmd, opts = {}) {
    try {
        return execSync(cmd, { timeout: 10000, encoding: 'utf8', windowsHide: true, ...opts }).trim();
    } catch {
        return null;
    }
}

function powershell(cmd) {
    return run(`powershell.exe -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`);
}

let hasErrors = false;
let hasWarnings = false;

// ── 1. MSYS2 ──
header('MSYS2 Installation');

const msys2Path = 'C:\\msys64';
if (existsSync(msys2Path)) {
    ok(`MSYS2 found at ${msys2Path}`);
} else {
    fail(`MSYS2 not found at ${msys2Path}`);
    info('Install: winget install MSYS2.MSYS2');
    hasErrors = true;
}

// Check gphoto2 DLL
const gphoto2Dll = join(msys2Path, 'mingw64', 'bin', 'libgphoto2-6.dll');
if (existsSync(gphoto2Dll)) {
    ok('libgphoto2-6.dll found');
} else {
    fail('libgphoto2-6.dll not found');
    const binDir = join(msys2Path, 'mingw64', 'bin');
    if (existsSync(binDir)) {
        const gphotoFiles = readdirSync(binDir).filter(f => f.includes('gphoto') || f.includes('libgphoto'));
        if (gphotoFiles.length > 0) {
            info(`Found related: ${gphotoFiles.join(', ')}`);
        } else {
            info('No gphoto-related files in mingw64/bin/');
            info('Possible DB corruption — try: pacman -S --overwrite=* mingw-w64-x86_64-gphoto2');
        }
    }
    info('Install: /c/msys64/usr/bin/pacman.exe -S --noconfirm mingw-w64-x86_64-gphoto2');
    hasErrors = true;
}

// ── 2. Junction D:\M\msys64 ──
header('Junction D:\\M\\msys64');

const junctionTarget = 'D:\\M\\msys64';
if (existsSync(junctionTarget)) {
    const camlibBase = join(junctionTarget, 'mingw64', 'lib', 'libgphoto2');
    let camlibPath = null;
    if (existsSync(camlibBase)) {
        const vers = readdirSync(camlibBase).filter(d => d.startsWith('2.'));
        if (vers.length > 0) camlibPath = join(camlibBase, vers[0]);
    }
    if (camlibPath && existsSync(camlibPath)) {
        ok('Junction exists, camlibs accessible');
    } else {
        warn('Junction exists but camlibs not found');
        hasWarnings = true;
    }
} else {
    warn('Junction D:\\M\\msys64 not found');
    info('Creating junction...');
    
    // Create subst + junction
    powershell("subst D: C:\\msys64 2>$null");
    run('cmd.exe /c "if not exist D:\\M mkdir D:\\M"');
    const mklink = powershell("cmd /c 'mklink /J D:\\M\\msys64 C:\\msys64 2>$null'");
    
    if (existsSync(junctionTarget)) {
        ok('Junction created successfully');
    } else {
        fail('Failed to create junction');
        info('Run manually as admin: subst D: C:\\msys64 && mklink /J D:\\M\\msys64 C:\\msys64');
        hasErrors = true;
    }
}

// ── 3. Camera USB detection ──
header('Camera Detection');

const pnpOutput = powershell(
    "Get-PnpDevice | Where-Object { $_.FriendlyName -match 'Canon|Digital Camera' -and $_.Class -match 'WPD|USBDevice|Image|Camera' } | Select-Object FriendlyName,Status,InstanceId,Class | Format-List"
);

if (!pnpOutput || pnpOutput.trim() === '') {
    fail('No Canon camera detected via USB');
    info('Make sure camera is: 1) powered ON, 2) connected via USB, 3) in shooting mode');
    hasErrors = true;
} else {
    // Parse PnP output
    const devices = [];
    const blocks = pnpOutput.split('\r\n\r\n').filter(b => b.trim());
    for (const block of blocks) {
        const name = block.match(/FriendlyName\s*:\s*(.+)/)?.[1]?.trim();
        const status = block.match(/Status\s*:\s*(.+)/)?.[1]?.trim();
        const instanceId = block.match(/InstanceId\s*:\s*(.+)/)?.[1]?.trim();
        const cls = block.match(/Class\s*:\s*(.+)/)?.[1]?.trim();
        if (name && instanceId) {
            devices.push({ name, status, instanceId, class: cls });
        }
    }

    if (devices.length === 0) {
        fail('Could not parse camera device info');
        hasErrors = true;
    } else {
        const seen = new Set();
        for (const dev of devices) {
            const vidPid = dev.instanceId.match(/VID_([0-9A-F]+)&PID_([0-9A-F]+)/i);
            const vid = vidPid ? vidPid[1] : null;
            const pid = vidPid ? vidPid[2] : null;
            
            const dedupeKey = `${vid}:${pid}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            
            ok(`${dev.name} — Status: ${dev.status}, VID: ${vid}, PID: ${pid}`);
            
            if (dev.status !== 'OK') {
                warn(`Camera status is "${dev.status}" — try power-cycling the camera`);
                hasWarnings = true;
            }

            // ── 4. Driver check ──
            header('USB Driver Check');
            
            if (!dev.instanceId) {
                fail('Cannot read device InstanceId');
                hasErrors = true;
                continue;
            }

            const driverService = powershell(
                `Get-PnpDeviceProperty -InstanceId '${dev.instanceId}' -KeyName 'DEVPKEY_Device_Service' 2>$null | Select-Object -ExpandProperty Data`
            );

            if (driverService === 'WinUSB') {
                ok('Driver: WinUSB ✓ — libgphoto2 ready');
            } else if (driverService === 'libusbK') {
                ok('Driver: libusbK ✓ — libgphoto2 ready');
            } else if (driverService && driverService !== '') {
                warn(`Driver: "${driverService}" — needs WinUSB for libgphoto2`);
                
                // ── 5. Auto-install WinUSB ──
                header('Auto-install WinUSB Driver');
                
                if (vid && pid) {
                    const infPath = join(process.cwd(), 'native', 'winusb-canon.inf');
                    
                    // Generate INF for this specific device
                    const infContent = generateWinUsbInf(vid, pid, dev.name);
                    mkdirSync(join(process.cwd(), 'native'), { recursive: true });
                    writeFileSync(infPath, infContent);
                    info(`Generated INF: ${infPath}`);
                    
                    // Try pnputil
                    info('Trying pnputil (requires admin)...');
                    const pnputilResult = spawnSync('pnputil', [
                        '/add-driver', infPath, '/install'
                    ], {
                        timeout: 30000,
                        encoding: 'utf8',
                        windowsHide: true,
                        stdio: ['ignore', 'pipe', 'pipe']
                    });
                    
                    const pnpOut = pnputilResult.stdout?.trim() || '';
                    const pnpErr = pnputilResult.stderr?.trim() || '';
                    
                    if (pnputilResult.status === 0 && pnpOut.includes('Published')) {
                        ok('WinUSB driver installed via pnputil');
                        info('Camera may need reconnect after driver change');
                    } else {
                        fail('pnputil failed (need admin privileges)');
                        info(`Run as admin: pnputil /add-driver "${infPath}" /install`);
                        info('Or use Zadig: Options > List All Devices > select Canon > WinUSB > Replace Driver');
                        hasErrors = true;
                    }
                } else {
                    fail('Cannot extract VID/PID from device');
                    hasErrors = true;
                }
            } else {
                warn('Could not determine driver service');
                info('Open Zadig > Options > List All Devices > select Canon > WinUSB');
                hasWarnings = true;
            }
        }
    }
}

// ── Summary ──
header('Summary');

if (hasErrors) {
    console.log(`${C.red}  ✗ Camera setup incomplete — fix errors above${C.reset}`);
    console.log();
    console.log(`${C.dim}  Quick fix:${C.reset}`);
    console.log(`${C.dim}  1. Power ON camera + connect USB${C.reset}`);
    console.log(`${C.dim}  2. Run Zadig (zadig.exe) > List All Devices > Canon > WinUSB${C.reset}`);
    console.log(`${C.dim}  3. Restart this command${C.reset}`);
    process.exit(1);
} else if (hasWarnings) {
    console.log(`${C.yellow}  ⚠ Camera may work, but there are warnings${C.reset}`);
    process.exit(0);
} else {
    console.log(`${C.green}  ✓ Camera ready — all checks passed${C.reset}`);
    process.exit(0);
}

// ── INF Generator ──
function generateWinUsbInf(vid, pid, deviceName) {
    const vidUpper = vid.toUpperCase();
    const pidUpper = pid.toUpperCase();
    const guid = generateGuid(vidUpper, pidUpper);
    
    return `; WinUSB driver for ${deviceName}
; Auto-generated by potobut check-camera script
[Version]
Signature   = "$Windows NT$"
Class       = USBDevice
ClassGuid   = {88BAE3C6-5F7D-4c3b-9D5C-1E7E5C7B7B7B}
Provider    = "potobut"
DriverVer   = 01/01/2025,1.0.0.0
CatalogFile = winusb-canon.cat

[Manufacturer]
"potobut" = potobut, NTamd64.10

[potobut.NTamd64.10]
"${deviceName}" = USB_Install, USB\\VID_${vidUpper}&PID_${pidUpper}

[USB_Install]
Include = winusb.inf
Needs   = WINUSB.NT
KmdfVersion = 1.11

[USB_Install.HW]
AddReg = WinUSB_AddReg

[WinUSB_AddReg]
HKR,,DeviceInterfaceGUID,0x10000,"${guid}"

[USB_Install.Services]
Include    = winusb.inf
AddService = WinUSB,0x00000002,WinUSB_ServiceInstall

[WinUSB_ServiceInstall]
DisplayName    = "WinUSB"
ServiceType    = 1
StartType      = 3
ErrorControl   = 1
ServiceBinary  = %12%\\WinUSB.sys

[Strings]
; Empty
`;
}

function generateGuid(vid, pid) {
    // Generate a stable GUID from VID/PID
    const hash = simpleHash(vid + pid);
    const parts = [
        hash.substring(0, 8),
        hash.substring(8, 12),
        hash.substring(12, 16),
        hash.substring(16, 20),
        hash.substring(20, 32),
    ];
    return `{${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-${parts[4]}}`;
}

function simpleHash(str) {
    let h = 'a1b2c3d4e5f67890';
    for (let i = 0; i < str.length; i++) {
        h = ((h.charCodeAt(i % h.length) * 31 + str.charCodeAt(i)) % 16).toString(16) + h.substring(0, h.length - 1);
    }
    // Pad to 32 chars
    while (h.length < 32) h += '0';
    return h.substring(0, 32).toUpperCase();
}
