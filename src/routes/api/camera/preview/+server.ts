import type { RequestHandler } from './$types';
import { capturePreview } from '$lib/server/camera';

export const GET: RequestHandler = async () => {
	const buf = await capturePreview();
	if (!buf) {
		return new Response('No preview available', { status: 503 });
	}
	return new Response(buf, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
