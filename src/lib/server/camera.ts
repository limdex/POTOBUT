import type { CameraDriver } from './camera/driver';
import { Gphoto2Driver } from './camera/gphoto2';
import { WindowsCameraDriver } from './camera/windows';
import { WebcamDriver } from './camera/webcam';
import { GoProDriver } from './camera/gopro';
import type { ChildProcess } from 'child_process';
import { Buffer } from 'buffer';

export interface CameraInfo {
	connected: boolean;
	model?: string;
	driver?: string;
	error?: string;
}

const drivers: CameraDriver[] = [
	new Gphoto2Driver(),
	new WindowsCameraDriver(),
	new WebcamDriver(),
	new GoProDriver()
];

let _activeDriver: CameraDriver | null = null;
let _info: CameraInfo = { connected: false };
let _capturing = false;

let _liveFeedProcess: ChildProcess | null = null;
let _liveFeedActive = false;
const _subscribers = new Set<(buf: Buffer) => void>();

const SOI = Buffer.from([0xFF, 0xD8]);
const EOI = Buffer.from([0xFF, 0xD9]);

export function getCameraStatus(): CameraInfo {
	return { ..._info };
}

function makeInfo(driver: CameraDriver | null, connected: boolean, error?: string): CameraInfo {
	if (!driver) return { connected: false, error: error || 'No camera detected' };
	return {
		connected,
		model: driver.name,
		driver: driver.constructor.name,
		error
	};
}

export function subscribeFrames(cb: (buf: Buffer) => void): () => void {
	_subscribers.add(cb);
	if (_subscribers.size === 1 && _activeDriver && _info.connected) {
		startLiveFeed();
	}
	return () => {
		_subscribers.delete(cb);
		if (_subscribers.size === 0) {
			stopLiveFeed();
		}
	};
}

function broadcastFrame(buf: Buffer): void {
	_subscribers.forEach(cb => {
		try { cb(buf); } catch { /* */ }
	});
}

export function startLiveFeed(): void {
	if (_liveFeedActive) return;
	if (!_activeDriver) return;

	const proc = _activeDriver.startLiveFeed();
	if (!proc) return;

	_liveFeedActive = true;
	_liveFeedProcess = proc;

	let buf = Buffer.alloc(0);

	proc.stdout?.on('data', (chunk: Buffer) => {
		buf = Buffer.concat([buf, chunk]);

		while (true) {
			const soi = buf.indexOf(SOI);
			if (soi === -1) {
				if (buf.length > 500000) buf = Buffer.alloc(0);
				return;
			}
			const eoi = buf.indexOf(EOI, soi + 2);
			if (eoi === -1) {
				if (soi > 0) buf = buf.subarray(soi);
				if (buf.length > 1000000) buf = Buffer.alloc(0);
				return;
			}
			const frame = Buffer.from(buf.subarray(soi, eoi + 2));
			buf = buf.subarray(eoi + 2);
			if (frame.length > 500) broadcastFrame(frame);
		}
	});

	let stderrBuf = '';
	proc.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString(); });

	proc.on('exit', (code) => {
		_liveFeedProcess = null;
		_liveFeedActive = false;
		if (code !== 0) {
			console.log('[CAMERA] Live feed exited code', code, stderrBuf.trim() ? `stderr: ${stderrBuf.trim()}` : '');
		}
	});

	proc.on('error', (e) => {
		console.log('[CAMERA] Live feed error:', e.message);
		_liveFeedProcess = null;
		_liveFeedActive = false;
	});

	console.log('[CAMERA] Live feed started');
}

export async function stopLiveFeed(): Promise<void> {
	_liveFeedActive = false;
	if (!_liveFeedProcess) return;

	const proc = _liveFeedProcess;
	_liveFeedProcess = null;

	return new Promise<void>((resolve) => {
		let resolved = false;
		const done = () => { if (!resolved) { resolved = true; resolve(); } };

		proc.on('exit', done);
		try { proc.kill('SIGINT'); } catch { /* */ }

		setTimeout(() => {
			if (!resolved) {
				console.log('[CAMERA] Live feed not exiting, force kill');
				try { proc.kill('SIGKILL'); } catch { /* */ }
				done();
			}
		}, 5000);
	});
}

export async function connectCamera(): Promise<CameraInfo> {
	for (const driver of drivers) {
		const found = await driver.detect();
		if (!found) continue;

		const ok = await driver.connect();
		if (ok) {
			_activeDriver = driver;
			_info = makeInfo(driver, true);
			return getCameraStatus();
		}
	}

	_activeDriver = null;
	_info = makeInfo(null, false, 'No compatible camera found');
	return getCameraStatus();
}

export async function disconnectCamera(): Promise<CameraInfo> {
	await stopLiveFeed();
	if (_activeDriver) {
		await _activeDriver.disconnect();
		_activeDriver = null;
	}
	_info = { connected: false };
	return getCameraStatus();
}

export async function capturePhoto(): Promise<ArrayBuffer | null> {
	if (!_activeDriver || !_info.connected) return null;
	if (_capturing) {
		console.log('[CAMERA] Capture already in progress, skipping');
		return null;
	}
	_capturing = true;

	const hadLiveFeed = _liveFeedActive;
	if (hadLiveFeed) {
		console.log('[CAMERA] Stopping live feed for capture...');
		await stopLiveFeed();
		await new Promise(r => setTimeout(r, 500));
	}

	try {
		const result = await _activeDriver.capturePhoto();
		return result;
	} finally {
		_capturing = false;
		if (hadLiveFeed || _subscribers.size > 0) {
			console.log('[CAMERA] Restarting live feed after capture...');
			startLiveFeed();
		}
	}
}
