import { execSync, spawn, type ChildProcess } from 'child_process';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

function toMsysPath(p: string): string {
	return p.replace(/\\/g, '/');
}

export class Gphoto2Driver implements CameraDriver {
	readonly name = 'gphoto2 (Canon/Nikon/Sony DSLR)';
	private _port?: string;
	private _model?: string;
	private _previewProcess: ChildProcess | null = null;
	private _previewPath = join(tmpdir(), 'potobut-preview.jpg');
	private _previewPathMsys = toMsysPath(join(tmpdir(), 'potobut-preview.jpg'));
	private _streaming = false;
	private _previewLogCount = 0;

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
		await this.stopPreviewLoop();
		this._port = undefined;
		this._model = undefined;
	}

	private startPreviewLoop(): void {
		if (this._streaming) return;
		this._streaming = true;
		this._previewLogCount = 0;

		const runPreview = () => {
			if (!this._streaming) return;

			const proc = spawn('gphoto2', [
				'--capture-preview',
				'--filename', this._previewPathMsys,
				'--overwrite',
				'--quiet'
			], {
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true
			});

			this._previewProcess = proc;

			let stderrBuf = '';
			proc.stderr?.on('data', (data: Buffer) => {
				stderrBuf += data.toString();
			});

			proc.on('error', (e) => {
				console.log('[CAMERA] Preview process error:', e.message);
				if (this._streaming) {
					setTimeout(runPreview, 1000);
				}
			});

			proc.on('exit', (code) => {
				this._previewProcess = null;
				if (!this._streaming) return;

				if (code !== 0) {
					if (this._previewLogCount < 3) {
						console.log('[CAMERA] Preview exit code', code, stderrBuf.trim() ? `stderr: ${stderrBuf.trim()}` : '(no stderr)');
						this._previewLogCount++;
					}
					setTimeout(runPreview, 1000);
				} else {
					if (this._previewLogCount < 2) {
						console.log('[CAMERA] Preview frame captured OK');
						this._previewLogCount++;
					}
					runPreview();
				}
			});
		};

		runPreview();
		console.log('[CAMERA] Live preview loop started');
	}

	private stopPreviewLoop(): Promise<void> {
		this._streaming = false;
		return new Promise((resolve) => {
			if (!this._previewProcess) {
				resolve();
				return;
			}

			const proc = this._previewProcess;
			let resolved = false;

			const done = () => {
				if (resolved) return;
				resolved = true;
				this._previewProcess = null;
				resolve();
			};

			proc.on('exit', done);
			proc.kill();

			setTimeout(() => {
				if (!resolved) {
					console.log('[CAMERA] Preview did not exit, force killing');
					try { proc.kill('SIGKILL'); } catch { /* */ }
					done();
				}
			}, 3000);
		});
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
				execSync(`gphoto2 --set-config ${s.key}=${s.value}`, {
					timeout: 5000,
					stdio: ['ignore', 'pipe', 'pipe']
				});
				console.log('[CAMERA] Set', s.key, '=', s.value);
			} catch (e: any) {
				console.log('[CAMERA] Setting', s.key, 'failed:', e?.stderr?.toString()?.trim() || e?.message);
			}
		}
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		try {
			if (!existsSync(this._previewPath)) {
				return null;
			}
			const { readFile } = await import('fs/promises');
			const buf = await readFile(this._previewPath);
			if (buf.length < 500) return null;
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			return null;
		}
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		console.log('[CAMERA] Stopping preview for capture...');
		await this.stopPreviewLoop();
		await new Promise(r => setTimeout(r, 500));

		const photoPath = join(tmpdir(), 'potobut-photo.jpg');
		const photoPathMsys = toMsysPath(photoPath);

		try {
			const stdout = execSync(`gphoto2 --capture-image-and-download --filename "${photoPathMsys}" --overwrite --quiet`, {
				timeout: 45000,
				stdio: ['ignore', 'pipe', 'pipe']
			});
			console.log('[CAMERA] Capture stdout:', stdout.toString().trim() || '(empty)');

			if (!existsSync(photoPath)) {
				console.log('[CAMERA] Capture: file not created at', photoPath);
				throw new Error('File not created');
			}

			const buf = readFileSync(photoPath);
			try { unlinkSync(photoPath); } catch { /* */ }
			console.log('[CAMERA] Photo captured, size:', buf.length, 'bytes');
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch (e: any) {
			const stderr = e?.stderr?.toString()?.trim() || '';
			console.log('[CAMERA] Capture to file failed:', e?.message || e);
			if (stderr) console.log('[CAMERA] Capture stderr:', stderr);

			console.log('[CAMERA] Trying stdout fallback...');
			try {
				const buf = execSync('gphoto2 --capture-image-and-download --stdout --quiet', {
					timeout: 45000,
					stdio: ['ignore', 'pipe', 'pipe']
				});
				if (buf.length < 500) {
					console.log('[CAMERA] Stdout fallback returned empty');
					return null;
				}
				console.log('[CAMERA] Photo captured via stdout, size:', buf.length, 'bytes');
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			} catch (e2: any) {
				const stderr2 = e2?.stderr?.toString()?.trim() || '';
				console.log('[CAMERA] Stdout fallback failed:', e2?.message || e2);
				if (stderr2) console.log('[CAMERA] Stdout fallback stderr:', stderr2);
				return null;
			}
		} finally {
			if (this._port) {
				console.log('[CAMERA] Restarting preview after capture...');
				this.startPreviewLoop();
			}
		}
	}
}
