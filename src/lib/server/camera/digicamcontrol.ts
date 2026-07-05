import { join } from 'path';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { tmpdir, homedir } from 'os';
import type { CameraDriver } from './driver';

const DIGICAM_URL = 'http://127.0.0.1:5513';

function getDigiCamSessionDir(): string {
	const base = join(homedir(), 'Pictures', 'digiCamControl');
	if (!existsSync(base)) return '';
	const sessions = readdirSync(base)
		.filter(d => d.startsWith('Session'))
		.map(d => ({ name: d, time: statSync(join(base, d)).mtimeMs }))
		.sort((a, b) => b.time - a.time);
	return sessions.length > 0 ? join(base, sessions[0].name) : '';
}

function getLatestPhoto(dir: string): string | null {
	if (!existsSync(dir)) return null;
	const files = readdirSync(dir)
		.filter(f => /\.(jpg|jpeg|png)$/i.test(f))
		.map(f => ({ name: f, time: statSync(join(dir, f)).mtimeMs }))
		.sort((a, b) => b.time - a.time);
	return files.length > 0 ? join(dir, files[0].name) : null;
}

export class DigiCamControlDriver implements CameraDriver {
	readonly name = 'digiCamControl';
	private _connected = false;
	private _imageDir = '';

	private async api(cmd: string): Promise<string | null> {
		try {
			const resp = await fetch(`${DIGICAM_URL}/?cmd=${encodeURIComponent(cmd)}`, {
				signal: AbortSignal.timeout(8000)
			});
			if (!resp.ok) return null;
			return await resp.text();
		} catch {
			return null;
		}
	}

	async detect(): Promise<boolean> {
		const res = await this.api('status');
		if (res === null) {
			console.log('[CAMERA] digiCamControl not reachable at', DIGICAM_URL);
			return false;
		}
		console.log('[CAMERA] digiCamControl status:', res.substring(0, 300));

		this._imageDir = getDigiCamSessionDir();
		console.log('[CAMERA] Session dir:', this._imageDir || '(none)');
		return true;
	}

	async connect(): Promise<boolean> {
		this._connected = await this.detect();
		if (this._connected && !this._imageDir) {
			console.log('[CAMERA] Taking initial photo to create session dir...');
			await this.api('capture');
			await new Promise(r => setTimeout(r, 3000));
			this._imageDir = getDigiCamSessionDir();
			console.log('[CAMERA] Session dir after initial capture:', this._imageDir || '(still none)');
		}
		return this._connected;
	}

	async disconnect(): Promise<void> {
		this._connected = false;
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;

		// Read latest photo from session dir (no new capture)
		if (this._imageDir) {
			const latest = getLatestPhoto(this._imageDir);
			if (latest) {
				console.log('[CAMERA] Preview from:', latest);
				const buf = readFileSync(latest);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			}
		}
		return null;
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;

		console.log('[CAMERA] Triggering capture...');
		await this.api('capture');
		await new Promise(r => setTimeout(r, 3000));

		if (this._imageDir) {
			const latest = getLatestPhoto(this._imageDir);
			if (latest) {
				console.log('[CAMERA] Captured photo:', latest);
				const buf = readFileSync(latest);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			}
		}
		return null;
	}
}
