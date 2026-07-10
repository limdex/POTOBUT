import { execSync, spawn, type ChildProcess } from 'child_process';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

function toMsysPath(p: string): string {
	return p.replace(/\\/g, '/');
}

const GPHOTO_ENV = { ...process.env, MSYS_NO_PATHCONV: '1' } as Record<string, string>;

const SOI = Buffer.from([0xFF, 0xD8]);
const EOI = Buffer.from([0xFF, 0xD9]);

function extractFirstJpeg(buf: Buffer): Buffer | null {
	const soiIdx = buf.indexOf(SOI);
	if (soiIdx === -1) return null;
	const eoiIdx = buf.indexOf(EOI, soiIdx + 2);
	if (eoiIdx === -1) return null;
	return Buffer.from(buf.subarray(soiIdx, eoiIdx + 2));
}

export class Gphoto2Driver implements CameraDriver {
	readonly name = 'gphoto2 (Canon/Nikon/Sony DSLR)';
	private _port?: string;
	private _model?: string;
	private _streamProcess: ChildProcess | null = null;
	private _streaming = false;
	private _latestFrame: Buffer | null = null;
	private _frameLogCount = 0;
	private _photoPath = join(tmpdir(), 'potobut-photo.jpg');
	private _photoPathMsys = toMsysPath(join(tmpdir(), 'potobut-photo.jpg'));
	private _moviePath = join(tmpdir(), 'movie.mjpg');

	async detect(): Promise<boolean> {
		if (this._streaming) {
			await this.stopStream();
		}
		try {
			const out = execSync('gphoto2 --auto-detect 2>&1', {
				timeout: 8000,
				env: GPHOTO_ENV
			}).toString();
			const lines = out.split('\n').filter(l => l.includes('usb:'));
			if (lines.length === 0) return false;

			const parts = lines[0].trim().split(/\s+/);
			this._port = parts[parts.length - 1];

			const modelParts = lines[0].replace(/\s+usb:\S+/, '').trim();
			if (modelParts) this._model = modelParts;

			console.log('[CAMERA] gphoto2 detected:', this._model || 'unknown', 'at', this._port);

			try {
				execSync('gphoto2 --reset', { timeout: 5000, env: GPHOTO_ENV, stdio: 'ignore' });
				console.log('[CAMERA] USB reset OK');
			} catch {
				// reset may not be supported, that's fine
			}
			return true;
		} catch {
			return false;
		}
	}

	async connect(): Promise<boolean> {
		if (!this._port) return false;
		await new Promise(r => setTimeout(r, 1000));
		await this.applySettings();
		this.startStream();
		return true;
	}

	async disconnect(): Promise<void> {
		await this.stopStream();
		this._port = undefined;
		this._model = undefined;
	}

	private startStream(): void {
		if (this._streaming) return;
		this._streaming = true;
		this._latestFrame = null;
		this._frameLogCount = 0;

		const runFrame = () => {
			if (!this._streaming) return;

			try { unlinkSync(this._moviePath); } catch { /* */ }

			const proc = spawn('gphoto2', [
				'--capture-movie=1',
				'--force-overwrite',
				'--quiet'
			], {
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true,
				env: GPHOTO_ENV,
				cwd: tmpdir()
			});

			this._streamProcess = proc;

			let stderrBuf = '';
			proc.stderr?.on('data', (data: Buffer) => {
				stderrBuf += data.toString();
			});

			proc.on('error', (e) => {
				console.log('[CAMERA] Frame process error:', e.message);
				this._streamProcess = null;
				if (this._streaming) {
					setTimeout(runFrame, 1000);
				}
			});

			proc.on('exit', (code) => {
				this._streamProcess = null;
				if (!this._streaming) return;

				if (code === 0) {
					try {
						if (existsSync(this._moviePath)) {
							const raw = readFileSync(this._moviePath);
							const jpeg = extractFirstJpeg(raw);
							try { unlinkSync(this._moviePath); } catch { /* */ }
							if (jpeg && jpeg.length > 500) {
								this._latestFrame = jpeg;
								if (this._frameLogCount < 2) {
									console.log('[CAMERA] Frame captured OK, size:', jpeg.length, 'bytes');
									this._frameLogCount++;
								}
							} else if (this._frameLogCount < 3) {
								console.log('[CAMERA] Frame extraction failed, raw size:', raw.length);
								this._frameLogCount++;
							}
						} else if (this._frameLogCount < 3) {
							console.log('[CAMERA] No movie file created');
							this._frameLogCount++;
						}
					} catch (e: any) {
						if (this._frameLogCount < 3) {
							console.log('[CAMERA] Frame read error:', e?.message);
							this._frameLogCount++;
						}
					}
					runFrame();
				} else {
					if (this._frameLogCount < 3) {
						console.log('[CAMERA] Frame exit code', code, stderrBuf.trim() ? `stderr: ${stderrBuf.trim()}` : '(no stderr)');
						this._frameLogCount++;
					}
					setTimeout(runFrame, 1000);
				}
			});
		};

		runFrame();
		console.log('[CAMERA] Live view stream started');
	}

