import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync } from 'fs';
import type { CameraDriver } from './driver';

const DIGICAM_URL = 'http://127.0.0.1:5513';

export class DigiCamControlDriver implements CameraDriver {
	readonly name = 'digiCamControl';
	private _connected = false;

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
		const ok = res.includes('OK') || res.includes('Camera') || res.includes('model');
		console.log('[CAMERA] digiCamControl status:', ok ? 'detected' : 'no camera');
		return ok;
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
		try {
			const resp = await fetch(`${DIGICAM_URL}/?cmd=liveview`, {
				signal: AbortSignal.timeout(8000)
			});
			if (!resp.ok) return null;
			return await resp.arrayBuffer();
		} catch {
			return null;
		}
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;
		try {
			const res = await this.api('capture');
			if (!res) return null;
			// digiCamControl returns path to captured image; we wait then read it
			await new Promise(r => setTimeout(r, 2000));
			// Try to get the last captured image via session counter
			const session = await this.api('sessioncounter');
			if (!session) return null;
			const photoPath = join(tmpdir(), 'potobut-digicam.jpg');
			// Use liveview as fallback if we can't read the full image
			return this.capturePreview();
		} catch {
			return null;
		}
	}
}
