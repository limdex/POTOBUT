import type { RequestHandler } from './$types';
import { capturePreview } from '$lib/server/camera';

export const GET: RequestHandler = async () => {
	console.log('[CAMERA] Preview frame requested');
	const buf = await capturePreview();
	if (!buf) {
		console.log('[CAMERA] Preview failed: no frame available');
		return new Response('No preview available', { status: 503 });
	}
	return new Response(buf, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
