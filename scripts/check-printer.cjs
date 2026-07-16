#!/usr/bin/env node
// Printer detection diagnostic — tries multiple methods

const { execSync } = require('child_process');

const C = {
    green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m',
};

function ok(m) { console.log(`${C.green}  ✓${C.reset} ${m}`); }
function fail(m) { console.log(`${C.red}  ✗${C.reset} ${m}`); }
function info(m) { console.log(`${C.dim}  →${C.reset} ${m}`); }
function header(m) { console.log(`\n${C.bold}${C.cyan}  ${m}${C.reset}`); }

function run(cmd) {
    try {
        return execSync(cmd, { timeout: 10000, encoding: 'utf8', windowsHide: true }).trim();
    } catch (e) {
        return null;
    }
}

function powershell(cmd) {
    return run(`powershell.exe -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`);
}

header('Method 1: wmic (legacy, deprecated on Win11 24H2)');
const wmicOut = run('wmic printer get name 2>&1');
if (wmicOut === null) {
    fail('wmic not available or failed');
} else {
    const lines = wmicOut.split('\n').map(l => l.trim()).filter(l => l && !/^Name\b/i.test(l));
    if (lines.length > 0) {
        ok(`Found ${lines.length} printer(s):`);
        lines.forEach(p => info(p));
    } else {
        fail('No printers via wmic');
    }
}

header('Method 2: PowerShell Get-Printer (modern)');
const psOut = powershell("Get-Printer | Select-Object Name, PrinterStatus, PortName | Format-List");
if (psOut === null || psOut === '') {
    fail('Get-Printer not available or no printers');
} else {
    const blocks = psOut.split('\r\n\r\n').filter(b => b.trim());
    if (blocks.length > 0) {
        ok(`Found ${blocks.length} printer(s):`);
        blocks.forEach(b => {
            const name = b.match(/Name\s*:\s*(.+)/)?.[1]?.trim();
            const status = b.match(/PrinterStatus\s*:\s*(.+)/)?.[1]?.trim();
            const port = b.match(/PortName\s*:\s*(.+)/)?.[1]?.trim();
            info(`${name || '?'} — Status: ${status || '?'}, Port: ${port || '?'}`);
        });
    } else {
        fail('No printers via Get-Printer');
    }
}

header('Method 3: PowerShell WMI Win32_Printer');
const wmiOut = powershell("Get-CimInstance Win32_Printer | Select-Object Name, Default, Shared | Format-List");
if (wmiOut === null || wmiOut === '') {
    fail('Win32_Printer query failed');
} else {
    const blocks = wmiOut.split('\r\n\r\n').filter(b => b.trim());
    if (blocks.length > 0) {
        ok(`Found ${blocks.length} printer(s):`);
        blocks.forEach(b => {
            const name = b.match(/Name\s*:\s*(.+)/)?.[1]?.trim();
            const def = b.match(/Default\s*:\s*(.+)/)?.[1]?.trim();
            info(`${name || '?'} — Default: ${def || '?'}`);
        });
    } else {
        fail('No printers via Win32_Printer');
    }
}

header('Method 4: lpstat (MSYS2/CUPS)');
const lpstatOut = run('lpstat -e 2>&1');
if (lpstatOut === null || lpstatOut === '') {
    info('lpstat not available (not in MSYS2 PATH) — skip if on Windows');
} else {
    const lines = lpstatOut.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
        ok(`Found ${lines.length} printer(s):`);
        lines.forEach(p => info(p));
    } else {
        info('No printers via lpstat');
    }
}

header('Summary');
const anyPrinters = [wmicOut, psOut, wmiOut].some(o => o && o.length > 20);
if (anyPrinters) {
    ok('At least one detection method found printers');
    info('If app still says "not found" — wmic may be deprecated on this Windows version');
    info('Fix: update printer.ts to use Get-Printer instead of wmic');
} else {
    fail('No printers detected by any method');
    info('Check: 1) printer powered ON, 2) USB connected, 3) driver installed');
}
