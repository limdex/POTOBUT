import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

export class Gphoto2Driver implements CameraDriver {
	readonly name = 'gphoto2 (Canon/Nikon/Sony DSLR)';
	private _port?: string;

	async detect(): Promise<boolean> {
		try {
			const out = execSync('gphoto2 --auto-detect 2>&1', { timeout: 8000 }).toString();
			const lines = out.split('\n').filter(l => l.includes('usb:'));
			if (lines.length > 0) {
				const parts = lines[0].trim().split(/\s+/);
				this._port = parts[parts.length - 1];
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}

	async connect(): Promise<boolean> {
		return this._port !== undefined;
	}

	async disconnect(): Promise<void> {
		this._port = undefined;
	}

	async capturePreview(): Promise<ArrayBuffer | null> {
		const previewPath = join(tmpdir(), 'potobut-preview.jpg');
		try {
			const buf = execSync('gphoto2 --capture-preview --stdout 2>/dev/null', { timeout: 10000 });
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			try {
				execSync(`gphoto2 --capture-preview --filename "${previewPath}" --force-overwrite 2>/dev/null`, { timeout: 10000 });
				const buf = readFileSync(previewPath);
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			} catch {
				return null;
			}
		}
	}

	async capturePhoto(): Promise<ArrayBuffer | null> {
		const photoPath = join(tmpdir(), 'potobut-photo.jpg');
		try {
			execSync(`gphoto2 --capture-image-and-download --filename "${photoPath}" --force-overwrite 2>/dev/null`, { timeout: 30000 });
			const buf = readFileSync(photoPath);
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		} catch {
			try {
				const buf = execSync('gphoto2 --capture-image-stdout 2>/dev/null', { timeout: 30000 });
				return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
			} catch {
				return null;
			}
		}
	}
}