	private stopStream(): Promise<void> {
		this._streaming = false;
		return new Promise((resolve) => {
			if (!this._streamProcess) {
				resolve();
				return;
			}

			const proc = this._streamProcess;
			let resolved = false;

			const done = () => {
				if (resolved) return;
				resolved = true;
				this._streamProcess = null;
				resolve();
			};

			proc.on('exit', done);

			try { proc.kill('SIGINT'); } catch { /* */ }

			setTimeout(() => {
				if (!resolved) {
					console.log('[CAMERA] Stream did not exit on SIGINT, trying SIGTERM');
					try { proc.kill('SIGTERM'); } catch { /* */ }
				}
			}, 3000);

			setTimeout(() => {
				if (!resolved) {
					console.log('[CAMERA] Stream did not exit, force killing');
					try { proc.kill('SIGKILL'); } catch { /* */ }
					done();
				}
			}, 5000);
		});
	}

	private async applySettings(): Promise<void> {
		const cfgArgs = [
			'--set-config', 'iso=400',
			'--set-config', 'aperture=5.6',
			'--set-config', 'shutterspeed=1/125',
			'--set-config', 'whitebalance=Flash',
			'--set-config', 'liveviewsize=Small',
		];
		try {
			const out = execSync(`gphoto2 ${cfgArgs.join(' ')}`, {
				timeout: 15000,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: GPHOTO_ENV
			});
			console.log('[CAMERA] Settings applied OK');
			const stdout = out.toString().trim();
			if (stdout) console.log('[CAMERA] Settings output:', stdout);
		} catch (e: any) {
			const stderr = e?.stderr?.toString()?.trim() || e?.message || '';
			console.log('[CAMERA] Settings failed:', stderr);
		}
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		if (!this._latestFrame || this._latestFrame.length < 500) return null;
		const ab = new ArrayBuffer(this._latestFrame.length);
		new Uint8Array(ab).set(this._latestFrame);
		return ab;
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		console.log('[CAMERA] Stopping stream for capture...');
		await this.stopStream();
		await new Promise(r => setTimeout(r, 500));

		try {
			const stdout = execSync(`gphoto2 --capture-image-and-download --filename "${this._photoPathMsys}" --force-overwrite --quiet`, {
				timeout: 45000,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: GPHOTO_ENV
			});
			console.log('[CAMERA] Capture stdout:', stdout.toString().trim() || '(empty)');

			if (!existsSync(this._photoPath)) {
				console.log('[CAMERA] Capture: file not created at', this._photoPath);
				throw new Error('File not created');
			}

			const buf = readFileSync(this._photoPath);
			try { unlinkSync(this._photoPath); } catch { /* */ }
			console.log('[CAMERA] Photo captured, size:', buf.length, 'bytes');
			const ab = new ArrayBuffer(buf.length);
			new Uint8Array(ab).set(buf);
			return ab;
		} catch (e: any) {
			const stderr = e?.stderr?.toString()?.trim() || '';
			console.log('[CAMERA] Capture to file failed:', e?.message || e);
			if (stderr) console.log('[CAMERA] Capture stderr:', stderr);

			console.log('[CAMERA] Trying stdout fallback...');
			try {
				const buf = execSync('gphoto2 --capture-image-and-download --stdout --force-overwrite --quiet', {
					timeout: 45000,
					stdio: ['ignore', 'pipe', 'pipe'],
					env: GPHOTO_ENV
				});
				if (buf.length < 500) {
					console.log('[CAMERA] Stdout fallback returned empty');
					return null;
				}
				console.log('[CAMERA] Photo captured via stdout, size:', buf.length, 'bytes');
				const ab2 = new ArrayBuffer(buf.length);
				new Uint8Array(ab2).set(buf);
				return ab2;
			} catch (e2: any) {
				const stderr2 = e2?.stderr?.toString()?.trim() || '';
				console.log('[CAMERA] Stdout fallback failed:', e2?.message || e2);
				if (stderr2) console.log('[CAMERA] Stdout fallback stderr:', stderr2);
				return null;
			}
		} finally {
			if (this._port) {
				console.log('[CAMERA] Restarting stream after capture...');
				this.startStream();
			}
		}
	}
}
