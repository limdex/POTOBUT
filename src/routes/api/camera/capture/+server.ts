import type { RequestHandler } from './$types';
import { capturePhoto } from '$lib/server/camera';

export const POST: RequestHandler = async () => {
	console.log('[CAMERA] Capture requested');
	const buf = await capturePhoto();
	if (!buf) {
		console.log('[CAMERA] Capture failed: no photo captured');
		return new Response('No photo captured', { status: 503 });
	}
	console.log('[CAMERA] Capture success, size:', buf.byteLength, 'bytes');
	return new Response(buf, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
