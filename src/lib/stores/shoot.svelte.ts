export interface CapturedPhoto {
	id: number;
	data: string;
}

const STORAGE_KEY = 'potobut-shoot-photos';

let _capturedPhotos = $state<CapturedPhoto[]>([]);

function saveToStorage() {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_capturedPhotos));
	} catch {}
}

function loadFromStorage(): CapturedPhoto[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

_capturedPhotos = loadFromStorage();

export const shootState = {
	get capturedPhotos() { return _capturedPhotos; },

	addPhoto(data: string) {
		_capturedPhotos = [..._capturedPhotos, { id: _capturedPhotos.length + 1, data }];
		saveToStorage();
	},

	reset() {
		_capturedPhotos = [];
		try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
	}
};
