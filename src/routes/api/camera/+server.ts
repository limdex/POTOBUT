import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCameraStatus, connectCamera, disconnectCamera } from '$lib/server/camera';

export const GET: RequestHandler = async () => {
	const status = getCameraStatus();
	console.log('[CAMERA] Status check:', status);
	return json(status);
};

export const POST: RequestHandler = async () => {
	console.log('[CAMERA] Connecting...');
	const result = await connectCamera();
	console.log('[CAMERA] Connect result:', result);
	return json(result);
};

export const DELETE: RequestHandler = async () => {
	console.log('[CAMERA] Disconnecting...');
	const result = disconnectCamera();
	console.log('[CAMERA] Disconnect result:', result);
	return json(result);
};
