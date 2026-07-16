import { load as koffiLoad } from 'koffi';
import type { LibraryHandle } from 'koffi';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CameraDriver } from './driver';

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

// ============================================================
// Driver
// ============================================================

export class EdsdkDriver implements CameraDriver {
	private _dllPath: string;
	private _edsdk: LibraryHandle | null = null;
	private _memcpyFn: ((dst: Buffer, src: number, len: number) => void) | null = null;
	private _label: string;

	// EDSDK function pointers
	private _initFn: (() => number) | null = null;
	private _termFn: (() => number) | null = null;
	private _getCamListFn: ((out: Buffer) => number) | null = null;
	private _getChildCountFn: ((ref: Buffer, out: Buffer) => number) | null = null;
	private _getChildAtIndexFn: ((ref: Buffer, idx: number, out: Buffer) => number) | null = null;
	private _getDeviceInfoFn: ((ref: Buffer, out: Buffer) => number) | null = null;
	private _openSessionFn: ((ref: Buffer) => number) | null = null;
	private _closeSessionFn: ((ref: Buffer) => number) | null = null;
	private _releaseFn: ((ref: Buffer) => number) | null = null;
	private _sendCommandFn: ((ref: Buffer, cmd: number, param: number) => number) | null = null;
	private _setPropDataFn: ((ref: Buffer, prop: number, p: number, size: number, data: Buffer) => number) | null = null;
	private _getPropSizeFn: ((ref: Buffer, prop: number, p: number, outType: Buffer, outSize: Buffer) => number) | null = null;
	private _getPropDataFn: ((ref: Buffer, prop: number, p: number, size: number, out: Buffer) => number) | null = null;
	private _createEvfRefFn: ((cam: Buffer, out: Buffer) => number) | null = null;
	private _downloadEvfFn: ((cam: Buffer, evf: Buffer) => number) | null = null;
	private _getLengthFn: ((ref: Buffer, out: Buffer) => number) | null = null;
	private _getPointerFn: ((ref: Buffer, out: Buffer) => number) | null = null;
	private _createFileStreamFn: ((path: string, disp: number, access: number, out: Buffer) => number) | null = null;
	private _downloadFn: ((item: Buffer, size: number, stream: Buffer) => number) | null = null;
	private _downloadCompleteFn: ((item: Buffer) => number) | null = null;

	readonly name: string;
	private _camera: Buffer | null = null;
	private _evfRef: Buffer | null = null;
	private _model = '';
	private _livePump: ReturnType<typeof setInterval> | null = null;
	private _moviePath: string;
	private _photoPath: string;

	constructor(dllPath: string, label: string) {
		this._dllPath = dllPath;
		this._label = label;
		this.name = `Canon EOS EDSDK (${label})`;
		const tmp = tmpdir();
		this._moviePath = join(tmp, `potobut-evf-${label}.jpg`);
		this._photoPath = join(tmp, `potobut-photo-${label}.jpg`);
	}

	// ─── DLL loading ────────────────────────────────────────

	private _ensureLoaded(): void {
		if (this._edsdk) return;
		this._edsdk = koffiLoad(this._dllPath);
		const ucrt = koffiLoad('ucrtbase.dll');
		this._memcpyFn = ucrt.func('void *memcpy(void *dst, void *src, uint64_t len)') as any;
	}

	private _resolveFns(): void {
		this._ensureLoaded();
		const lib = this._edsdk!;

		this._initFn = lib.func('uint32_t EdsInitializeSDK()');
		this._termFn = lib.func('uint32_t EdsTerminateSDK()');
		this._getCamListFn = lib.func('uint32_t EdsGetCameraList(void *out)');
		this._getChildCountFn = lib.func('uint32_t EdsGetChildCount(void *ref, void *out)');
		this._getChildAtIndexFn = lib.func('uint32_t EdsGetChildAtIndex(void *ref, int32_t idx, void *out)');
		this._getDeviceInfoFn = lib.func('uint32_t EdsGetDeviceInfo(void *ref, void *out)');
		this._openSessionFn = lib.func('uint32_t EdsOpenSession(void *ref)');
		this._closeSessionFn = lib.func('uint32_t EdsCloseSession(void *ref)');
		this._releaseFn = lib.func('uint32_t EdsRelease(void *ref)');
		this._sendCommandFn = lib.func('uint32_t EdsSendCommand(void *ref, uint32_t cmd, uint32_t param)');
		this._setPropDataFn = lib.func('uint32_t EdsSetPropertyData(void *ref, uint32_t prop, uint32_t p, uint32_t size, void *data)');
		this._getPropSizeFn = lib.func('uint32_t EdsGetPropertySize(void *ref, uint32_t prop, uint32_t p, void *outType, void *outSize)');
		this._getPropDataFn = lib.func('uint32_t EdsGetPropertyData(void *ref, uint32_t prop, uint32_t p, uint32_t size, void *out)');
		this._createEvfRefFn = lib.func('uint32_t EdsCreateEvfImageRef(void *ref, void *out)');
		this._downloadEvfFn = lib.func('uint32_t EdsDownloadEvfImage(void *ref, void *evf)');
		this._getLengthFn = lib.func('uint32_t EdsGetLength(void *ref, void *out)');
		this._getPointerFn = lib.func('uint32_t EdsGetPointer(void *ref, void *out)');
		this._createFileStreamFn = lib.func('uint32_t EdsCreateFileStream(const char *path, uint32_t disp, uint32_t access, void *out)');
		this._downloadFn = lib.func('uint32_t EdsDownload(void *item, uint64_t size, void *stream)');
		this._downloadCompleteFn = lib.func('uint32_t EdsDownloadComplete(void *item)');
	}

