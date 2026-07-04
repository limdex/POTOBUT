export interface CameraDriver {
	readonly name: string;
	detect(): Promise<boolean>;
	connect(): Promise<boolean>;
	disconnect(): Promise<void>;
	capturePreview(): Promise<ArrayBuffer | null>;
	capturePhoto(): Promise<ArrayBuffer | null>;
}

