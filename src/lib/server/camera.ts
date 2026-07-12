import type { CameraDriver } from './camera/driver';
import { Gphoto2Driver } from './camera/gphoto2';
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
	new Gphoto2Driver(),
	new WindowsCameraDriver(),
	new WebcamDriver(),
	new GoProDriver()
];

let _activeDriver: CameraDriver | null = null;
let _info: CameraInfo = { connected: false };
let _capturing = false;
let _liveFeedActive = false;
const _subscribers = new Set<(buf: Buffer) => void>();

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
		await new Promise(r => setTimeout(r, 2000));
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
