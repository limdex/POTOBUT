import { spawnSync, spawn, type ChildProcess } from 'child_process';
import { openSync, readSync as fsReadSync, closeSync, statSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

function toMsysPath(p: string): string {
	return p.replace(/\\/g, '/');
}

const GPHOTO2_EXE = process.platform === 'win32'
	? toMsysPath(join('C:', 'msys64', 'mingw64', 'bin', 'gphoto2.exe'))
	: 'gphoto2';

const MSYS2_BASH = process.platform === 'win32'
	? toMsysPath(join('C:', 'msys64', 'usr', 'bin', 'bash.exe'))
	: null;

const MOVIE_CWD = process.platform === 'win32'
	? join('C:', 'msys64', 'tmp')
	: tmpdir();
const MOVIE_FILE = join(MOVIE_CWD, 'movie.mjpg');

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

function runGphoto2(args: string[], opts?: { timeout?: number; stdio?: any }): Buffer {
	let r;
	if (process.platform === 'win32') {
		const escapedArgs = args.map(a => a.replace(/"/g, '\\"')).join(' ');
		r = spawnSync(MSYS2_BASH!, ['-l', '-c', `${GPHOTO2_EXE} ${escapedArgs}`], {
			timeout: opts?.timeout ?? 10000,
			stdio: opts?.stdio ?? ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		});
	} else {
		r = spawnSync(GPHOTO2_EXE, args, {
			timeout: opts?.timeout ?? 10000,
			stdio: opts?.stdio ?? ['ignore', 'pipe', 'pipe'],
			env: GPHOTO_ENV
		});
	}
	if (r.error) throw r.error;
	if (r.status !== 0) {
		const stderr = r.stderr?.toString()?.trim() || '';
		throw new Error(stderr || `gphoto2 exited with code ${r.status}`);
	}
	return r.stdout;
}

export class Gphoto2Driver implements CameraDriver {
	readonly name = 'gphoto2 (Canon/Nikon/Sony DSLR)';
	private _port?: string;
	private _model?: string;
	private _pollId: ReturnType<typeof setInterval> | null = null;
	private _keepAliveId: ReturnType<typeof setInterval> | null = null;
	private _liveActive = false;
	private _onFrame: ((buf: Buffer) => void) | null = null;
	private _captureFileMsys = '/tmp/potobut-capture.jpg';
	private _captureFileWin = process.platform === 'win32'
		? join('C:', 'msys64', 'tmp', 'potobut-capture.jpg')
		: join(tmpdir(), 'potobut-capture.jpg');
	private _frameLogCount = 0;
	private _lastReadOffset = 0;
	private _batchIndex = 0;
	private _liveProcess: ChildProcess | null = null;

	async detect(): Promise<boolean> {
		try {
			const out = runGphoto2(['--auto-detect']).toString();
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
		await new Promise(r => setTimeout(r, 1000));
		await this.applySettings();

		this._keepAliveId = setInterval(() => {
			try {
				runGphoto2(['--get-config', 'iso', '--quiet'], { stdio: 'ignore' });
			} catch { /* camera may be busy */ }
		}, 8000);

		console.log('[CAMERA] Connected, keepalive started');
		return true;
	}

	async disconnect(): Promise<void> {
		if (this._keepAliveId) {
			clearInterval(this._keepAliveId);
			this._keepAliveId = null;
		}
		this._port = undefined;
		this._model = undefined;
	}

	startLiveFeed(onFrame: (buf: Buffer) => void): boolean {
		if (!this._port) return false;

		try { unlinkSync(MOVIE_FILE); } catch { /* */ }

		this._onFrame = onFrame;
		this._liveActive = true;
		this._frameLogCount = 0;
		this._batchIndex = 0;
		this._lastReadOffset = 0;

		this._startMovieBatch();
		return true;
	}

	private _startMovieBatch(): void {
		if (!this._liveActive) return;

		this._batchIndex++;
		try { unlinkSync(MOVIE_FILE); } catch { /* */ }
		this._lastReadOffset = 0;

		const cmd = `${GPHOTO2_EXE} --capture-movie=300`;
		const proc = spawn(MSYS2_BASH!, ['-l', '-c', cmd], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
			cwd: MOVIE_CWD
		});

		this._liveProcess = proc;

		if (this._batchIndex === 1) {
			this._startPolling();
		}

		let stderrBuf = '';
		proc.stderr?.on('data', (d: Buffer) => {
			stderrBuf += d.toString();
			if (this._frameLogCount < 3) {
				console.log('[CAMERA]', d.toString().trim());
			}
		});

		proc.on('error', (e) => {
			console.log('[CAMERA] Movie batch error:', e.message);
			this._liveProcess = null;
			if (this._liveActive) {
				setTimeout(() => this._startMovieBatch(), 1000);
			}
		});

		proc.on('exit', (code) => {
			this._liveProcess = null;
			if (!this._liveActive) return;

			if (code === 0 && !stderrBuf.includes('I/O problem')) {
				if (this._frameLogCount < 2) {
					console.log('[CAMERA] Movie batch', this._batchIndex, 'OK');
					this._frameLogCount++;
				}
				setTimeout(() => this._startMovieBatch(), 300);
			} else {
				if (this._frameLogCount < 3) {
					console.log('[CAMERA] Movie batch', this._batchIndex, 'done, restarting in 3s',
						stderrBuf.trim() ? `(${stderrBuf.trim().substring(0, 80)})` : '');
					this._frameLogCount++;
				}
				setTimeout(() => this._startMovieBatch(), 3000);
			}
		});
	}

	private _startPolling(): void {
		if (this._pollId) return;

		setTimeout(() => {
			if (!this._liveActive) return;
			this._pollId = setInterval(() => {
				if (!this._onFrame || !this._liveActive) return;
				try {
					if (!existsSync(MOVIE_FILE)) return;

					const stat = statSync(MOVIE_FILE);
					const fileSize = stat.size;
					if (fileSize <= this._lastReadOffset) return;

					const readSize = fileSize - this._lastReadOffset;
					const buf = Buffer.alloc(readSize);
					const fd = openSync(MOVIE_FILE, 'r');
					fsReadSync(fd, buf, 0, readSize, this._lastReadOffset);
					closeSync(fd);
					this._lastReadOffset = fileSize;

					const jpeg = extractLastJpeg(buf);
					if (jpeg) {
						if (this._frameLogCount < 3) {
							console.log('[CAMERA] Frame OK, size:', jpeg.length, 'bytes');
							this._frameLogCount++;
						}
						this._onFrame(jpeg);
					}
				} catch {
					// File locked or removed, skip
				}
			}, 80);

			console.log('[CAMERA] Live feed started (--capture-movie file polling)');
		}, 1500);
	}

	async stopLiveFeed(): Promise<void> {
		this._liveActive = false;

		if (this._pollId) {
			clearInterval(this._pollId);
			this._pollId = null;
		}
		this._onFrame = null;

		if (this._liveProcess) {
			const proc = this._liveProcess;
			this._liveProcess = null;
			proc.kill('SIGTERM');
			await new Promise<void>((resolve) => {
				if (proc.exitCode !== null) { resolve(); return; }
				proc.on('exit', () => resolve());
				setTimeout(() => resolve(), 3000);
			});
		}

		try { unlinkSync(MOVIE_FILE); } catch { /* */ }

		await new Promise(r => setTimeout(r, 1000));
		try {
			runGphoto2(['--reset'], { stdio: 'ignore', timeout: 10000 });
			console.log('[CAMERA] Reset OK after feed stop');
		} catch {
			console.log('[CAMERA] Reset failed, continuing');
		}

		console.log('[CAMERA] Live feed stopped');
	}

	private async applySettings(): Promise<void> {
		const cfgArgs = [
			'--set-config', 'iso=400',
			'--set-config', 'aperture=5.6',
			'--set-config', 'shutterspeed=1/125',
			'--set-config', 'whitebalance=Flash',
		];
		try {
			const out = runGphoto2(cfgArgs, { timeout: 15000 });
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
			try { unlinkSync(this._captureFileWin); } catch { /* */ }

			runGphoto2([
				'--capture-image-and-download',
				'--filename', this._captureFileMsys,
				'--force-overwrite',
				'--quiet'
			], { timeout: 45000 });

			if (!existsSync(this._captureFileWin)) {
				console.log('[CAMERA] Capture: file not created at', this._captureFileWin);
				return null;
			}

			const buf = readFileSync(this._captureFileWin);
			try { unlinkSync(this._captureFileWin); } catch { /* */ }
			console.log('[CAMERA] Photo captured, size:', buf.length, 'bytes');
			const ab = new ArrayBuffer(buf.length);
			new Uint8Array(ab).set(buf);
			return ab;
		} catch (e: any) {
			const stderr = e?.stderr?.toString()?.trim() || '';
			console.log('[CAMERA] Capture failed:', e?.message || e);
			if (stderr) console.log('[CAMERA] Capture stderr:', stderr);
			return null;
		}
	}
}
