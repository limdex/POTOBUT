import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

const GOPRO_API = 'http://10.5.5.9:8080';

export class GoProDriver implements CameraDriver {
	readonly name = 'GoPro (Wi-Fi)';
	private _connected = false;

	async detect(): Promise<boolean> {
		try {
			const out = execSync('ping -n 1 -w 500 10.5.5.9 2>&1 || ping -c 1 -W 1 10.5.5.9 2>&1', { timeout: 2000 }).toString();
			if (out.includes('TTL=') || out.includes('ttl=') || out.includes('1 received')) {
				this._connected = true;
				return true;
			}
		} catch {
			// not reachable
		}
		return false;
	}

	async connect(): Promise<boolean> {
		const detected = await this.detect();
		this._connected = detected;
		return detected;
	}

	async disconnect(): Promise<void> {
		this._connected = false;
	}

	async fetchApi(path: string): Promise<Response | null> {
		try {
			const resp = await fetch(`${GOPRO_API}${path}`, { signal: AbortSignal.timeout(3000) });
			return resp;
		} catch {
			return null;
		}
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;
		try {
			const resp = await fetch(`${GOPRO_API}/gp/gpMediaMetadata`, { signal: AbortSignal.timeout(3000) });
			if (!resp.ok) return null;
			return await resp.arrayBuffer();
		} catch {
			return null;
		}
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._connected) return null;
		try {
			await this.fetchApi('/gp/gpControl/command/shutter?p=1');
			await new Promise(r => setTimeout(r, 2000));
			await this.fetchApi('/gp/gpControl/command/shutter?p=0');
			const photoPath = join(tmpdir(), 'potobut-gopro.jpg');
			execSync(`curl -o "${photoPath}" "${GOPRO_API}/gp/gpMediaList" 2>/dev/null`, { timeout: 10000 });
			return null;
		} catch {
			return null;
		}
	}
}
