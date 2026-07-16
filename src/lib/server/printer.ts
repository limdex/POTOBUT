import { execSync, exec } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface PrinterInfo {
	connected: boolean;
	name?: string;
	available: string[];
	error?: string;
}

let _printer: PrinterInfo = { connected: false, available: [] };

export function getPrinterStatus(): PrinterInfo {
	return { ..._printer };
}

export async function connectPrinter(name?: string): Promise<PrinterInfo> {
	try {
		let printers: string[] = [];

		// Primary: PowerShell Get-Printer (modern, Win10/11, works on 24H2 where wmic is removed)
		try {
			const psOut = execSync(
				'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
				{ timeout: 5000, encoding: 'utf8', windowsHide: true }
			).trim();
			printers = psOut.split('\n').map(l => l.trim()).filter(Boolean);
		} catch {
			// Fallback 1: wmic (legacy Windows)
			try {
				const out = execSync('wmic printer get name 2>&1', { timeout: 5000, encoding: 'utf8' }).trim();
				printers = out.split('\n').map(l => l.trim()).filter(l => l && !/^Name\b/i.test(l));
			} catch {
				// Fallback 2: lpstat (Linux)
				try {
					const out = execSync('lpstat -e 2>&1', { timeout: 5000, encoding: 'utf8' }).trim();
					printers = out.split('\n').map(l => l.trim()).filter(Boolean);
				} catch {
					// no detection method available
				}
			}
		}

		_printer.available = printers;

		if (name && printers.includes(name)) {
			_printer.connected = true;
			_printer.name = name;
		} else if (printers.length > 0) {
			// Skip virtual printers, prefer real hardware
			const virtual = ['xps', 'pdf', 'fax', 'onenote', 'microsoft print', 'microsoft xps'];
			const real = printers.find(p => !virtual.some(v => p.toLowerCase().includes(v)));
			_printer.connected = true;
			_printer.name = real || printers[0];
		} else {
			_printer.connected = false;
			_printer.name = undefined;
			_printer.error = 'No printer found';
		}
	} catch (e: any) {
		_printer = { connected: false, available: [], error: e.message };
	}
	return getPrinterStatus();
}

export function disconnectPrinter(): PrinterInfo {
	_printer.connected = false;
	_printer.name = undefined;
	return getPrinterStatus();
}

export async function printImage(imageBuffer: Buffer): Promise<{ ok: boolean; error?: string }> {
	if (!_printer.connected || !_printer.name) return { ok: false, error: 'Printer not connected' };

	const tempPath = join(tmpdir(), 'potobut-print.png');
	const psPath = join(tmpdir(), 'potobut-print.ps1');
	try {
		writeFileSync(tempPath, imageBuffer);

		if (process.platform === 'win32') {
			const escapedPath = tempPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
			const escapedName = _printer.name.replace(/'/g, "''");
			const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${escapedPath}')
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = '${escapedName}'
$doc.add_PrintPage({
    param($s, $e)
    $area = $e.MarginBounds
    $scale = [Math]::Min($area.Width / $img.Width, $area.Height / $img.Height)
    $w = [Math]::Round($img.Width * $scale)
    $h = [Math]::Round($img.Height * $scale)
    $x = [Math]::Round($area.Left + ($area.Width - $w) / 2)
    $y = [Math]::Round($area.Top + ($area.Height - $h) / 2)
    $e.Graphics.DrawImage($img, $x, $y, $w, $h)
})
$doc.Print()
$img.Dispose()
`;
			writeFileSync(psPath, psScript);
			execSync(`powershell -NoProfile -File "${psPath}"`, { timeout: 60000 });
		} else {
			execSync(`lp -d "${_printer.name}" "${tempPath}"`, { timeout: 30000 });
		}

		return { ok: true };
	} catch (e: any) {
		const msg = e?.message || String(e);
		return { ok: false, error: msg };
	} finally {
		try { unlinkSync(tempPath); } catch { /* ignore */ }
		try { unlinkSync(psPath); } catch { /* ignore */ }
	}
}
