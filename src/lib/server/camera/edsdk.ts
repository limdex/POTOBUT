import { load as koffiLoad } from 'koffi';
import type { LibraryHandle } from 'koffi';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

// ============================================================
// Load DLLs
// ============================================================

const EDSDK_PATH = join(process.cwd(), 'native', 'EDSDK.dll');
let _edsdk: LibraryHandle | null = null;
let _memcpyFn: ((dst: Buffer, src: number, len: number) => void) | null = null;

function ensureLoaded() {
	if (_edsdk) return;
	_edsdk = koffiLoad(EDSDK_PATH);
	const ucrt = koffiLoad('ucrtbase.dll');
	_memcpyFn = ucrt.func('void *', 'memcpy', ['void *', 'void *', 'uint64_t']) as any;
}

// ============================================================
// Types
// ============================================================

type EdsBaseRef = Buffer;
type EdsCameraRef = Buffer;
type EdsEvfImageRef = Buffer;
type EdsStreamRef = Buffer;

const EDS_ERR_OK = 0;

// Command IDs
const TAKE_PICTURE = 0x00000004;
const PRESS_HALFWAY = 0x00000006;
const PRESS_FULLY = 0x00000007;

// Property IDs
const EVF_MODE = 0x00000501;
const ISO = 0x00000101;
const APERTURE = 0x00000201;
const SHUTTER_SPEED = 0x00000203;
const WHITE_BALANCE = 0x00000108;

// Stream creation
const CREATE_ALWAYS = 1;
const ACCESS_WRITE = 1;

// ============================================================
// Function declarations (lazily resolved)
// ============================================================

let _initFn: (() => number) | null = null;
let _termFn: (() => number) | null = null;
let _getCamListFn: ((out: Buffer) => number) | null = null;
let _getChildCountFn: ((ref: Buffer, out: Buffer) => number) | null = null;
let _getChildAtIndexFn: ((ref: Buffer, idx: number, out: Buffer) => number) | null = null;
let _getDeviceInfoFn: ((ref: Buffer, out: Buffer) => number) | null = null;
let _openSessionFn: ((ref: Buffer) => number) | null = null;
let _closeSessionFn: ((ref: Buffer) => number) | null = null;
let _releaseFn: ((ref: Buffer) => number) | null = null;
let _sendCommandFn: ((ref: Buffer, cmd: number, param: number) => number) | null = null;
let _setPropDataFn: ((ref: Buffer, prop: number, p: number, size: number, data: Buffer) => number) | null = null;
let _getPropSizeFn: ((ref: Buffer, prop: number, p: number, outType: Buffer, outSize: Buffer) => number) | null = null;
let _getPropDataFn: ((ref: Buffer, prop: number, p: number, size: number, out: Buffer) => number) | null = null;
let _createEvfRefFn: ((cam: Buffer, out: Buffer) => number) | null = null;
let _downloadEvfFn: ((cam: Buffer, evf: Buffer) => number) | null = null;
let _getLengthFn: ((ref: Buffer, out: Buffer) => number) | null = null;
let _getPointerFn: ((ref: Buffer, out: Buffer) => number) | null = null;
let _createFileStreamFn: ((path: string, disp: number, access: number, out: Buffer) => number) | null = null;
let _downloadFn: ((item: Buffer, size: number, stream: Buffer) => number) | null = null;
let _downloadCompleteFn: ((item: Buffer) => number) | null = null;

function resolveFns() {
	ensureLoaded();
	const lib = _edsdk!;

	_initFn = lib.func('uint32_t', 'EdsInitializeSDK', []);
	_termFn = lib.func('uint32_t', 'EdsTerminateSDK', []);
	_getCamListFn = lib.func('uint32_t', 'EdsGetCameraList', ['void *']);
	_getChildCountFn = lib.func('uint32_t', 'EdsGetChildCount', ['void *', 'void *']);
	_getChildAtIndexFn = lib.func('uint32_t', 'EdsGetChildAtIndex', ['void *', 'int32_t', 'void *']);
	_getDeviceInfoFn = lib.func('uint32_t', 'EdsGetDeviceInfo', ['void *', 'void *']);
	_openSessionFn = lib.func('uint32_t', 'EdsOpenSession', ['void *']);
	_closeSessionFn = lib.func('uint32_t', 'EdsCloseSession', ['void *']);
	_releaseFn = lib.func('uint32_t', 'EdsRelease', ['void *']);
	_sendCommandFn = lib.func('uint32_t', 'EdsSendCommand', ['void *', 'uint32_t', 'uint32_t']);
	_setPropDataFn = lib.func('uint32_t', 'EdsSetPropertyData', ['void *', 'uint32_t', 'uint32_t', 'uint32_t', 'void *']);
	_getPropSizeFn = lib.func('uint32_t', 'EdsGetPropertySize', ['void *', 'uint32_t', 'uint32_t', 'void *', 'void *']);
	_getPropDataFn = lib.func('uint32_t', 'EdsGetPropertyData', ['void *', 'uint32_t', 'uint32_t', 'uint32_t', 'void *']);
	_createEvfRefFn = lib.func('uint32_t', 'EdsCreateEvfImageRef', ['void *', 'void *']);
	_downloadEvfFn = lib.func('uint32_t', 'EdsDownloadEvfImage', ['void *', 'void *']);
	_getLengthFn = lib.func('uint32_t', 'EdsGetLength', ['void *', 'void *']);
	_getPointerFn = lib.func('uint32_t', 'EdsGetPointer', ['void *', 'void *']);
	_createFileStreamFn = lib.func('uint32_t', 'EdsCreateFileStream', ['const char *', 'uint32_t', 'uint32_t', 'void *']);
	_downloadFn = lib.func('uint32_t', 'EdsDownload', ['void *', 'uint64_t', 'void *']);
	_downloadCompleteFn = lib.func('uint32_t', 'EdsDownloadComplete', ['void *']);
}

