import { json } from '@sveltejs/kit';
import sharp from 'sharp';
import type { RequestHandler } from './$types';
import { capturePhoto, getCameraStatus } from '$lib/server/camera';

export const POST: RequestHandler = async () => {
	console.log('[CAMERA] Capture requested');
	const buf = await capturePhoto();
	if (!buf) {
		const status = getCameraStatus();
		const error = status.error || (status.connected ? 'Camera did not return an image' : 'Camera not connected');
		console.log('[CAMERA] Capture failed:', error);
		return json({ ok: false, error }, { status: 503 });
	}

	console.log('[CAMERA] Capture success, raw size:', buf.byteLength, 'bytes');

	const resized = await sharp(Buffer.from(buf))
		.rotate()
		.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();

	console.log('[CAMERA] Resized:', resized.length, 'bytes');
	return new Response(new Uint8Array(resized), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
