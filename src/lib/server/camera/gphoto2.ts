import { execSync, spawn, type ChildProcess } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

const QUIET = process.platform === 'win32' ? '2>nul' : '2>/dev/null';

export class Gphoto2Driver implements CameraDriver {
	readonly name = 'gphoto2 (Canon/Nikon/Sony DSLR)';
	private _port?: string;
	private _model?: string;
	private _previewProcess: ChildProcess | null = null;
	private _previewPath = join(tmpdir(), 'potobut-preview.jpg');
	private _streaming = false;

	async detect(): Promise<boolean> {
		try {
			const out = execSync('gphoto2 --auto-detect 2>&1', { timeout: 8000 }).toString();
			const lines = out.split('\n').filter(l => l.includes('usb:'));
			if (lines.length === 0) return false;

			const parts = lines[0].trim().split(/\s+/);
			this._port = parts[parts.length - 1];

			const modelParts = lines[0].replace(/\s+usb:\S+/, '').trim();
			if (modelParts) this._model = modelParts;

			console.log('[CAMERA] gphoto2 detected:', this._model || 'unknown', 'at', this._port);
			return true;
		} catch {
			return false;
		}
	}

	async connect(): Promise<boolean> {
		if (!this._port) return false;
		await this.applySettings();
		this.startPreviewLoop();
		return true;
	}

	async disconnect(): Promise<void> {
		this._streaming = false;
		if (this._previewProcess) {
			this._previewProcess.kill();
			this._previewProcess = null;
		}
		this._port = undefined;
		this._model = undefined;
	}

	private startPreviewLoop(): void {
		if (this._streaming) return;
		this._streaming = true;

		const runPreview = () => {
			if (!this._streaming) return;

			const proc = spawn('gphoto2', [
				'--capture-preview',
				'--filename', this._previewPath,
				'--overwrite',
				'--quiet'
			], {
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true
			});

			this._previewProcess = proc;

			proc.stderr?.on('data', () => {});

			proc.on('error', (e) => {
				console.log('[CAMERA] Preview process error:', e.message);
				if (this._streaming) {
					setTimeout(runPreview, 300);
				}
			});

			proc.on('exit', (code) => {
				this._previewProcess = null;
				if (this._streaming) {
					if (code !== 0) {
						setTimeout(runPreview, 500);
					} else {
						runPreview();
					}
				}
			});
		};

		runPreview();
		console.log('[CAMERA] Live preview loop started');
	}

	private stopPreviewLoop(): void {
		this._streaming = false;
		if (this._previewProcess) {
			this._previewProcess.kill();
			this._previewProcess = null;
		}
	}

	private async applySettings(): Promise<void> {
		const settings = [
			{ key: 'iso', value: '400' },
			{ key: 'aperture', value: '5.6' },
			{ key: 'shutterspeed', value: '1/125' },
			{ key: 'whitebalance', value: 'Flash' },
		];
		for (const s of settings) {
			try {
				execSync(`gphoto2 --set-config ${s.key}=${s.value} ${QUIET}`, { timeout: 5000 });
				console.log('[CAMERA] Set', s.key, '=', s.value);
			} catch {
				// setting may not be supported on this body
			}
		}
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		try {
			const { readFile } = await import('fs/promises');
			const buf = await readFile(this._previewPath);
			if (buf.length < 500) return null;
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			return null;
		}
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		this.stopPreviewLoop();
		await this.applySettings();

		const photoPath = join(tmpdir(), 'potobut-photo.jpg');
		try {
			execSync(`gphoto2 --capture-image-and-download --filename "${photoPath}" --force-overwrite ${QUIET}`, { timeout: 45000 });
			const buf = readFileSync(photoPath);
			try { unlinkSync(photoPath); } catch { /* */ }
			console.log('[CAMERA] Photo captured, size:', buf.length, 'bytes');
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			try {
				const buf = execSync(`gphoto2 --capture-image-and-download --stdout ${QUIET}`, { timeout: 45000 });
				console.log('[CAMERA] Photo captured via stdout, size:', buf.length, 'bytes');
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			} catch (e: any) {
				console.log('[CAMERA] Photo capture failed:', e?.message || e);
				return null;
			}
		} finally {
			if (this._port) this.startPreviewLoop();
		}
	}
}
