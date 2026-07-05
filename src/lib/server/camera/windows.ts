import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

export class WindowsCameraDriver implements CameraDriver {
	readonly name = 'Windows Camera (WMI)';
	private _deviceName?: string;

	async detect(): Promise<boolean> {
		if (process.platform !== 'win32') return false;

		// Try wmic first (most reliable on Windows)
		try {
			const out = execSync('wmic path Win32_PnPEntity where "PNPClass=\'Camera\' or PNPClass=\'Image\' or PNPClass=\'WPD\'" get Name /format:value 2>&1', { timeout: 5000 }).toString();
			const lines = out.split('\n').filter(l => l.trim());
			for (const line of lines) {
				const match = line.match(/^Name=(.+)/);
				if (match) {
					const name = match[1].trim();
					if (name && name !== 'null') {
						console.log('[CAMERA] Found via wmic:', name);
						this._deviceName = name;
						return true;
					}
				}
			}
		} catch (e) {
			console.log('[CAMERA] wmic failed:', e instanceof Error ? e.message : e);
		}

		// Try wmic with broader search (any Canon/EOS/camera device)
		try {
			const out = execSync('wmic path Win32_PnPEntity where "Name like \'%canon%\' or Name like \'%eos%\' or Name like \'%camera%\' or Name like \'%digital camera%\'" get Name /format:value 2>&1', { timeout: 5000 }).toString();
			const lines = out.split('\n').filter(l => l.trim());
			for (const line of lines) {
				const match = line.match(/^Name=(.+)/);
				if (match) {
					const name = match[1].trim();
					if (name && name !== 'null') {
						console.log('[CAMERA] Found via wmic (name search):', name);
						this._deviceName = name;
						return true;
					}
				}
			}
		} catch (e) {
			console.log('[CAMERA] wmic name search failed:', e instanceof Error ? e.message : e);
		}

		// Fallback: PowerShell WMI
		try {
			const ps = execSync('powershell -NoProfile -Command "Get-PnpDevice | Where-Object { $_.Class -eq \'Camera\' -or $_.Class -eq \'Image\' -or $_.Class -eq \'WPD\' -or $_.Class -eq \'PortableDevices\' } | Select-Object -First 1 -ExpandProperty FriendlyName" 2>&1', { timeout: 5000 }).toString().trim();
			if (ps && ps !== 'null' && ps !== '') {
				console.log('[CAMERA] Found via PowerShell:', ps);
				this._deviceName = ps;
				return true;
			}
		} catch (e) {
			console.log('[CAMERA] PowerShell failed:', e instanceof Error ? e.message : e);
		}

		// Fallback: check for any Canon/EOS device via PowerShell
		try {
			const ps = execSync('powershell -NoProfile -Command "Get-PnpDevice | Where-Object { $_.FriendlyName -like \'*canon*\' -or $_.FriendlyName -like \'*eos*\' -or $_.FriendlyName -like \'*camera*\' } | Select-Object -First 1 -ExpandProperty FriendlyName" 2>&1', { timeout: 5000 }).toString().trim();
			if (ps && ps !== 'null' && ps !== '') {
				console.log('[CAMERA] Found via PowerShell (name):', ps);
				this._deviceName = ps;
				return true;
			}
		} catch (e) {
			console.log('[CAMERA] PowerShell name search failed:', e instanceof Error ? e.message : e);
		}

		// Fallback: DirectShow via ffmpeg
		try {
			const out = execSync('ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1', { timeout: 8000 }).toString();
			const lines = out.split('\n');
			for (const line of lines) {
				const match = line.match(/"([^"]+)"/);
				if (match) {
					console.log('[CAMERA] Found via DirectShow:', match[1]);
					this._deviceName = match[1];
					return true;
				}
			}
		} catch {
			// ffmpeg not installed
		}

		return false;
	}

	async connect(): Promise<boolean> {
		return this._deviceName !== undefined;
	}

	async disconnect(): Promise<void> {
		this._deviceName = undefined;
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		return this.captureFrame();
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		return this.captureFrame();
	}

	private async captureFrame(): Promise<ArrayBuffer | null> {
		if (!this._deviceName) return null;
		const framePath = join(tmpdir(), 'potobut-capture.jpg');

		try {
			execSync(`ffmpeg -y -f dshow -i video="${this._deviceName}" -frames:v 1 -q:v 2 "${framePath}" 2>nul`, { timeout: 10000 });
			const buf = readFileSync(framePath);
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			return null;
		}
	}
}