// ============================================================
// Helpers
// ============================================================

function check(err: number, label: string): void {
	if (err !== EDS_ERR_OK) {
		console.log(`[EDSDK] ${label} error: 0x${err.toString(16)}`);
	}
}

function allocRef(): Buffer { return Buffer.alloc(8); }
function readRef(buf: Buffer): number { return Number(buf.readBigUInt64LE(0)); }
function ptrNum(buf: Buffer): number { return readRef(buf); }

function readPointerFromMem(srcPtr: number, len: number): Buffer | null {
	if (!_memcpyFn || srcPtr === 0 || len === 0 || len > 50_000_000) return null;
	try {
		const dst = Buffer.alloc(len);
		_memcpyFn(dst, srcPtr, len);
		return dst;
	} catch {
		return null;
	}
}

// ============================================================
// Driver
// ============================================================

export class EdsdkDriver implements CameraDriver {
	readonly name = 'Canon EOS (EDSDK)';
	private _camera: Buffer | null = null;
	private _evfRef: Buffer | null = null;
	private _model = '';
	private _livePump: ReturnType<typeof setInterval> | null = null;
	private _moviePath: string;
	private _photoPath: string;

	constructor() {
		const tmp = tmpdir();
		this._moviePath = join(tmp, 'potobut-evf.jpg');
		this._photoPath = join(tmp, 'potobut-photo.jpg');
	}

	// ─── detect ────────────────────────────────────────────

	async detect(): Promise<boolean> {
		try { resolveFns(); } catch (e) {
			console.log('[EDSDK] DLL not found:', EDSDK_PATH);
			return false;
		}

		const err = _initFn!();
		if (err !== EDS_ERR_OK) {
			console.log('[EDSDK] Init error: 0x' + err.toString(16));
			return false;
		}

		const listRef = allocRef();
		if (_getCamListFn!(listRef) !== EDS_ERR_OK) {
			_termFn!();
			return false;
		}

		const countRef = allocRef();
		if (_getChildCountFn!(listRef, countRef) !== EDS_ERR_OK) {
			_releaseFn!(listRef);
			_termFn!();
			return false;
		}

		const count = readRef(countRef);
		if (count === 0) {
			_releaseFn!(listRef);
			_termFn!();
			return false;
		}

		const camRef = allocRef();
		if (_getChildAtIndexFn!(listRef, 0, camRef) !== EDS_ERR_OK) {
			_releaseFn!(listRef);
			_termFn!();
			return false;
		}

		// Get device info
		const infoBuf = Buffer.alloc(512);
		_getDeviceInfoFn!(camRef, infoBuf);
		const model = infoBuf.toString('utf16le', 128, 256).replace(/\0/g, '').trim();
		this._model = model || 'Canon EOS';
		this._camera = camRef;

		_releaseFn!(listRef);
		console.log('[EDSDK] Detected:', this._model);
		return true;
	}

	// ─── connect ───────────────────────────────────────────

	async connect(): Promise<boolean> {
		if (!this._camera) return false;
		if (_openSessionFn!(this._camera) !== EDS_ERR_OK) {
			console.log('[EDSDK] OpenSession failed');
			return false;
		}
		console.log('[EDSDK] Session opened');

		// Apply settings
		this._setConfig(ISO, 400);
		this._setConfig(APERTURE, 56); // 5.6 → 56 in EDSDK units
		this._setConfig(SHUTTER_SPEED, 125); // 1/125 → 125
		this._setConfig(WHITE_BALANCE, 4); // Flash

		// Create EVF ref for live view
		const evfRef = allocRef();
		if (_createEvfRefFn!(this._camera, evfRef) !== EDS_ERR_OK) {
			console.log('[EDSDK] CreateEvfImageRef failed');
			return true; // connected but no live view
		}
		this._evfRef = evfRef;
		return true;
	}

	private _setConfig(prop: number, value: number): void {
		if (!this._camera) return;
		const size = 4;
		const data = Buffer.alloc(size);
		data.writeInt32LE(value, 0);
		_setPropDataFn!(this._camera, prop, 0, size, data);
	}

	// ─── disconnect ────────────────────────────────────────

