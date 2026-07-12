import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

export class WebcamDriver implements CameraDriver {
	readonly name = 'Webcam (USB)';
	private _device?: string;

	async detect(): Promise<boolean> {
		if (process.platform === 'win32') {
			try {
				const out = execSync('ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1', { timeout: 8000 }).toString();
				const lines = out.split('\n');
				for (const line of lines) {
					const trimmed = line.trim();
					const match = trimmed.match(/"([^"]+)"/);
					if (match) {
						this._device = match[1];
						return true;
					}
				}
				return false;
			} catch {
				return false;
			}
		}

		try {
			const out = execSync('fswebcam --list-controls 2>&1 || v4l2-ctl --list-devices 2>&1', { timeout: 5000 }).toString();
			if (out.includes('/dev/video') || out.includes('device')) {
				this._device = '/dev/video0';
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}

	async connect(): Promise<boolean> {
		return this._device !== undefined;
	}

	async disconnect(): Promise<void> {
		this._device = undefined;
	}

	startLiveFeed(_onFrame: (buf: Buffer) => void): boolean {
		return false;
	}

	async stopLiveFeed(): Promise<void> {
		// no-op
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		const framePath = join(tmpdir(), 'potobut-webcam.jpg');
		try {
			execSync(`fswebcam --no-banner -r 640x480 "${framePath}" 2>/dev/null`, { timeout: 8000 });
			const buf = readFileSync(framePath);
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			try {
				execSync(`ffmpeg -y -f v4l2 -i /dev/video0 -frames:v 1 "${framePath}" 2>/dev/null`, { timeout: 8000 });
				const buf = readFileSync(framePath);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			} catch {
				try {
					execSync(`ffmpeg -y -f dshow -i video="USB Camera" -frames:v 1 "${framePath}" 2>/dev/null`, { timeout: 8000 });
					const buf = readFileSync(framePath);
					return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
				} catch {
					return null;
				}
			}
		}
	}
}
