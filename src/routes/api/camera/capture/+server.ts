import { json } from '@sveltejs/kit';
import sharp from 'sharp';
import type { RequestHandler } from './$types';
import { capturePhoto, getCameraStatus } from '$lib/server/camera';

export const POST: RequestHandler = async () => {
	const buf = await capturePhoto();
	if (!buf) {
		const status = getCameraStatus();
		const error = status.error || (status.connected ? 'Camera did not return an image' : 'Camera not connected');
		return json({ ok: false, error }, { status: 503 });
	}

	const resized = await sharp(Buffer.from(buf))
		.rotate()
		.resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();

	return new Response(new Uint8Array(resized), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Cache-Control': 'no-cache, no-store, must-revalidate'
		}
	});
};
