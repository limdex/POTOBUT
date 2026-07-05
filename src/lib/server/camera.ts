import type { CameraDriver } from './camera/driver';
import { Gphoto2Driver } from './camera/gphoto2';
import { WebcamDriver } from './camera/webcam';
import { GoProDriver } from './camera/gopro';
import { WindowsCameraDriver } from './camera/windows';

export interface CameraInfo {
	connected: boolean;
	model?: string;
	driver?: string;
	error?: string;
}

const drivers: CameraDriver[] = [
	new WindowsCameraDriver(),
	new Gphoto2Driver(),
	new WebcamDriver(),
	new GoProDriver()
];

let _activeDriver: CameraDriver | null = null;
let _info: CameraInfo = { connected: false };

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

export function disconnectCamera(): CameraInfo {
	if (_activeDriver) {
		_activeDriver.disconnect();
		_activeDriver = null;
	}
	_info = { connected: false };
	return getCameraStatus();
}

export async function capturePreview(): Promise<ArrayBuffer | null> {
	if (!_activeDriver || !_info.connected) return null;
	return _activeDriver.capturePreview();
}

export async function capturePhoto(): Promise<ArrayBuffer | null> {
	if (!_activeDriver || !_info.connected) return null;
	return _activeDriver.capturePhoto();
}
