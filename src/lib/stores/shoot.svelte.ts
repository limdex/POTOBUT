export interface CapturedPhoto {
	id: number;
	data: string;
}

let _capturedPhotos = $state<CapturedPhoto[]>([]);

export const shootState = {
	get capturedPhotos() { return _capturedPhotos; },

	addPhoto(data: string) {
		_capturedPhotos = [..._capturedPhotos, { id: _capturedPhotos.length + 1, data }];
	},

	reset() {
		_capturedPhotos = [];
	}
};
