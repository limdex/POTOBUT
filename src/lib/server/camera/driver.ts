export interface CameraDriver {
	readonly name: string;
	detect(): Promise<boolean>;
	connect(): Promise<boolean>;
	disconnect(): Promise<void>;
	capturePhoto(): Promise<ArrayBuffer | null>;
	startLiveFeed(onFrame: (buf: Buffer) => void): boolean;
	stopLiveFeed(): Promise<void>;
}
