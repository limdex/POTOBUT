import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import type { CameraDriver } from './driver';

function toMsysPath(p: string): string {
	return p.replace(/\\/g, '/');
}

interface WorkerMsg {
	ok: boolean;
	event?: string;
	data?: string;
	size?: number;
	error?: string;
}

export class Libgphoto2Driver implements CameraDriver {
	readonly name = 'libgphoto2 (Canon/Nikon/Sony DSLR)';
	private _proc: ChildProcess | null = null;
	private _ready = false;
	private _pending: Map<string, (msg: WorkerMsg) => void> = new Map();
	private _nextId = 0;
	private _buf = '';
	private _pollId: ReturnType<typeof setInterval> | null = null;
	private _liveActive = false;
	private _onFrame: ((buf: Buffer) => void) | null = null;
	private _frameLogCount = 0;

	private _send(cmd: Record<string, any>): Promise<WorkerMsg> {
		return new Promise((resolve) => {
			const id = String(++this._nextId);
			this._pending.set(id, resolve);
			this._proc!.stdin!.write(JSON.stringify({ id, ...cmd }) + '\n');
		});
	}

	async detect(): Promise<boolean> {
		try {
			const workerPath = toMsysPath(join(process.cwd(), 'src', 'lib', 'server', 'camera', 'gphoto2-worker.cjs'));

			console.log('[libgphoto2] Spawning worker:', workerPath);

			let _resolved = false;
			const ready = await new Promise<boolean>((resolve) => {
				const done = (ok: boolean) => {
					if (_resolved) return;
					_resolved = true;
					resolve(ok);
				};

				const timeout = setTimeout(() => done(false), 15000);

				const bash = join('C:', 'msys64', 'usr', 'bin', 'bash.exe');
				const nodeExe = toMsysPath(process.execPath);
				const msysCwd = toMsysPath(process.cwd());
				console.log('[libgphoto2] Node:', nodeExe);
				this._proc = spawn(bash, ['--login', '-c', `cd "${msysCwd}" && "${nodeExe}" "${workerPath}"`], {
					stdio: ['pipe', 'pipe', 'pipe'],
					windowsHide: true,
					env: { ...process.env, MSYSTEM: 'MINGW64' },
					cwd: process.cwd()
				});

				this._proc.stderr?.on('data', (d: Buffer) => {
					console.log('[libgphoto2] worker stderr:', d.toString().trim());
				});

				this._proc.on('exit', (code) => {
					console.log('[libgphoto2] worker exited:', code);
					this._ready = false;
					if (!_resolved) {
						clearTimeout(timeout);
						done(false);
					}
				});

				this._proc.on('error', (e) => {
					console.log('[libgphoto2] worker error:', e.message);
					clearTimeout(timeout);
					done(false);
				});

				this._proc.stdout!.on('data', (d: Buffer) => {
					this._buf += d.toString();
					const lines = this._buf.split('\n');
					this._buf = lines.pop() || '';

					for (const line of lines) {
						if (!line.trim()) continue;
						try {
							const msg: WorkerMsg & { id?: string } = JSON.parse(line);
							if (msg.event === 'ready') {
								clearTimeout(timeout);
								this._ready = true;
								done(true);
								return;
							}
							if (msg.id && this._pending.has(msg.id)) {
								this._pending.get(msg.id)!(msg);
								this._pending.delete(msg.id);
							}
							if (msg.error && !msg.id) {
								// initialization error from worker
								console.log('[libgphoto2] worker init error:', msg.error);
							}
						} catch { /* partial line */ }
					}
				});
			});

			if (!ready) {
				console.log('[libgphoto2] Worker failed to start');
				this._proc?.kill();
				this._proc = null;
				return false;
			}

			console.log('[libgphoto2] Worker ready, camera connected');
			return true;
		} catch (e: any) {
			console.log('[libgphoto2] Detect error:', e?.message);
			return false;
		}
	}

	async connect(): Promise<boolean> {
		if (!this._ready || !this._proc) return false;

		// Camera is in Manual mode — exposure controlled via physical dials.
		// No software override; respect user's physical settings on the camera body.
		console.log('[libgphoto2] Connected');
		return true;
	}

	async disconnect(): Promise<void> {
		this._liveActive = false;
		if (this._pollId) { clearInterval(this._pollId); this._pollId = null; }
		this._onFrame = null;

		if (this._proc) {
			try { await this._send({ cmd: 'exit' }); } catch {}
			this._proc.kill();
			this._proc = null;
		}
		this._ready = false;
		console.log('[libgphoto2] Disconnected');
	}

	startLiveFeed(onFrame: (buf: Buffer) => void): boolean {
		if (!this._ready || !this._proc) return false;

		this._onFrame = onFrame;
		this._liveActive = true;
		this._frameLogCount = 0;

		this._pollId = setInterval(async () => {
			if (!this._liveActive || !this._proc) return;
			try {
				const msg = await this._send({ cmd: 'preview' });
				if (msg.ok && msg.data) {
					const jpeg = Buffer.from(msg.data, 'base64');
					this._onFrame?.(jpeg);
				}
			} catch {
				// skip
			}
		}, 200);

		console.log('[libgphoto2] Live feed started (worker preview loop)');
		return true;
	}

	async stopLiveFeed(): Promise<void> {
		this._liveActive = false;
		if (this._pollId) { clearInterval(this._pollId); this._pollId = null; }
		this._onFrame = null;
		console.log('[libgphoto2] Live feed stopped');
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._ready || !this._proc) return null;

		try {
			const msg = await this._send({ cmd: 'capture' });
			if (msg.ok && msg.data) {
				const jpeg = Buffer.from(msg.data, 'base64');
				const ab = new ArrayBuffer(jpeg.length);
				new Uint8Array(ab).set(jpeg);
				return ab;
			}
			return null;
		} catch {
			return null;
		}
	}
}