	private _readPointerFromMem(srcPtr: number, len: number): Buffer | null {
		if (!this._memcpyFn || srcPtr === 0 || len === 0 || len > 50_000_000) return null;
		try {
			const dst = Buffer.alloc(len);
			this._memcpyFn(dst, srcPtr, len);
			return dst;
		} catch {
			return null;
		}
	}

	// ─── detect ────────────────────────────────────────────

	async detect(): Promise<boolean> {
		try { this._resolveFns(); } catch (e) {
			console.log(`[EDSDK] ${this._label}: DLL not found at`, this._dllPath);
			return false;
		}

		const err = this._initFn!();
		if (err !== EDS_ERR_OK) {
			console.log(`[EDSDK] ${this._label}: Init error: 0x${err.toString(16)}`);
			return false;
		}

		const listRef = allocRef();
		if (this._getCamListFn!(listRef) !== EDS_ERR_OK) {
			this._termFn!();
			return false;
		}

		const countRef = allocRef();
		if (this._getChildCountFn!(listRef, countRef) !== EDS_ERR_OK) {
			this._releaseFn!(listRef);
			this._termFn!();
			return false;
		}

		const count = readRef(countRef);
		if (count === 0) {
			this._releaseFn!(listRef);
			this._termFn!();
			return false;
		}

		const camRef = allocRef();
		if (this._getChildAtIndexFn!(listRef, 0, camRef) !== EDS_ERR_OK) {
			this._releaseFn!(listRef);
			this._termFn!();
			return false;
		}

		const infoBuf = Buffer.alloc(512);
		this._getDeviceInfoFn!(camRef, infoBuf);
		const model = infoBuf.toString('utf16le', 128, 256).replace(/\0/g, '').trim();
		this._model = model || 'Canon EOS';
		this._camera = camRef;

		this._releaseFn!(listRef);
		console.log(`[EDSDK] ${this._label}: Detected ${this._model}`);
		return true;
	}

	// ─── connect ───────────────────────────────────────────

	async connect(): Promise<boolean> {
		if (!this._camera) return false;
		if (this._openSessionFn!(this._camera) !== EDS_ERR_OK) {
			console.log(`[EDSDK] ${this._label}: OpenSession failed`);
			return false;
		}
		console.log(`[EDSDK] ${this._label}: Session opened`);

		this._setConfig(ISO, 0x53); // kEdsISOSpeed_400
		this._setConfig(APERTURE, 56); // 5.6 → 56 in EDSDK units
		this._setConfig(SHUTTER_SPEED, 125); // 1/125 → 125
		this._setConfig(WHITE_BALANCE, 4); // Flash

		const evfRef = allocRef();
		if (this._createEvfRefFn!(this._camera, evfRef) !== EDS_ERR_OK) {
			console.log(`[EDSDK] ${this._label}: CreateEvfImageRef failed`);
			return true;
		}
		this._evfRef = evfRef;
		return true;
	}

	private _setConfig(prop: number, value: number): void {
		if (!this._camera) return;
		const size = 4;
		const data = Buffer.alloc(size);
		data.writeInt32LE(value, 0);
		this._setPropDataFn!(this._camera, prop, 0, size, data);
	}

	// ─── disconnect ────────────────────────────────────────

	async disconnect(): Promise<void> {
		if (this._evfRef) { this._releaseFn!(this._evfRef); this._evfRef = null; }
		if (this._camera) {
			this._closeSessionFn!(this._camera);
			this._releaseFn!(this._camera);
			this._camera = null;
		}
		this._termFn!();
		console.log(`[EDSDK] ${this._label}: Disconnected`);
	}

	// ─── live feed ─────────────────────────────────────────

