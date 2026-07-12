import { execSync, spawn, type ChildProcess } from 'child_process';
import { existsSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

export class WindowsCameraDriver implements CameraDriver {
	readonly name = 'Windows Camera (DirectShow)';
	private _deviceName?: string;
	private _ffmpeg: ChildProcess | null = null;
	private _streamPath = '';
	private _connected = false;

	async detect(): Promise<boolean> {
		if (process.platform !== 'win32') return false;

		try {
			const out = execSync('ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1', { timeout: 8000 }).toString();
			const lines = out.split('\n');
			for (const line of lines) {
				const match = line.trim().match(/"([^"]+)"/);
				if (match) {
					console.log('[CAMERA] Found DirectShow device:', match[1]);
					this._deviceName = match[1];
					return true;
				}
			}
		} catch {
			// ffmpeg not installed
		}

		try {
			const out = execSync('wmic path Win32_PnPEntity where "PNPClass=\'Camera\' or PNPClass=\'Image\'" get Name /format:value 2>&1', { timeout: 5000 }).toString();
			const lines = out.split('\n').filter(l => l.trim());
			for (const line of lines) {
				const match = line.match(/^Name=(.+)/);
				if (match && match[1].trim() !== 'null') {
					console.log('[CAMERA] Found via WMI:', match[1].trim());
					this._deviceName = match[1].trim();
					return true;
				}
			}
		} catch {
			// WMI not available
		}

		return false;
	}

	async connect(): Promise<boolean> {
		if (!this._deviceName) return false;
		this._streamPath = join(tmpdir(), 'potobut-live.jpg');

		try {
			this._ffmpeg = spawn('ffmpeg', [
				'-y', '-fflags', 'nobuffer',
				'-f', 'dshow',
				'-rtbufsize', '32M',
				'-i', `video=${this._deviceName}`,
				'-vf', 'fps=15',
				'-q:v', '5',
				'-f', 'image2',
				'-update', '1',
				this._streamPath
			], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

			this._ffmpeg.stderr?.on('data', () => {});
			this._ffmpeg.on('error', (e) => console.log('[CAMERA] ffmpeg error:', e.message));
			this._ffmpeg.on('exit', () => {
				this._ffmpeg = null;
				if (this._connected) {
					setTimeout(() => this._startFfmpegLoop(), 1000);
				}
			});

			await new Promise<void>((resolve, reject) => {
				const check = setInterval(() => {
					if (existsSync(this._streamPath) && statSync(this._streamPath).size > 1000) {
						clearInterval(check);
						resolve();
					}
				}, 200);
				setTimeout(() => { clearInterval(check); reject(new Error('timeout')); }, 8000);
			});

			console.log('[CAMERA] Live stream started');
			this._connected = true;
			return true;
		} catch (e) {
			console.log('[CAMERA] Failed to start live stream:', e instanceof Error ? e.message : e);
			this._ffmpeg?.kill();
			this._ffmpeg = null;
			return false;
		}
	}

	private _startFfmpegLoop(): void {
		if (!this._deviceName) return;
		this._ffmpeg = spawn('ffmpeg', [
			'-y', '-fflags', 'nobuffer',
			'-f', 'dshow',
			'-rtbufsize', '32M',
			'-i', `video=${this._deviceName}`,
			'-vf', 'fps=15',
			'-q:v', '5',
			'-f', 'image2',
			'-update', '1',
			this._streamPath
		], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

		this._ffmpeg.stderr?.on('data', () => {});
		this._ffmpeg.on('error', (e) => console.log('[CAMERA] ffmpeg error:', e.message));
		this._ffmpeg.on('exit', () => {
			this._ffmpeg = null;
			if (this._connected) {
				setTimeout(() => this._startFfmpegLoop(), 1000);
			}
		});
	}

	startLiveFeed(): ChildProcess | null {
		if (!this._deviceName) return null;

		const proc = spawn('ffmpeg', [
			'-hide_banner', '-loglevel', 'error',
			'-f', 'dshow',
			'-rtbufsize', '32M',
			'-i', `video=${this._deviceName}`,
			'-vf', 'fps=15,format=mjpeg',
			'-f', 'image2pipe',
			'-'
		], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		});

		return proc;
	}

	async stopLiveFeed(): Promise<void> {
		if (this._ffmpeg) {
			this._ffmpeg.kill('SIGTERM');
			this._ffmpeg = null;
		}
	}

	async disconnect(): Promise<void> {
		this._connected = false;
		if (this._ffmpeg) {
			this._ffmpeg.kill('SIGTERM');
			this._ffmpeg = null;
		}
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		try {
			const { readFile } = await import('fs/promises');
			const buf = await readFile(this._streamPath);
			if (buf.length < 100) return null;
			const ab = new ArrayBuffer(buf.length);
			new Uint8Array(ab).set(buf);
			return ab;
		} catch {
			return null;
		}
	}
}
