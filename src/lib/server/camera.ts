import type { CameraDriver } from './camera/driver';
import { Libgphoto2Driver } from './camera/libgphoto2';
// import { Gphoto2Driver } from './camera/gphoto2'; // CLI — diganti libgphoto2 FFI
// import { EdsdkDriver } from './camera/edsdk'; // EDSDK — diganti libgphoto2 FFI
import { WindowsCameraDriver } from './camera/windows';
import { WebcamDriver } from './camera/webcam';
import { GoProDriver } from './camera/gopro';

export interface CameraInfo {
	connected: boolean;
	model?: string;
	driver?: string;
	error?: string;
}

const drivers: CameraDriver[] = [
	new Libgphoto2Driver(),
	// new Gphoto2Driver(), // CLI gphoto2 — dikomen, sekarang pake libgphoto2 FFI
	// new EdsdkDriver('native/EDSDK.dll', 'v13'), // EDSDK v13 — 750D+
	// new EdsdkDriver('native/edsdk_v3/EDSDK.dll', 'v3'), // EDSDK v3 — 550D
	new WindowsCameraDriver(),
	new WebcamDriver(),
	new GoProDriver()
];

const _g = globalThis as any;
let _activeDriver: CameraDriver | null = _g.__camDriver ?? null;
let _info: CameraInfo = _g.__camInfo ?? { connected: false };
let _capturing = false;
let _liveFeedActive = false;
const _subscribers: Set<(buf: Buffer) => void> = _g.__camSubs ?? new Set();

_g.__camSubs = _subscribers;

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

	const ok = _activeDriver.startLiveFeed(broadcastFrame);
	if (ok) {
		_liveFeedActive = true;
	}
}

export async function stopLiveFeed(): Promise<void> {
	if (!_liveFeedActive) return;
	_liveFeedActive = false;
	if (_activeDriver) {
		await _activeDriver.stopLiveFeed();
	}
}

export async function connectCamera(): Promise<CameraInfo> {
	for (const driver of drivers) {
		const found = await driver.detect();
		if (!found) continue;

		const ok = await driver.connect();
		if (ok) {
			_activeDriver = driver;
			_info = makeInfo(driver, true);
			_g.__camDriver = _activeDriver;
			_g.__camInfo = _info;
			return getCameraStatus();
		}
	}

	_activeDriver = null;
	_info = makeInfo(null, false, 'No compatible camera found');
	_g.__camDriver = _activeDriver;
	_g.__camInfo = _info;
	return getCameraStatus();
}

export async function disconnectCamera(): Promise<CameraInfo> {
	await stopLiveFeed();
	if (_activeDriver) {
		await _activeDriver.disconnect();
		_activeDriver = null;
	}
	_info = { connected: false };
	_g.__camDriver = _activeDriver;
	_g.__camInfo = _info;
	return getCameraStatus();
}

export async function prepareCapture(): Promise<void> {
	// Live feed stays on during countdown.
	// capturePhoto does a fast stop+wait just before the shutter.
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
	}

	try {
		return await _activeDriver.capturePhoto();
	} finally {
		_capturing = false;
		if (hadLiveFeed || _subscribers.size > 0) {
			console.log('[CAMERA] Restarting live feed after capture...');
			startLiveFeed();
		}
	}
}
