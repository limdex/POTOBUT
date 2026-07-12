import { execSync, spawn, type ChildProcess } from 'child_process';
import { readFileSync, openSync, readSync as fsReadSync, closeSync, statSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

function toMsysPath(p: string): string {
	return p.replace(/\\/g, '/');
}

const GPHOTO_ENV = { ...process.env, MSYS_NO_PATHCONV: '1' } as Record<string, string>;

const SOI = Buffer.from([0xFF, 0xD8]);
const EOI = Buffer.from([0xFF, 0xD9]);

function extractLastJpeg(buf: Buffer): Buffer | null {
	let last: Buffer | null = null;
	let pos = 0;
	while (pos < buf.length) {
		const soi = buf.indexOf(SOI, pos);
		if (soi === -1) break;
		const eoi = buf.indexOf(EOI, soi + 2);
		if (eoi === -1) break;
		const frame = Buffer.from(buf.subarray(soi, eoi + 2));
		if (frame.length > 500) last = frame;
		pos = eoi + 2;
	}
	return last;
}

export class Gphoto2Driver implements CameraDriver {
	readonly name = 'gphoto2 (Canon/Nikon/Sony DSLR)';
	private _port?: string;
	private _model?: string;
	private _liveProcess: ChildProcess | null = null;
	private _pollId: ReturnType<typeof setInterval> | null = null;
	private _keepAlive = false;
	private _onFrame: ((buf: Buffer) => void) | null = null;
	private _lastReadOffset = 0;
	private _photoPath = join(tmpdir(), 'potobut-photo.jpg');
	private _photoPathMsys = toMsysPath(join(tmpdir(), 'potobut-photo.jpg'));
	private _frameLogCount = 0;
	private _batchIndex = 0;

	async detect(): Promise<boolean> {
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
				// reset may not be supported
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
		return true;
	}

	async disconnect(): Promise<void> {
		this._port = undefined;
		this._model = undefined;
	}

	startLiveFeed(onFrame: (buf: Buffer) => void): boolean {
		if (!this._port) return false;

		const moviePath = join(tmpdir(), 'movie.mjpg');
		try { unlinkSync(moviePath); } catch { /* */ }

		this._onFrame = onFrame;
		this._keepAlive = true;
		this._frameLogCount = 0;
		this._batchIndex = 0;

		this._startMovieBatch(moviePath);
		return true;
	}

	private _startMovieBatch(moviePath: string): void {
		if (!this._keepAlive) return;

		this._batchIndex++;
		try { unlinkSync(moviePath); } catch { /* */ }

		const proc = spawn('gphoto2', [
			'--capture-movie=15',
			'--force-overwrite',
			'--quiet'
		], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
			env: GPHOTO_ENV,
			cwd: tmpdir()
		});

		this._liveProcess = proc;
		this._lastReadOffset = 0;

		if (this._batchIndex === 1) {
			this._startPolling(moviePath);
		}

		let stderrBuf = '';
		proc.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString(); });

		proc.on('error', (e) => {
			console.log('[CAMERA] Movie batch error:', e.message);
			this._liveProcess = null;
			if (this._keepAlive) {
				setTimeout(() => this._startMovieBatch(moviePath), 1000);
			}
		});

		proc.on('exit', (code) => {
			this._liveProcess = null;
			if (!this._keepAlive) return;

			if (code === 0) {
				if (this._frameLogCount < 2) {
					console.log('[CAMERA] Movie batch', this._batchIndex, 'finished OK');
					this._frameLogCount++;
				}
				this._startMovieBatch(moviePath);
			} else {
				if (this._frameLogCount < 3) {
					console.log('[CAMERA] Movie batch', this._batchIndex, 'exited code', code,
						stderrBuf.trim() ? `stderr: ${stderrBuf.trim()}` : '');
					this._frameLogCount++;
				}
				setTimeout(() => this._startMovieBatch(moviePath), 1000);
			}
		});
	}

	private _startPolling(moviePath: string): void {
		if (this._pollId) return;

		this._pollId = setInterval(() => {
			if (!this._onFrame) return;
			try {
				if (!existsSync(moviePath)) return;

				const stat = statSync(moviePath);
				const fileSize = stat.size;
				if (fileSize <= this._lastReadOffset) return;

				const readSize = fileSize - this._lastReadOffset;
				const buf = Buffer.alloc(readSize);
				const fd = openSync(moviePath, 'r');
				fsReadSync(fd, buf, 0, readSize, this._lastReadOffset);
				closeSync(fd);
				this._lastReadOffset = fileSize;

				const jpeg = extractLastJpeg(buf);
				if (jpeg) {
					if (this._frameLogCount < 2) {
						console.log('[CAMERA] Frame OK, size:', jpeg.length, 'bytes');
						this._frameLogCount++;
					}
					this._onFrame(jpeg);
				}
			} catch {
				// File locked or removed, skip
			}
		}, 100);

		console.log('[CAMERA] Live feed started (file polling)');
	}

	async stopLiveFeed(): Promise<void> {
		this._keepAlive = false;

		if (this._pollId) {
			clearInterval(this._pollId);
			this._pollId = null;
		}
		this._onFrame = null;

		// Wait for current batch to finish naturally (15 frames at ~10fps = ~1.5s)
		if (this._liveProcess) {
			const proc = this._liveProcess;
			this._liveProcess = null;
			await new Promise<void>((resolve) => {
				if (proc.exitCode !== null) { resolve(); return; }
				proc.on('exit', () => resolve());
				setTimeout(() => resolve(), 3000);
			});
		}

		await new Promise(r => setTimeout(r, 500));
		try {
			execSync('gphoto2 --reset', { timeout: 10000, env: GPHOTO_ENV, stdio: 'ignore' });
			console.log('[CAMERA] USB reset after stop OK');
		} catch (e: any) {
			console.log('[CAMERA] USB reset failed:', e?.message);
		}
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

	async capturePhoto(): Promise<ArrayBuffer | null> {
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
		}
	}
}
