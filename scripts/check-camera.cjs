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

// Check critical MINGW64 runtime DLLs
const runtimeDlls = [
    { file: 'libwinpthread-1.dll', pkg: 'mingw-w64-x86_64-libwinpthread-git' },
    { file: 'libintl-8.dll',        pkg: 'mingw-w64-x86_64-gettext' },
    { file: 'libgcc_s_seh-1.dll',   pkg: 'mingw-w64-x86_64-gcc-libs' },
    { file: 'libstdc++-6.dll',      pkg: 'mingw-w64-x86_64-gcc-libs' },
];
const missingRuntime = [];
for (const { file } of runtimeDlls) {
    if (!existsSync(join(msys2Path, 'mingw64', 'bin', file))) {
        missingRuntime.push(file);
    }
}
if (missingRuntime.length > 0) {
    for (const dll of missingRuntime) fail(`Runtime DLL missing: ${dll} (critical — camera will fail to load)`);
    const pkgs = [...new Set(runtimeDlls.filter(r => missingRuntime.includes(r.file)).map(r => r.pkg))];
    info(`Fix: /c/msys64/usr/bin/pacman.exe -S --noconfirm --overwrite='*' ${pkgs.join(' ')}`);
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
                    const nativeDir = join(process.cwd(), 'native');
                    const runOpts = { timeout: 30000, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };

                    // Generate INF for this specific device
                    const infContent = generateWinUsbInf(vid, pid, dev.name);
                    mkdirSync(nativeDir, { recursive: true });
                    writeFileSync(infPath, infContent);
                    info(`Generated INF: ${infPath}`);

                    const hwId = `USB\\VID_${vid.toUpperCase()}&PID_${pid.toUpperCase()}`;

                    const methods = [
                        {
                            name: 'pnputil /add-driver /install',
                            run: () => spawnSync('pnputil', ['/add-driver', infPath, '/install'], runOpts)
                        },
                        {
                            name: 'pnputil /install-device',
                            run: () => spawnSync('pnputil', ['/install-device', hwId], runOpts)
                        },
                        {
                            name: 'PowerShell Update-Driver',
                            run: () => spawnSync('powershell.exe', ['-NoProfile', '-Command',
                                `Get-PnpDevice -InstanceId '${dev.instanceId}' | Update-Driver -DriverPath '${nativeDir}' 2>$null | Out-Null`],
                                runOpts)
                        }
                    ];

                    let installed = false;
                    for (const m of methods) {
                        if (installed) break;
                        info(`Trying: ${m.name}...`);
                        const res = m.run();
                        const out = (res.stdout || '').trim();
                        const err = (res.stderr || '').trim();
                        const lookedOk = res.status === 0 && !/fail|error/i.test(out + ' ' + err);

                        if (lookedOk) {
                            const drv = waitForDriverService(dev.instanceId);
                            if (drv) {
                                ok(`WinUSB active (${drv}) via ${m.name}`);
                                installed = true;
                            } else {
                                warn(`${m.name} ok, tapi driver belum aktif: "${driverService}"`);
                                info('Kamera harus di-reconnect (cabut & colok USB), lalu jalankan ulang');
                                installed = true;
                            }
                        } else {
                            fail(`${m.name} gagal (status ${res.status})`);
                            if (out) info(`  stdout: ${out.split('\n').slice(0, 3).join(' | ')}`);
                            if (err) info(`  stderr: ${err.split('\n').slice(0, 3).join(' | ')}`);
                        }
                    }

                    if (!installed) {
                        fail('Semua metode otomatis gagal');
                        info(`Manual: pnputil /add-driver "${infPath}" /install (jalankan sebagai admin)`);
                        info('Atau pakai Zadig (di bawah) untuk install WinUSB');

                        // ── Zadig fallback ──
                        const zadigDir = join(nativeDir, 'zadig');
                        const zadigPath = join(zadigDir, 'zadig.exe');
                        if (!existsSync(zadigPath)) {
                            info('Downloading Zadig 2.9 (fallback tool)...');
                            mkdirSync(zadigDir, { recursive: true });
                            const dl = spawnSync('curl', ['-L', '--fail', '-sS', '-o', zadigPath,
                                'https://github.com/pbatard/libwdi/releases/download/v1.5.1/zadig-2.9.exe'],
                                { timeout: 120000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
                            if (existsSync(zadigPath) && dl.status === 0) {
                                ok(`Zadig downloaded: ${zadigPath}`);
                            } else {
                                fail('Zadig download gagal — unduh manual dari https://zadig.akeo.ie/');
                            }
                        } else {
                            ok(`Zadig sudah ada: ${zadigPath}`);
                        }

                        if (existsSync(zadigPath)) {
                            info('Membuka Zadig...');
                            info('Di Zadig: Options > List All Devices > pilih Canon > WinUSB > Replace Driver');
                            spawnSync('cmd', ['/c', 'start', '', zadigPath], { windowsHide: true });
                        }

                        hasErrors = true;
                    } else {
                        info('Camera may need reconnect after driver change');
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
ClassGuid   = {88BAE032-5A81-49f0-BC3D-A4FF138216D6}
Provider    = "potobut"
DriverVer   = 01/01/2025,1.0.0.0

[Manufacturer]
"potobut" = potobut, NTamd64.10

[potobut.NTamd64.10]
"${deviceName}" = USB_Install, USB\\VID_${vidUpper}&PID_${pidUpper}

[USB_Install]
Include = winusb.inf
Needs   = WINUSB.NT

[USB_Install.Services]
Include = winusb.inf
Needs   = WINUSB.NT.Services

[USB_Install.HW]
AddReg = WinUSB_AddReg

[WinUSB_AddReg]
HKR,,DeviceInterfaceGUIDs,0x10000,"${guid}"

[Strings]
; Empty
`;
}

function waitForDriverService(instanceId, tries = 3, delayMs = 2000) {
    for (let i = 0; i < tries; i++) {
        const drv = powershell(
            `Get-PnpDeviceProperty -InstanceId '${instanceId}' -KeyName 'DEVPKEY_Device_Service' 2>$null | Select-Object -ExpandProperty Data`
        );
        if (drv === 'WinUSB' || drv === 'libusbK') return drv;
        if (i < tries - 1) {
            try {
                execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${delayMs}"`,
                    { timeout: 10000, windowsHide: true });
            } catch { /* ignore */ }
        }
    }
    return null;
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
