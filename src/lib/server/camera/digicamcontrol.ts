import { join } from 'path';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import type { ChildProcess } from 'child_process';
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

async function readMjpegFrame(url: string, timeoutMs = 5000): Promise<ArrayBuffer | null> {
	try {
		const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		if (!resp.ok || !resp.body) return null;

		const reader = resp.body.getReader();
		const chunks: Uint8Array[] = [];
		let started = false;
		let startIdx = -1;
		let endIdx = -1;
		let total = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			chunks.push(value);
			total += value.length;

			// Build contiguous buffer for scanning
			const buf = new Uint8Array(total);
			let off = 0;
			for (const c of chunks) { buf.set(c, off); off += c.length; }

			if (!started) {
				// Find JPEG SOI marker FF D8
				for (let i = 0; i < total - 1; i++) {
					if (buf[i] === 0xFF && buf[i + 1] === 0xD8) {
						started = true;
						startIdx = i;
						break;
					}
				}
			}

			if (started) {
				// Find JPEG EOI marker FF D9 after start
				for (let i = Math.max(startIdx, 0); i < total - 1; i++) {
					if (buf[i] === 0xFF && buf[i + 1] === 0xD9) {
						endIdx = i + 2;
						break;
					}
				}
			}

			if (startIdx >= 0 && endIdx > startIdx) {
				const frame = buf.slice(startIdx, endIdx).buffer as ArrayBuffer;
				reader.cancel();
				return frame;
			}

			// Safety cap at 2MB
			if (total > 2_000_000) break;
		}

		return null;
	} catch {
		return null;
	}
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
		return this._connected;
	}

	async disconnect(): Promise<void> {
		this._connected = false;
	}

	startLiveFeed(): ChildProcess | null {
		return null;
	}

	async stopLiveFeed(): Promise<void> {
		// no-op
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;
		console.log('[CAMERA] Triggering capture...');
		await this.api('capture');
		await new Promise(r => setTimeout(r, 3000));

		if (this._imageDir) {
			const latest = getLatestPhoto(this._imageDir);
			if (latest) {
				console.log('[CAMERA] Captured:', latest);
				const buf = readFileSync(latest);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			}
		}
		return null;
	}
}
