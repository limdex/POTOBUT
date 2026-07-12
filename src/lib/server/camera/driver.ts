import type { ChildProcess } from 'child_process';

export interface CameraDriver {
	readonly name: string;
	detect(): Promise<boolean>;
	connect(): Promise<boolean>;
	disconnect(): Promise<void>;
	capturePhoto(): Promise<ArrayBuffer | null>;
	startLiveFeed(): ChildProcess | null;
	stopLiveFeed(): Promise<void>;
}