	startLiveFeed(onFrame: (buf: Buffer) => void): boolean {
		if (!this._camera || !this._evfRef) return false;

		const val = Buffer.alloc(4);
		val.writeInt32LE(1, 0);
		this._setPropDataFn!(this._camera, EVF_MODE, 0, 4, val);

		const cam = this._camera;
		const evf = this._evfRef;
		let frameCount = 0;

		this._livePump = setInterval(() => {
			try {
				if (this._downloadEvfFn!(cam, evf) !== EDS_ERR_OK) return;

				const lenBuf = Buffer.alloc(8);
				if (this._getLengthFn!(evf, lenBuf) !== EDS_ERR_OK) return;
				const jpegLen = Number(lenBuf.readBigUInt64LE(0));

				if (jpegLen < 500 || jpegLen > 10_000_000) return;

				const ptrBuf = Buffer.alloc(8);
				if (this._getPointerFn!(evf, ptrBuf) !== EDS_ERR_OK) return;
				const srcAddr = Number(ptrBuf.readBigUInt64LE(0));

				const jpeg = this._readPointerFromMem(srcAddr, jpegLen);
				if (jpeg) {
					if (frameCount < 2) {
						console.log(`[EDSDK] ${this._label}: EVF frame OK, size:`, jpeg.length);
						frameCount++;
					}
					onFrame(jpeg);
				}
			} catch {
				// skip frame
			}
		}, 50);

		console.log(`[EDSDK] ${this._label}: Live feed started`);
		return true;
	}

	async stopLiveFeed(): Promise<void> {
		if (this._livePump) {
			clearInterval(this._livePump);
			this._livePump = null;
		}

		if (this._camera) {
			const val = Buffer.alloc(4);
			val.writeInt32LE(0, 0);
			this._setPropDataFn!(this._camera, EVF_MODE, 0, 4, val);
		}

		console.log(`[EDSDK] ${this._label}: Live feed stopped`);
	}

	// ─── capture ───────────────────────────────────────────

	async capturePhoto(): Promise<ArrayBuffer | null> {
		if (!this._camera) return null;

		console.log(`[EDSDK] ${this._label}: Capturing photo...`);

		this._sendCommandFn!(this._camera, PRESS_HALFWAY, 0);
		await new Promise(r => setTimeout(r, 500));

		const err = this._sendCommandFn!(this._camera, TAKE_PICTURE, 0);
		this._sendCommandFn!(this._camera, PRESS_HALFWAY, 2);

		if (err !== EDS_ERR_OK) {
			console.log(`[EDSDK] ${this._label}: TakePicture error: 0x${err.toString(16)}`);
			return null;
		}

		await new Promise(r => setTimeout(r, 3000));
		return this._downloadLatest();
	}

	private _downloadLatest(): ArrayBuffer | null {
		if (!this._camera) return null;

		const streamRef = allocRef();
		if (this._createFileStreamFn!(this._photoPath, CREATE_ALWAYS, ACCESS_WRITE, streamRef)
			!== EDS_ERR_OK) {
			console.log(`[EDSDK] ${this._label}: CreateFileStream failed`);
			return null;
		}

		const dcim = allocRef();
		const childCount = allocRef();
		if (this._getChildCountFn!(this._camera, childCount) !== EDS_ERR_OK) {
			this._releaseFn!(streamRef);
			return null;
		}
		const count = readRef(childCount);
		if (count === 0) { this._releaseFn!(streamRef); return null; }

		for (let i = count - 1; i >= 0; i--) {
			const folder = allocRef();
			if (this._getChildAtIndexFn!(this._camera, i, folder) !== EDS_ERR_OK) continue;

			const itemCount = allocRef();
			if (this._getChildCountFn!(folder, itemCount) !== EDS_ERR_OK) { this._releaseFn!(folder); continue; }
			const icount = readRef(itemCount);
			if (icount === 0) { this._releaseFn!(folder); continue; }

			const item = allocRef();
			if (this._getChildAtIndexFn!(folder, icount - 1, item) === EDS_ERR_OK) {
				this._downloadFn!(item, 0xFFFFFFFF, streamRef);
				this._downloadCompleteFn!(item);
				this._releaseFn!(item);
				this._releaseFn!(folder);
				this._releaseFn!(streamRef);

				if (!existsSync(this._photoPath)) return null;
				const buf = readFileSync(this._photoPath);
				try { unlinkSync(this._photoPath); } catch { /* */ }
				console.log(`[EDSDK] ${this._label}: Photo downloaded, size:`, buf.length);
				const ab = new ArrayBuffer(buf.length);
				new Uint8Array(ab).set(buf);
				return ab;
			}
			this._releaseFn!(folder);
		}

		this._releaseFn!(streamRef);
		return null;
	}
}
