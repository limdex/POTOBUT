import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
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

async function readSingleMjpegFrame(url: string, timeoutMs = 5000): Promise<ArrayBuffer | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const resp = await fetch(url, { signal: controller.signal });
		clearTimeout(timer);
		if (!resp.ok || !resp.body) return null;

		const reader = resp.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		const boundarySearch = new TextEncoder().encode('\r\n\r\n');
		let foundFrame = false;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			total += value.length;

			// Check if we've found a complete JPEG frame boundary
			const all = new Uint8Array(total);
			let offset = 0;
			for (const c of chunks) {
				all.set(c, offset);
				offset += c.length;
			}

			// Look for JPEG end marker FF D9
			for (let i = 0; i < total - 1; i++) {
				if (all[i] === 0xFF && all[i + 1] === 0xD9) {
					// Found end of first JPEG frame
					const buf = all.slice(0, i + 2).buffer;
					reader.cancel();
					return buf as ArrayBuffer;
				}
			}

			// Safety: cap at 500KB
			if (total > 500_000) break;
		}

		// If we got something, return it even if incomplete
		if (total > 100) {
			const all = new Uint8Array(total);
			let offset = 0;
			for (const c of chunks) {
				all.set(c, offset);
				offset += c.length;
			}
			return all.slice(0, total).buffer as ArrayBuffer;
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
				signal: AbortSignal.timeout(5000)
			});
			if (!resp.ok) return null;
			return await resp.text();
		} catch {
			return null;
		}
	}

	async detect(): Promise<boolean> {
		const res = await this.api('status');
		if (!res) {
			console.log('[CAMERA] digiCamControl not reachable');
			return false;
		}

		const lower = res.toLowerCase();
		const hasCamera = lower.includes('canon') || lower.includes('eos') ||
			lower.includes('nikon') || lower.includes('sony') ||
			lower.includes('camera') || lower.includes('model');
		if (!hasCamera) {
			console.log('[CAMERA] digiCamControl running but no camera detected');
			return false;
		}

		this._imageDir = getDigiCamSessionDir();
		console.log('[CAMERA] digiCamControl detected, session dir:', this._imageDir || '(none)');
		return true;
	}

	async connect(): Promise<boolean> {
		const detected = await this.detect();
		this._connected = detected;
		return detected;
	}

	async disconnect(): Promise<void> {
		this._connected = false;
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;

		// Try MJPEG live view first
		const frame = await readSingleMjpegFrame(`${DIGICAM_URL}/?cmd=liveview`);
		if (frame) {
			console.log('[CAMERA] Live view frame captured, size:', frame.byteLength, 'bytes');
			return frame;
		}

		// Fallback: try reading latest photo from session dir
		if (this._imageDir) {
			const latest = getLatestPhoto(this._imageDir);
			if (latest) {
				console.log('[CAMERA] Using latest session photo for preview:', latest);
				const buf = readFileSync(latest);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			}
		}

		console.log('[CAMERA] No preview available');
		return null;
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;

		console.log('[CAMERA] Triggering capture...');
		const res = await this.api('capture');
		if (!res) {
			console.log('[CAMERA] Capture command failed');
			return null;
		}

		console.log('[CAMERA] Capture triggered, waiting for file...');
		await new Promise(r => setTimeout(r, 3000));

		// Read the latest photo from session dir
		if (this._imageDir) {
			const latest = getLatestPhoto(this._imageDir);
			if (latest) {
				console.log('[CAMERA] Captured photo:', latest);
				const buf = readFileSync(latest);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			}
		}

		// Fallback: try live view frame
		console.log('[CAMERA] Falling back to live view frame');
		return this.capturePreview();
	}
}
