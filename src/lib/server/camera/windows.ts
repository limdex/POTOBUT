import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

export class WindowsCameraDriver implements CameraDriver {
	readonly name = 'Windows Camera (DirectShow)';
	private _deviceName?: string;

	async detect(): Promise<boolean> {
		if (process.platform !== 'win32') return false;

		try {
			const out = execSync('ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1', { timeout: 8000 }).toString();
			const lines = out.split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.includes('"') && trimmed.includes('video') || trimmed.includes('camera') || trimmed.includes('Camera') || trimmed.includes('Canon') || trimmed.includes('EOS')) {
					const match = trimmed.match(/"([^"]+)"/);
					if (match) {
						this._deviceName = match[1];
						return true;
					}
				}
			}
		} catch {
			// ffmpeg not installed or error
		}

		try {
			const ps = execSync('powershell "Get-PnpDevice | Where-Object {$_.Class -eq ''Camera'' -or $_.FriendlyName -like ''*canon*'' -or $_.FriendlyName -like ''*eos*''} | Select-Object -ExpandProperty FriendlyName" 2>&1', { timeout: 5000 }).toString().trim();
			if (ps && ps !== 'null' && ps !== '') {
				this._deviceName = ps.split('\n')[0].trim();
				return true;
			}
		} catch {
			// WMI failed
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
			execSync(`ffmpeg -y -f dshow -video_device_number 0 -i video="${this._deviceName}" -frames:v 1 -q:v 2 "${framePath}" 2>nul`, { timeout: 10000 });
			const buf = readFileSync(framePath);
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			try {
				execSync(`ffmpeg -y -f dshow -i video="${this._deviceName}" -frames:v 1 -q:v 2 "${framePath}" 2>nul`, { timeout: 10000 });
				const buf = readFileSync(framePath);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			} catch {
				return null;
			}
		}
	}
}
