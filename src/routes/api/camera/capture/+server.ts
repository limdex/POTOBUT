import { json } from '@sveltejs/kit';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';
import { capturePhoto, getCameraStatus } from '$lib/server/camera';

const SAVE_DIR = path.resolve('data', 'captures');

function pad(n: number) { return String(n).padStart(2, '0'); }

export const POST: RequestHandler = async () => {
	const buf = await capturePhoto();
	if (!buf) {
		const status = getCameraStatus();
		const error = status.error || (status.connected ? 'Camera did not return an image' : 'Camera not connected');
		return json({ ok: false, error }, { status: 503 });
	}

	fs.mkdirSync(SAVE_DIR, { recursive: true });
	const now = new Date();
	const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const savedPath = path.join(SAVE_DIR, `capture_${ts}.jpg`);
	fs.writeFileSync(savedPath, Buffer.from(buf));
	console.log(`[capture] saved original to ${savedPath}`);

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