	async disconnect(): Promise<void> {
		if (this._evfRef) { _releaseFn!(this._evfRef); this._evfRef = null; }
		if (this._camera) {
			_closeSessionFn!(this._camera);
			_releaseFn!(this._camera);
			this._camera = null;
		}
		_termFn!();
		console.log('[EDSDK] Disconnected');
	}

	// ─── live feed ─────────────────────────────────────────

	startLiveFeed(onFrame: (buf: Buffer) => void): boolean {
		if (!this._camera || !this._evfRef) return false;

		// Enable EVF mode
		const val = Buffer.alloc(4);
		val.writeInt32LE(1, 0);
		_setPropDataFn!(this._camera, EVF_MODE, 0, 4, val);

		const cam = this._camera;
		const evf = this._evfRef;
		let frameCount = 0;

		this._livePump = setInterval(() => {
			try {
				if (_downloadEvfFn!(cam, evf) !== EDS_ERR_OK) return;

				const lenBuf = Buffer.alloc(8);
				if (_getLengthFn!(evf, lenBuf) !== EDS_ERR_OK) return;
				const jpegLen = Number(lenBuf.readBigUInt64LE(0));

				if (jpegLen < 500 || jpegLen > 10_000_000) return;

				const ptrBuf = Buffer.alloc(8);
				if (_getPointerFn!(evf, ptrBuf) !== EDS_ERR_OK) return;
				const srcAddr = Number(ptrBuf.readBigUInt64LE(0));

				const jpeg = readPointerFromMem(srcAddr, jpegLen);
				if (jpeg) {
					if (frameCount < 2) {
						console.log('[EDSDK] EVF frame OK, size:', jpeg.length);
						frameCount++;
					}
					onFrame(jpeg);
				}
			} catch {
				// skip frame
			}
		}, 50); // ~20fps target (50ms interval)

		console.log('[EDSDK] Live feed started');
		return true;
	}

	async stopLiveFeed(): Promise<void> {
		if (this._livePump) {
			clearInterval(this._livePump);
			this._livePump = null;
		}

		// Disable EVF mode
		if (this._camera) {
			const val = Buffer.alloc(4);
			val.writeInt32LE(0, 0);
			_setPropDataFn!(this._camera, EVF_MODE, 0, 4, val);
		}

		console.log('[EDSDK] Live feed stopped');
	}

	// ─── capture ───────────────────────────────────────────

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._camera) return null;

		console.log('[EDSDK] Capturing photo...');

		// Focus first
		_sendCommandFn!(this._camera, PRESS_HALFWAY, 0);
		await new Promise(r => setTimeout(r, 500));

		// Take picture
		const err = _sendCommandFn!(this._camera, TAKE_PICTURE, 0);
		_sendCommandFn!(this._camera, PRESS_HALFWAY, 2); // release

		if (err !== EDS_ERR_OK) {
			console.log('[EDSDK] TakePicture error: 0x' + err.toString(16));
			return null;
		}

		// Wait for camera to process
		await new Promise(r => setTimeout(r, 3000));

		// Download latest image from camera storage
		return this._downloadLatest();
	}

	private _downloadLatest(): ArrayBuffer | null {
		if (!this._camera) return null;

		const streamRef = allocRef();
		if (_createFileStreamFn!(this._photoPath, CREATE_ALWAYS, ACCESS_WRITE, streamRef)
			!== EDS_ERR_OK) {
			console.log('[EDSDK] CreateFileStream failed');
			return null;
		}

		// Enumerate camera directory to find latest image
		const dcim = allocRef();
		// Camera root has children (DCIM folders, etc.)
		// Simplified: find first DCIM child, then first image
		const childCount = allocRef();
		if (_getChildCountFn!(this._camera, childCount) !== EDS_ERR_OK) {
			_releaseFn!(streamRef);
			return null;
		}
		const count = readRef(childCount);
		if (count === 0) { _releaseFn!(streamRef); return null; }

		for (let i = count - 1; i >= 0; i--) {
			const folder = allocRef();
			if (_getChildAtIndexFn!(this._camera, i, folder) !== EDS_ERR_OK) continue;

			const itemCount = allocRef();
			if (_getChildCountFn!(folder, itemCount) !== EDS_ERR_OK) { _releaseFn!(folder); continue; }
			const icount = readRef(itemCount);
			if (icount === 0) { _releaseFn!(folder); continue; }

			// Get last image in this folder
			const item = allocRef();
			if (_getChildAtIndexFn!(folder, icount - 1, item) === EDS_ERR_OK) {
				_downloadFn!(item, 0xFFFFFFFF, streamRef);
				_downloadCompleteFn!(item);
				_releaseFn!(item);
				_releaseFn!(folder);
				_releaseFn!(streamRef);

				// Read downloaded file
				if (!existsSync(this._photoPath)) return null;
				const buf = readFileSync(this._photoPath);
				try { unlinkSync(this._photoPath); } catch { /* */ }
				console.log('[EDSDK] Photo downloaded, size:', buf.length);
				const ab = new ArrayBuffer(buf.length);
				new Uint8Array(ab).set(buf);
				return ab;
			}
			_releaseFn!(folder);
		}

		_releaseFn!(streamRef);
		return null;
	}
}
