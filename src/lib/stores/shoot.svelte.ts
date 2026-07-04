export interface CapturedPhoto {
	id: number;
	data: string;
}

const STORAGE_KEY = 'potobut-shoot';

function loadFromStorage(): CapturedPhoto[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

function saveToStorage(photos: CapturedPhoto[]) {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
	} catch {
		/* quota exceeded, ignore */
	}
}

let _capturedPhotos = $state<CapturedPhoto[]>(loadFromStorage());

export const shootState = {
	get capturedPhotos() { return _capturedPhotos; },

	addPhoto(data: string) {
		const next = [..._capturedPhotos, { id: _capturedPhotos.length + 1, data }];
		_capturedPhotos = next;
		saveToStorage(next);
	},

	reset() {
		_capturedPhotos = [];
		sessionStorage.removeItem(STORAGE_KEY);
	}
};
